/**
 * Touchline — Host half.
 *
 * Proxies one pluggable live-data source (default: ESPN's public soccer feeds)
 * through the DSH web server under one prefix (`/api/touchline/...`) with a
 * short in-memory cache and a stale-on-error fallback, so a brief upstream
 * hiccup never blanks a live match. The upstream is public but not
 * CORS-enabled, so the browser cannot call it directly.
 *
 * Sources live in `./host/sources/`; pick one with the row config
 * `{ source: 'espn' }` (see docs/data-sources.md).
 *
 * Replay files (`data/replay/*.json`, produced by the repo's scripts) are
 * served read-only so the window can play real per-frame tracking without any
 * provider call. Point `config.replayDir` elsewhere when the plugin is
 * installed outside this checkout.
 *
 * Routes are exact-path only; ids travel as `?id=` so the route table stays
 * flat and no prefix matching is involved.
 *
 * @module dsh-plugin-touchline
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSource, listSources } from './host/sources/index.js';

/** Mount prefix of this plugin's JSON API. */
export const API_PREFIX = '/api/touchline';

/** Dependency: the plugin is inert wherever no web server is composed. */
export const inject = ['webServer'];

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));

const SCOREBOARD_TTL_MS = 20_000;
const MATCH_TTL_MS = 4_000;


function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '');
}

/**
 * Cache one upstream read, coalescing concurrent callers. A failing refresh
 * keeps serving the previous value with `stale: true` instead of throwing.
 */
function createCache() {
  const cache = new Map();
  const inflight = new Map();
  let active = true;
  async function cached(key, ttl, loader) {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) {
      return { value: hit.value, cached: true, stale: false, fetchedAt: hit.fetchedAt };
    }
    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
      try {
        const value = await loader();
        const fetchedAt = new Date().toISOString();
        if (active) cache.set(key, { value, expires: Date.now() + ttl, fetchedAt });
        return { value, cached: false, stale: false, fetchedAt };
      } catch (error) {
        if (hit) {
          return {
            value: hit.value,
            cached: true,
            stale: true,
            fetchedAt: hit.fetchedAt,
            warning: error instanceof Error ? error.message : String(error),
          };
        }
        throw error;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }
  return { cached, dispose() { active = false; cache.clear(); inflight.clear(); } };
}

function sendJson(res, status, body, cacheControl = 'no-store') {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

function requestDate(req) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const raw = String(url.searchParams.get('date') || '');
    return /^\d{8}$/.test(raw) ? raw : todayKey();
  } catch {
    return todayKey();
  }
}

function requestMatchId(req) {
  try {
    return String(new URL(req.url ?? '/', 'http://localhost').searchParams.get('id') || '');
  } catch {
    return '';
  }
}

/** Only matches that are actually being played right now. */
async function serveLive(req, res, source, cached) {
  const date = requestDate(req);
  try {
    const result = await cached(`scoreboard:${date}`, SCOREBOARD_TTL_MS, () => source.getScoreboard(date));
    const matches = (result.value?.matches ?? []).filter((match) => match?.status?.state === 'in');
    sendJson(res, 200, {
      date,
      source: source.id,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      count: matches.length,
      matches,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[touchline] live', date, error?.message ?? error);
    sendJson(res, 502, {
      error: '无法连接赛事数据源',
      source: source.id,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Full board for one day: the fallback feed while an older host still lacks `/live`. */
async function serveScoreboard(req, res, source, cached) {
  const date = requestDate(req);
  try {
    const result = await cached(`scoreboard:${date}`, SCOREBOARD_TTL_MS, () => source.getScoreboard(date));
    sendJson(res, 200, {
      ...result.value,
      providerId: source.id,
      cached: result.cached,
      stale: result.stale,
      fetchedAt: result.fetchedAt,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[touchline] scoreboard', date, error?.message ?? error);
    sendJson(res, 502, {
      error: '无法连接赛事数据源',
      source: source.id,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function serveMatch(req, res, source, cached) {
  const id = requestMatchId(req);
  if (!/^\d{5,12}$/.test(id)) {
    sendJson(res, 400, { error: 'invalid match id' });
    return;
  }
  try {
    const result = await cached(`match:${id}`, MATCH_TTL_MS, () => source.getMatch(id));
    const state = result.value?.status?.state;
    sendJson(res, 200, {
      ...result.value,
      providerId: source.id,
      cached: result.cached,
      stale: result.stale,
      fetchedAt: result.fetchedAt,
      cacheTtl: state === 'in' ? 4 : 45,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[touchline] match', id, error?.message ?? error);
    sendJson(res, 502, {
      error: '无法载入比赛数据',
      source: source.id,
      detail: error instanceof Error ? error.message : String(error),
      matchId: id,
    });
  }
}

/** Where converted replay files live: `data/replay` beside this checkout. */
function resolveReplayDir(config) {
  if (typeof config?.replayDir === 'string' && config.replayDir.trim() !== '') {
    return path.resolve(config.replayDir);
  }
  return path.resolve(PLUGIN_DIR, '..', 'data', 'replay');
}

function queryParam(req, key) {
  try {
    return String(new URL(req.url ?? '/', 'http://localhost').searchParams.get(key) || '');
  } catch {
    return '';
  }
}

/** List replay files (read-only, no provider traffic). */
async function serveReplayList(res, dir) {
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
    const replays = [];
    for (const name of names) {
      try {
        const data = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
        replays.push({
          id: name.replace(/\.json$/, ''),
          title: typeof data.title === 'string' ? data.title : name,
          duration: Number(data.duration) || 0,
          fps: Number(data.fps) || 0,
          hasBall: Boolean(data.hasBall),
        });
      } catch {
        /* skip a malformed file rather than failing the list */
      }
    }
    replays.sort((a, b) => a.title.localeCompare(b.title));
    sendJson(res, 200, { replays });
  } catch {
    sendJson(res, 200, { replays: [] });
  }
}

/** Stream one replay JSON from the replay directory. */
async function serveReplay(req, res, dir) {
  const id = queryParam(req, 'id');
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    sendJson(res, 400, { error: 'invalid replay id' });
    return;
  }
  const file = path.resolve(dir, `${id}.json`);
  if (!file.startsWith(dir + path.sep)) {
    sendJson(res, 400, { error: 'invalid replay id' });
    return;
  }
  try {
    const text = await readFile(file, 'utf8');
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(text);
  } catch {
    sendJson(res, 404, { error: 'replay not found', id });
  }
}

/** Register the JSON routes for as long as this plugin row lives. */
export function apply(ctx, config = {}) {
  const requested = typeof config?.source === 'string' ? config.source : undefined;
  const source = getSource(requested);
  if (requested && requested !== source.id) {
    console.warn(`[touchline] unknown source "${requested}", falling back to ${source.id}`);
  }

  const replayDir = resolveReplayDir(config);
  const requestCache = createCache();

  const routes = [
    {
      kind: 'exact',
      path: `${API_PREFIX}/health`,
      handler: (req, res) => {
        sendJson(res, 200, {
          ok: true,
          service: 'touchline',
          source: source.id,
          capabilities: source.capabilities ?? { coordinates: false },
          replays: replayDir,
          time: new Date().toISOString(),
        });
      },
    },
    { kind: 'exact', path: `${API_PREFIX}/sources`, handler: (req, res) => sendJson(res, 200, { sources: listSources() }) },
    { kind: 'exact', path: `${API_PREFIX}/live`, handler: (req, res) => serveLive(req, res, source, requestCache.cached) },
    { kind: 'exact', path: `${API_PREFIX}/scoreboard`, handler: (req, res) => serveScoreboard(req, res, source, requestCache.cached) },
    { kind: 'exact', path: `${API_PREFIX}/match`, handler: (req, res) => serveMatch(req, res, source, requestCache.cached) },
    { kind: 'exact', path: `${API_PREFIX}/replays`, handler: (req, res) => serveReplayList(res, replayDir) },
    { kind: 'exact', path: `${API_PREFIX}/replay`, handler: (req, res) => serveReplay(req, res, replayDir) },
  ];

  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route));
    return () => {
      requestCache.dispose();
      for (const dispose of disposers.splice(0)) dispose();
    };
  });
}

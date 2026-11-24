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
import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSource, listSources } from './host/sources/index.js';

/** Mount prefix of this plugin's JSON API. */
export const API_PREFIX = '/api/touchline';

/** Dependency: the plugin is inert wherever no web server is composed. */
export const inject = ['webServer', 'connection'];

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

// Our converter writes metadata before the large frames array. Older files
// can have any field order and still use the full JSON reader.
async function readReplayHeader(filename, size) {
  const file = await open(filename, 'r');
  try {
    const buffer = Buffer.alloc(16384);
    const { bytesRead } = await file.read(buffer);
    const prefix = buffer.toString('utf8', 0, bytesRead);
    if (bytesRead < size) {
      const frames = /,\s*"frames"\s*:\s*\[/.exec(prefix);
      if (frames) {
        try {
          const header = JSON.parse(prefix.slice(0, frames.index) + '}');
          if (typeof header.title === 'string' && typeof header.duration === 'number' &&
              typeof header.hasBall === 'boolean' && header.fps > 0 && header.teams?.length === 2 &&
              Array.isArray(header.players)) return header;
        } catch { /* Fall back for a nested key or a larger header. */ }
      }
    }
    const data = JSON.parse(bytesRead === size ? prefix : await readFile(filename, 'utf8'));
    if (!Array.isArray(data.frames) || !data.frames.length || !Array.isArray(data.players) ||
        data.teams?.length !== 2 || !(data.fps > 0)) throw new Error('invalid replay');
    return data;
  } finally {
    await file.close();
  }
}

function createReplayList(dir, configured) {
  const metadata = new Map();
  let pending;

  async function scan() {
    let names;
    try {
      names = (await readdir(dir, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name);
    } catch (error) {
      metadata.clear();
      return { replays: [], warning: error.code === 'ENOENT' && !configured ? '' : '无法读取回放目录，请检查插件的 replayDir 路径和读取权限。' };
    }
    const present = new Set(names);
    for (const key of metadata.keys()) if (!present.has(key)) metadata.delete(key);
    const replays = [];
    let invalid = 0;
    for (const name of names) {
      try {
        const filename = path.join(dir, name);
        const info = await stat(filename);
        const signature = [info.ino, info.size, info.mtimeMs, info.ctimeMs].join('/');
        let cached = metadata.get(name);
        if (cached?.signature !== signature) {
          try {
            const data = await readReplayHeader(filename, info.size);
            cached = { signature, entry: { id: name.slice(0, -5), title: typeof data.title === 'string' ? data.title : name,
              duration: Number(data.duration) || 0, fps: Number(data.fps), hasBall: Boolean(data.hasBall) } };
          } catch (error) {
            if (!(error instanceof SyntaxError || error.message === 'invalid replay')) throw error;
            cached = { signature, entry: null };
          }
          metadata.set(name, cached);
        }
        if (cached.entry) replays.push(cached.entry);
        else invalid++;
      } catch {
        metadata.delete(name);
        invalid++;
      }
    }
    replays.sort((a, b) => a.title.localeCompare(b.title));
    return { replays, warning: invalid ? `${invalid} 个回放文件损坏或无法读取，请重新转换文件后打开菜单。` : '' };
  }
  return () => pending ??= scan().finally(() => { pending = undefined; });
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
  const listReplays = createReplayList(replayDir, Boolean(config.replayDir?.trim?.()));

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
          time: new Date().toISOString(),
        });
      },
    },
    { kind: 'exact', path: `${API_PREFIX}/sources`, handler: (req, res) => sendJson(res, 200, { sources: listSources() }) },
    { kind: 'exact', path: `${API_PREFIX}/live`, handler: (req, res) => serveLive(req, res, source, requestCache.cached) },
    { kind: 'exact', path: `${API_PREFIX}/scoreboard`, handler: (req, res) => serveScoreboard(req, res, source, requestCache.cached) },
    { kind: 'exact', path: `${API_PREFIX}/match`, handler: (req, res) => serveMatch(req, res, source, requestCache.cached) },
    { kind: 'exact', path: `${API_PREFIX}/replays`, handler: async (req, res) => sendJson(res, 200, await listReplays()) },
    { kind: 'exact', path: `${API_PREFIX}/replay`, handler: (req, res) => serveReplay(req, res, replayDir) },
  ];

  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register({
      ...route,
      auth: 'required',
      handler: (req, res, peer) => {
        // Current WebServer supplies its authenticated peer. Earlier hosts
        // delegate the same decision to Connection.admit in the handler.
        let admission;
        try { admission = peer === undefined ? ctx.connection?.admit?.(req) : { peer }; } catch { /* fail closed */ }
        if (!admission || 'rejection' in admission || admission.peer?.principal?.kind !== 'owner') {
          const status = admission?.rejection === 401 ? 401 : 403;
          return sendJson(res, status, { error: status === 401 ? 'unauthorized' : 'forbidden' });
        }
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
        return route.handler(req, res);
      },
    }));
    return () => {
      requestCache.dispose();
      for (const dispose of disposers.splice(0)) dispose();
    };
  });
}

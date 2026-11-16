import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getMatch, getScoreboard } from './espn.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(compression({ threshold: 1024 }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

const cache = new Map();
const inflight = new Map();

async function cached(key, ttl, loader) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return { value: hit.value, cached: true, stale: false, fetchedAt: hit.fetchedAt };
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await loader();
      const fetchedAt = new Date().toISOString();
      cache.set(key, { value, expires: Date.now() + ttl, fetchedAt });
      return { value, cached: false, stale: false, fetchedAt };
    } catch (error) {
      if (hit) {
        return {
          value: hit.value,
          cached: true,
          stale: true,
          fetchedAt: hit.fetchedAt,
          warning: error.message || 'Upstream unavailable',
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'touchline', time: new Date().toISOString() });
});

app.get('/api/scoreboard', async (req, res) => {
  const date = String(req.query.date || todayKey());
  if (!/^\d{8}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYYMMDD' });
  }
  try {
    const result = await cached(`scoreboard:${date}`, 20_000, () => getScoreboard(date));
    res.setHeader('Cache-Control', 'public, max-age=8');
    return res.json({
      ...result.value,
      cached: result.cached,
      stale: result.stale,
      fetchedAt: result.fetchedAt,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[scoreboard]', error.message);
    return res.status(502).json({
      error: '无法连接赛事数据源',
      detail: error.message,
      hint: '请确认网络可访问 site.api.espn.com',
    });
  }
});

async function serveMatch(id, res) {
  if (!/^\d{5,12}$/.test(id)) {
    return res.status(400).json({ error: 'invalid match id' });
  }
  try {
    const result = await cached(`match:${id}`, 9_000, () => getMatch(id));
    const state = result.value?.status?.state;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ...result.value,
      cached: result.cached,
      stale: result.stale,
      fetchedAt: result.fetchedAt,
      cacheTtl: state === 'in' ? 9 : 45,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[match]', id, error.message);
    return res.status(502).json({
      error: '无法载入比赛数据',
      detail: error.message,
      matchId: id,
    });
  }
}

app.get('/api/match', (req, res) => serveMatch(String(req.query.id || ''), res));
app.get('/api/match/:id', (req, res) => serveMatch(String(req.params.id || ''), res));

/* ---------------------------------------------------------------- replay */

const replayDir = path.join(root, 'data', 'replay');
const publicDir = path.join(root, 'public');

app.get('/api/replay/list', async (req, res) => {
  try {
    const names = (await fs.promises.readdir(replayDir)).filter((name) => name.endsWith('.json'));
    const replays = [];
    for (const name of names) {
      try {
        const data = JSON.parse(await fs.promises.readFile(path.join(replayDir, name), 'utf8'));
        replays.push({
          id: name.replace(/\.json$/, ''),
          title: data.title ?? name,
          duration: Number(data.duration) || 0,
          fps: Number(data.fps) || 0,
          hasBall: Boolean(data.hasBall),
        });
      } catch {
        /* skip a malformed file rather than failing the whole list */
      }
    }
    replays.sort((a, b) => a.title.localeCompare(b.title));
    res.json({ replays });
  } catch {
    res.json({ replays: [] });
  }
});

app.use('/data/replay', express.static(replayDir, { maxAge: '1h' }));
app.get('/replay', (req, res) => res.sendFile(path.join(publicDir, 'replay.html')));
app.use('/replay', express.static(publicDir, { maxAge: '5m' }));

const dist = path.join(root, 'dist', 'debug');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'not found', path: req.path });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('[server]', error);
  return res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Touchline API on http://${HOST}:${PORT}`);
  console.log(`Data source: ESPN public soccer feeds (no API key)`);
});

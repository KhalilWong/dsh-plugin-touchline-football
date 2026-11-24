import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: readFileSync('plugin/src/skin.tsx', 'utf8') + '\nexport { LiveFeed, view, playback, createReplayMatch, keyMoments, liveQuality };',
    resolveDir: fileURLToPath(new URL('../plugin/src/', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
  loader: { '.css': 'text' }, external: ['react', 'react/jsx-runtime'],
});
const fixture = {
  id: 'demo', title: 'Demo', source: 'synthetic', fps: 1, duration: 1, hasBall: true,
  teams: [{ id: 'h', name: 'Home', abbr: 'H', color: '#ff0000' },
    { id: 'a', name: 'Away', abbr: 'A', color: '#0000ff' }],
  players: Array.from({ length: 22 }, (_, i) => ({ id: String(i), name: String(i), jersey: String(i + 1), teamId: i < 11 ? 'h' : 'a' })),
  frames: Array(46).fill(50),
};
function setup() {
  const requests = [], timers = new Map(); let serial = 0;
  const context = vm.createContext({
    module: { exports: {} }, require: createRequire(import.meta.url), console, AbortController, AbortSignal,
    window: { localStorage: { getItem: () => null },
      setTimeout: (fn) => { timers.set(++serial, fn); return serial; },
      clearTimeout: (id) => timers.delete(id) },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, signal: options.signal, reply: data => resolve({ ok: true, json: async () => data }) })),
  });
  vm.runInContext(result.outputFiles[0].text, context);
  const api = context.module.exports;
  return { ...api, feed: new api.LiveFeed(), requests, timers };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('live clock and corrected score reach the capsule without a canvas frame', async () => {
  const s = setup();
  const match = s.createReplayMatch({ ...fixture, id: '123456' });
  s.feed.select(match.id);
  s.requests[0].reply(match);
  await flush();
  // The window published its last frame before the user closed it.
  s.view.snapshot = s.feed.engine.snapshot();
  const poll = [...s.timers.values()][0];
  poll();
  s.requests[1].reply({
    ...match, home: { ...match.home, score: 1 },
    status: { ...match.status, displayClock: "45'+8'" },
  });
  await flush();
  assert.equal(s.view.snapshot.clockLabel, "45'+8'");
  assert.equal(s.view.snapshot.score.home, 1);
  s.feed.dispose();
});

test('late live response cannot overwrite replay or restart live polling', async () => {
  const s = setup(); s.feed.select('123456');
  const pending = s.feed.playReplay('demo');
  s.requests[1].reply(fixture); await pending;
  const engine = s.feed.engine;
  s.requests[0].reply({ id: 'old' }); await flush();
  assert.equal(s.view.mode, 'replay'); assert.equal(s.view.match, null);
  assert.equal(s.feed.engine, engine); assert.equal(s.timers.size, 0);
});

test('last replay selection wins when responses arrive out of order', async () => {
  const s = setup(); const first = s.feed.playReplay('first'); const second = s.feed.playReplay('second');
  assert.equal(s.requests[0].signal.aborted, true);
  s.requests[1].reply({ ...fixture, title: 'Second' }); await second;
  s.requests[0].reply({ ...fixture, title: 'First' }); await first;
  assert.equal(s.view.replayTitle, 'Second');
});

test('a damaged replay keeps the previous selection playable and reports recovery', async () => {
  const s = setup();
  await s.feed.playReplay(':demo');
  const previous = s.playback.file;
  const pending = s.feed.playReplay('broken');
  s.requests[0].reply({ ...fixture, frames: [42] });
  await pending;
  assert.equal(s.playback.file, previous);
  assert.match(s.view.replayError, /重新转换/);
  await s.feed.playReplay(':demo');
  assert.equal(s.view.replayError, undefined);
});

test('switching back to live invalidates an unfinished replay request', async () => {
  const s = setup(); const pending = s.feed.playReplay('demo'); s.feed.select('123456');
  s.requests[0].reply(fixture); await pending;
  assert.equal(s.view.mode, 'live'); assert.equal(s.playback.file, null);
  s.feed.dispose();
});

test('disposed plugin ignores pending replay response', async () => {
  const s = setup(); const pending = s.feed.playReplay('demo'); s.feed.dispose();
  s.requests[0].reply(fixture); await pending;
  assert.equal(s.playback.file, null); assert.equal(s.timers.size, 0);
});

test('reselecting a match ignores an earlier request for that same match', async () => {
  const s = setup(); s.feed.select('123456'); s.feed.select('123456');
  s.requests[0].reply({ id: 'invalid-old-response' }); await flush();
  assert.equal(s.view.match, null); assert.equal(s.timers.size, 0); s.feed.dispose();
});

test('entering replay clears the scheduled match poll', async () => {
  const s = setup(); const initial = s.feed.playReplay('demo');
  s.requests[0].reply(fixture); await initial;
  const match = { ...s.feed.engine.match, id: '123456' };
  s.feed.select('123456'); s.requests[1].reply(match); await flush();
  assert.equal(s.timers.size, 1);
  const pending = s.feed.playReplay('demo');
  assert.equal(s.timers.size, 0);
  s.requests[2].reply(fixture); await pending;
  assert.equal(s.view.mode, 'replay'); assert.equal(s.timers.size, 0);
});

test('switching to replay aborts the outstanding live HTTP request', async()=>{
 const s=setup();s.feed.select('123456');const signal=s.requests[0].signal;assert.equal(signal.aborted,false);
 const pending=s.feed.playReplay('demo');assert.equal(signal.aborted,true);s.requests[1].reply(fixture);await pending;s.feed.dispose();
});
test('an older fetched snapshot cannot rewind match state', async()=>{
 const s=setup();s.feed.select('123456');const m=s.createReplayMatch({...fixture,id:'123456'});m.fetchedAt='2026-11-12T01:00:10Z';
 s.requests[0].reply(m);await flush();const timer=[...s.timers.values()][0];timer();
 s.requests[1].reply({...m,fetchedAt:'2026-11-12T01:00:00Z',home:{...m.home,score:9}});await flush();
 assert.equal(s.view.match.home.score,0);s.feed.dispose();
});
test('failed event refresh preserves last known positions and reports degradation',async()=>{
 const s=setup();s.feed.select('123456');const m=s.createReplayMatch({...fixture,id:'123456'});m.plays=[{id:'p',totalClock:10,period:1,type:'pass',x:20,y:30,x2:null,y2:null}];
 s.requests[0].reply(m);await flush();[...s.timers.values()][0]();s.requests[1].reply({...m,plays:[],playsError:'timeout'});await flush();
 assert.equal(s.view.match.plays.length,1);
 assert.match(s.liveQuality(s.view),/事件暂不可用/);
 assert.equal(s.feed.failures,0,'a successful summary must retain normal score polling');
 s.feed.dispose();
});


test('own-goal log uses reported score and ESPN beneficiary without reversing twice', () => {
  const {keyMoments}=setup();
  const goals=Array.from({length:7},(_,i)=>({id:String(i),totalClock:i*60,displayClock:String(i+1),type:i===6?'own-goal':'goal',typeText:i===6?'Own Goal':'Goal',goal:true,teamId:'a',playerName:'Player '+i}));
  const match={home:{id:'h'},away:{id:'a'},source:{provider:'ESPN'},timeline:goals,plays:[]};
  assert.equal(keyMoments(match).at(-1).score.home,0);
  assert.equal(keyMoments(match).at(-1).score.away,7);
  match.timeline=[goals[6]];
  match.plays=[{id:'6',homeScore:0,awayScore:7}];
  assert.equal(keyMoments(match).at(-1).score.away,7);
  assert.equal(keyMoments(match).at(-1).score.home,0);
});

test('split score and coordinates, duplicate goals, correction, then final detail after delisting', async () => {
  const s = setup();
  const match = s.createReplayMatch({ ...fixture, id: '123456' });
  const position = { id: 'p', order: 1, totalClock: 2700, period: 1, type: 'pass', x: 30, y: 40, x2: null, y2: null };
  match.plays = [position];
  s.feed.select(match.id);
  s.requests[0].reply(match);
  await flush();
  async function detail(data) {
    const pending = s.feed.pollMatch();
    s.requests.at(-1).reply(data);
    await pending;
  }
  const second = { ...match, status: { ...match.status, period: 2, displayClock: "46'" },
    home: { ...match.home, score: 1 }, fetchedAt: '2026-11-20T10:00:00Z' };
  await detail(second);
  assert.equal(s.view.snapshot.score.home, 1);
  assert.match(s.liveQuality(s.view), /等待下半场位置数据/);
  assert.equal(s.keyMoments(s.view.match).length, 0);
  const goal = { ...position, id: 'g', playerName: 'Scorer', jersey: '9', typeText: 'Goal', type: 'goal', goal: true, teamId: match.home.id, period: 2,
    totalClock: 2780, displayClock: "46'", homeScore: 1, awayScore: 0 };
  const aligned = { ...second, timeline: [goal, goal], plays: [goal, position, goal] };
  await detail(aligned);
  assert.match(s.liveQuality(s.view), /最近位置 46'/);
  assert.equal(s.keyMoments(s.view.match).length, 1);
  assert.equal(s.keyMoments(s.view.match)[0].score.home, 1);
  const corrected = { ...second, home: match.home, fetchedAt: '2026-11-20T10:00:10Z' };
  await detail(corrected);
  await detail(aligned);
  assert.equal(s.view.snapshot.score.home, 0);
  assert.equal(s.keyMoments(s.view.match).length, 0);
  const list = s.feed.pollLive();
  s.requests.at(-1).reply({ matches: [] });
  await list;
  assert.equal(s.view.selectedId, match.id);
  await detail({ ...corrected, status: { ...second.status, state: 'post', displayClock: "90'+5'" },
    away: { ...match.away, score: 2 } });
  s.feed.engine.tick(1);
  assert.equal(s.feed.engine.snapshot().clockLabel, "终场 · 90'+5'");
  assert.equal(s.feed.engine.snapshot().score.away, 2);
  assert.equal(s.feed.engine.playing, false);
  s.feed.dispose();
});

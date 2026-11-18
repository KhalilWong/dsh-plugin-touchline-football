import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['plugin/index.js'], bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.url': JSON.stringify(new URL('../plugin/index.js', import.meta.url).href) },
  plugins: [{ name: 'offline-source', setup(build) {
    build.onResolve({ filter: /host\/sources\/index\.js$/ }, () => ({ path: 'source', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
      'export const getSource=()=>globalThis.source; export const listSources=()=>[globalThis.source];' }));
  } }],
});
function setup(loader, admit = () => ({ peer: { principal: { kind: 'owner' } } })) {
  const source = { id: 'test', capabilities: { coordinates: true }, getScoreboard: loader };
  const sandbox = vm.createContext({ module: { exports: {} }, require: createRequire(import.meta.url), source, console, URL, Buffer });
  vm.runInContext(bundle.outputFiles[0].text, sandbox);
  return () => {
    const routes = new Map(); const effects = [];
    sandbox.module.exports.apply({ connection: { admit }, webServer: { register(route) {
      assert.ok(!routes.has(route.path)); routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    } }, effect(fn) { effects.push(fn()); } });
    return { routes, dispose() { effects.splice(0).forEach(fn => fn()); }, async get(name) {
      let status, body;
      await routes.get('/api/touchline/' + name)({ method: 'GET', url: '/api/touchline/' + name + '?date=20261110' }, {
        writeHead(code) { status = code; }, end(text) { body = JSON.parse(text); },
      });
      return { status, body };
    } };
  };
}
const board = id => ({ matches: [{ id, status: { state: 'in' } }, { id: 'finished', status: { state: 'post' } }] });

test('host removes all routes and re-enable reads fresh data', async () => {
  let calls = 0;
  const mount = setup(async () => board(String(++calls)));
  const first = mount(); assert.equal(first.routes.size, 7);
  assert.equal((await first.get('health')).body.ok, true);
  assert.equal((await first.get('live')).body.matches.length, 1);
  assert.equal((await first.get('scoreboard')).body.cached, true);
  assert.equal(calls, 1); first.dispose(); assert.equal(first.routes.size, 0);
  const second = mount();
  assert.equal((await second.get('live')).body.matches[0].id, '2');
  second.dispose();
});

test('pending request from disabled host cannot populate re-enabled cache', async () => {
  const pending = [];
  const mount = setup(() => new Promise(resolve => pending.push(resolve)));
  const first = mount(); const oldRequest = first.get('live'); first.dispose();
  const second = mount(); const newRequest = second.get('live');
  assert.equal(pending.length, 2);
  pending[1](board('new')); assert.equal((await newRequest).body.matches[0].id, 'new');
  pending[0](board('old')); await oldRequest;
  assert.equal((await second.get('live')).body.matches[0].id, 'new');
  assert.equal(pending.length, 2); second.dispose();
});

test('concurrent live and scoreboard requests share one upstream read', async () => {
  let finish, calls = 0;
  const mount = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const host = mount(); const live = host.get('live'); const scoreboard = host.get('scoreboard');
  assert.equal(calls, 1); finish(board('shared'));
  assert.equal((await live).body.matches.length, 1);
  assert.equal((await scoreboard).body.matches.length, 2); host.dispose();
});


test('all HTTP routes fail closed before accessing provider or local replay data', async () => {
  for (const admit of [()=>({rejection:401}),()=>({rejection:403}),()=>({peer:{principal:{kind:'guest'}}}),()=>undefined,()=>{throw Error('unavailable')}]) {
    let calls=0;const host=setup(async()=>{calls++;return board('secret')},admit)();
    for(const name of ['health','sources','live','scoreboard','match','replays','replay']) {
      const response=await host.get(name);assert.ok([401,403].includes(response.status));assert.equal(Object.keys(response.body).join(','),'error');
    }
    assert.equal(calls,0);host.dispose();
  }
});

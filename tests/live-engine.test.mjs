import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const b=await build({stdin:{contents:"export {MatchEngine} from './src/lib/engine';export {createReplayMatch} from './src/replay/format';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'});
const ctx=vm.createContext({module:{exports:{}}});vm.runInContext(b.outputFiles[0].text,ctx);
const {MatchEngine,createReplayMatch}=ctx.module.exports;
const make=()=>createReplayMatch({id:'123456',title:'test',source:'test',hasBall:true,teams:[{id:'h',name:'Home'},{id:'a',name:'Away'}],players:Array.from({length:22},(_,i)=>({id:String(i),name:String(i),jersey:String(i),teamId:i<11?'h':'a'}))});
const play=(id,t,x=20,y=30)=>({id,order:0,totalClock:t,period:1,x,y,x2:30,y2:40,teamId:'h',playerName:'1',jersey:'1',type:'pass'});
const advance=(e,n)=>{for(let i=0;i<n*60;i++)e.tick(1/60);};

test('zeroed full-time clock uses the whistle, then the last live clock of the same match', () => {
  const engine = new MatchEngine();
  const match = make();
  const clock = () => engine.snapshot().clockLabel;
  const post = { ...match, status: { ...match.status, state: 'post', clock: 0, displayClock: "0'", period: 0 } };
  engine.setMatch({ ...match, status: { ...match.status, state: 'in', displayClock: "90'+4'" } }, true);
  engine.setMatch(post, true);
  assert.equal(clock(), "终场 · 最近 90'+4'");
  const whistle = { type: 'end-regular-time', period: 2, totalClock: 5657, displayClock: "90'+5'" };
  engine.setMatch({ ...post, timeline: [whistle] }, true);
  assert.equal(clock(), "终场 · 90'+5'");
  engine.setMatch(post, true);
  assert.equal(clock(), "终场 · 90'+5'");
  engine.setMatch({ ...post, id: 'different', plays: [whistle], status: { ...post.status, period: 4 } }, true);
  assert.equal(clock(), '终场');
});

test('a distant live shot fades between observations and follows only its reported trajectory', () => {
  const engine = new MatchEngine();
  const match = make();
  match.plays = [play('pass', 10)];
  engine.setMatch(match);
  advance(engine, 4);
  const previous = { ...engine.ball.pos };
  match.plays.push({ ...play('shot', 50, 82, 44), shot: true, x2: 97, y2: 50 });
  engine.setMatch(match);
  let relocated = false;
  for (let frame = 0; frame < 240; frame++) {
    const last = { ...engine.ball.pos };
    engine.tick(1 / 60);
    const distance = Math.hypot(engine.ball.pos.x - last.x, engine.ball.pos.y - last.y);
    if (distance > 24 / 60 + 1e-8) {
      assert.equal(relocated, false);
      assert.deepEqual(last, previous);
      assert.equal(engine.ballOpacity, 0);
      assert.equal(engine.ball.trail.length, 0);
      relocated = true;
    }
  }
  assert.ok(relocated);
  assert.equal(engine.ballOpacity, 1);
  assert.ok(Math.abs(engine.ball.pos.x - 97) < 0.001);
});

test('stoppages freeze inferred players and a reported kickoff restores formation', () => {
  const engine = new MatchEngine();
  const match = make();
  match.plays = [play('pass', 90)];
  engine.setMatch(match);
  const positions = () => JSON.stringify(engine.players.map(p => p.pos));
  for (const x of [null, 24]) {
    const before = positions();
    match.plays.push({ ...play('whistle' + x, 100, x, 30), type: 'foul' });
    engine.setMatch(match);
    advance(engine, 4);
    assert.equal(positions(), before);
  }
  match.plays.push({ ...play('restart', 140, null, null), type: 'kick-off' });
  engine.setMatch(match);
  advance(engine, 15);
  assert.equal(engine.ballOpacity, 0);
  for (const p of engine.players) assert.ok(p.side === 'home' ? p.pos.x <= 49.001 : p.pos.x >= 50.999);
  match.plays.push({ ...play('restart-pass', 141, 50, 50), x2: 49, y2: 50 });
  engine.setMatch(match);
  advance(engine, 4);
  assert.equal(engine.ballOpacity, 1);
});
test('live consumes latest event immediately without an extra five-second buffer',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('1',100)];e.setMatch(m);assert.equal(e.sim,100);
 m.plays=[...m.plays,play('2',180,80,80)];const before={...e.ball.pos};e.setMatch(m);
 assert.equal(e.sim,180);assert.deepEqual({...e.ball.pos},before);e.tick(1/60);
 assert.ok(Math.hypot(e.ball.pos.x-before.x,e.ball.pos.y-before.y)<=24/60+1e-8);
});

test('a reported centre pass after a goal resets formation without an invented ball path', () => {
  const engine=new MatchEngine(),match=make();
  match.plays=[{...play('goal',100,92,45),type:'goal',goal:true,x2:100,y2:50}];
  engine.setMatch(match);advance(engine,4);
  match.plays.push({...play('restart',160,50,50),teamId:'a',x2:60,y2:55,restart:'kickoff-after-goal'});
  engine.setMatch(match);
  for(let i=0;i<600;i++){
    const old=engine.players.map(p=>({...p.pos}));engine.tick(1/60);
    engine.players.forEach((p,j)=>assert.ok(Math.hypot(p.pos.x-old[j].x,p.pos.y-old[j].y)<=.1+1e-8));
  }
  for(const p of engine.players)assert.ok(p.side==='home'?p.pos.x<=49.001:p.pos.x>=50.999);
  assert.ok(Math.abs(engine.ball.pos.x-60)<.001&&Math.abs(engine.ball.pos.y-55)<.001);
  assert.equal(engine.ballOpacity,1);
  match.plays.push({...play('next',162,60,55),teamId:'a',x2:65,y2:50});
  engine.setMatch(match);advance(engine,6);
  assert.ok(Math.abs(engine.ball.pos.x-65)<.001);
});
test('players stay bounded in speed and distance from formation',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('1',100)];e.setMatch(m);m.plays.push(play('2',200,99,99));e.setMatch(m);
 for(let i=0;i<300;i++) {const old=e.players.map(p=>({...p.pos}));e.tick(1/60);e.players.forEach((p,j)=>{assert.ok(Math.hypot(p.pos.x-old[j].x,p.pos.y-old[j].y)<=.1+1e-8);assert.ok(Math.hypot(p.target.x-p.base.x,p.target.y-p.base.y)<=18.00001);});}
});
test('no new events means no invented ball rolling or continued player movement',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('1',100)];e.setMatch(m);advance(e,20);const before=JSON.stringify([e.ball.pos,e.players.map(p=>p.pos)]);advance(e,20);
 assert.equal(JSON.stringify([e.ball.pos,e.players.map(p=>p.pos)]),before);assert.ok(e.sim<102);
});
test('duplicate and unordered events do not rewind on repeated polls',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('2',200),play('1',100),play('2',200)];e.setMatch(m);advance(e,2);const before=e.sim;e.setMatch(m);assert.equal(e.sim,before);assert.equal(e.track.length,2);
});
test('missing and invalid coordinates never become valid event positions',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('1',100,null,null),play('2',101,NaN,NaN)];e.setMatch(m);assert.equal(e.track.length,0);
});
test('halftime and stale responses stop the live event cursor',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('1',100)];m.status.name='STATUS_HALFTIME';e.setMatch(m);advance(e,5);assert.equal(e.sim,100);
 assert.equal(e.snapshot().clockLabel,'中场');
 m.status.name='STATUS_SECOND_HALF';m.status.displayClock="46'";e.setMatch(m);assert.equal(e.snapshot().clockLabel,"46'");
 m.status.name='STATUS_IN_PROGRESS';m.stale=true;e.setMatch(m);advance(e,5);assert.equal(e.sim,100);
});
test('ESPN parser preserves null coordinates and actual zeros',async()=>{
 const s=await build({stdin:{contents:readFileSync('plugin/host/sources/espn.js','utf8')+'\nexport {normalizePlay};',resolveDir:process.cwd()+'/plugin/host/sources'},bundle:true,write:false,format:'cjs',platform:'node'});
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(s.outputFiles[0].text,c);
 assert.equal(c.module.exports.normalizePlay({fieldPositionX:null,fieldPositionY:''},0).x,null);
 assert.equal(c.module.exports.normalizePlay({fieldPositionX:0,fieldPositionY:0},0).x,0);
});

test('an interrupted live pass freezes the drawn positions and resumes on fresh data', () => {
  for (const interruption of [{ stale: true }, { playsError: 'timeout' }, { half: true }]) {
    const engine = new MatchEngine();
    const match = make();
    match.plays = [play('first', 100)];
    engine.setMatch(match);
    match.plays.push(play('next', 120, 24, 35));
    engine.setMatch(match);
    engine.tick(1 / 60);
    const positions = () => JSON.stringify([engine.ball.pos, engine.players.map(p => p.pos)]);
    const before = positions();
    engine.setMatch({ ...match, ...interruption,
      status: interruption.half ? { ...match.status, name: 'STATUS_HALFTIME' } : match.status });
    advance(engine, 3);
    assert.equal(positions(), before);
    engine.setMatch(match);
    engine.tick(1 / 60);
    assert.notEqual(positions(), before);
  }
});

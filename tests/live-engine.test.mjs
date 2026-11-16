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
test('live consumes latest event immediately without an extra five-second buffer',()=>{
 const e=new MatchEngine(),m=make();m.plays=[play('1',100)];e.setMatch(m);assert.equal(e.sim,100);
 m.plays=[...m.plays,play('2',180,80,80)];const before={...e.ball.pos};e.setMatch(m);
 assert.equal(e.sim,180);assert.deepEqual({...e.ball.pos},before);e.tick(1/60);
 assert.ok(Math.hypot(e.ball.pos.x-before.x,e.ball.pos.y-before.y)<=24/60+1e-8);
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
 m.status.name='STATUS_IN_PROGRESS';m.stale=true;e.setMatch(m);advance(e,5);assert.equal(e.sim,100);
});
test('ESPN parser preserves null coordinates and actual zeros',async()=>{
 const s=await build({stdin:{contents:readFileSync('plugin/host/sources/espn.js','utf8')+'\nexport {normalizePlay};',resolveDir:process.cwd()+'/plugin/host/sources'},bundle:true,write:false,format:'cjs',platform:'node'});
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(s.outputFiles[0].text,c);
 assert.equal(c.module.exports.normalizePlay({fieldPositionX:null,fieldPositionY:''},0).x,null);
 assert.equal(c.module.exports.normalizePlay({fieldPositionX:0,fieldPositionY:0},0).x,0);
});

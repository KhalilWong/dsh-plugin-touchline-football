import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackingCsv, convertSample } from '../scripts/lib/metrica.mjs';
import { build } from 'esbuild';
import vm from 'node:vm';
const {outputFiles}=await build({entryPoints:['src/replay/format.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
const context=vm.createContext({module:{exports:{}}});vm.runInContext(outputFiles[0].text,context);
const {frameAt,clockLabel,replayEnd,advanceReplay}=context.module.exports;
const teams=[{id:'h'},{id:'a'}];
function csv(count=250, mutate=()=>{}) {
  const lines=[',,,Home',',,,1', 'Period,Frame,Time [s],'+Array.from({length:11},(_,i)=>`Player${i+1},`).join(',')+',Ball,'];
  for(let i=0;i<count;i++) {
    const cells=[1,i+1,((i+1)/25).toFixed(2),...Array.from({length:11},()=>[.2+i*.001,.5]).flat(),.3+i*.001,.4];
    mutate(cells,i); lines.push(cells.join(','));
  }
  return lines.join('\n');
}
const convert=(text,fps=10)=>convertSample({homeCsv:text,awayCsv:text,teams,id:'test',title:'test',fps,minutes:1});
test('official three-line header, player IDs and tracked ball are parsed',()=>{
 const r=parseTrackingCsv(csv());assert.equal(r.players.length,11);assert.equal(r.players[0],'Player1');assert.deepEqual(r.rows[0].ball,[.3,.4]);
});
test('25 to 10 fps preserves 10 seconds and samples fractional source times',()=>{
 const r=convert(csv());assert.equal(r.frames.length/46,100);assert.equal(r.duration,10);assert.equal(r.frames[46],20.25);assert.equal(r.frames[44],30);assert.equal(clockLabel(r,replayEnd(r)),'0:10');
});
test('blank and NaN coordinates stay missing; real zero is valid',()=>{
 const r=parseTrackingCsv(csv(2,(c,i)=>{c[3]=i===0?'':0;c[4]=i===0?'NaN':0;}));
 assert.equal(r.rows[0].values[0],null);assert.deepEqual(r.rows[1].values[0],[0,0]);
});
test('short gaps interpolate; long gaps and missing ball remain unknown',()=>{
 const r=convert(csv(50,(c,i)=>{if(i>=5&&i<=7)c[3]=c[4]='';if(i>=15&&i<=35)c[5]=c[6]='NaN';if(i>=10)c[25]=c[26]='';}));
 assert.ok(r.frames[2*46]!==null);assert.equal(r.frames[8*46+2],null);assert.equal(r.frames[8*46+44],null);
 const frame=frameAt(r,8);assert.equal(frame.players[1].visible,false);assert.equal(frame.ball,undefined);
});
test('interpolation does not bridge period changes',()=>{
 const r=convert(csv(30,(c,i)=>{if(i>=13)c[0]=2;}));
 r.periods[0]=1;r.periods[1]=2;r.frames[0]=10;r.frames[46]=90;
 assert.equal(frameAt(r,.5).players[0].x,10);
});
test('render interpolates fractional frames without inventing missing positions',()=>{
 const r=convert(csv());const f=frameAt(r,.5);assert.equal(f.players[0].x,20.125);
 r.frames[0]=null;assert.equal(frameAt(r,.5).players[0].visible,false);
});
test('wall-time progress survives a slow frame and reaches exact duration',()=>{
 const r=convert(csv());assert.equal(advanceReplay(r,0,.75),7.5);assert.equal(advanceReplay(r,0,5,2),100);
 assert.equal(clockLabel(r,advanceReplay(r,99,1)),'0:10');assert.equal(advanceReplay(r,100,1),100);
});
test('legacy demo and missing-ball sentinel remain supported',()=>{
 const r=convert(csv());delete r.formatVersion;r.frames[44]=r.frames[45]=-1;
 assert.equal(frameAt(r,0).ball,undefined);assert.equal(frameAt(r,100000).players.length,22);
});

test('full replay keeps substitutes as separate identities, including reverse seek',()=>{
 const text=csv(100).split('\n').map((line,i)=> {
  if(i===2)return line+',Player12,';
  if(i<3)return line+',,';
  const c=line.split(',');const frame=i-3;
  c.push(...(frame>=50?[.8,.7]:['','']));
  if(frame>50)c[3]=c[4]='';
  return c.join(',');
 }).join('\n');
 const r=convertSample({homeCsv:text,awayCsv:text,teams,id:'full',title:'full',full:true,fps:10});
 assert.equal(r.formatVersion,3);assert.equal(r.duration,4);assert.equal(r.players.length,24);
 assert.equal(r.substitutions.length,2);assert.equal(r.substitutions[0].time,2);
 const visible=i=>frameAt(r,i).players.filter(p=>p.visible).map(p=>p.id);
 assert.ok(visible(19).includes('home-Player1'));assert.ok(!visible(19).includes('home-Player12'));
 assert.ok(!visible(20).includes('home-Player1'));assert.ok(visible(20).includes('home-Player12'));
 assert.equal(visible(20).length,22);assert.equal(visible(19).length,22);
 assert.equal(visible(replayEnd(r)).length,22);
});

test('a missing interval alone does not infer a substitution',()=>{
 const r=convert(csv(100,(c,i)=>{if(i>=25&&i<75)c[3]=c[4]='';}));
 assert.deepEqual(r.substitutions,[]);assert.equal(frameAt(r,20).players[0].visible,false);
 assert.equal(frameAt(r,35).players[0].visible,true);
});

test('v2 files retain the fixed 22-player stride',()=>{
 const r=convert(csv());r.formatVersion=2;
 assert.equal(frameAt(r,0).players.length,22);assert.equal(clockLabel(r,replayEnd(r)),'0:10');
});

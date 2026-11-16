import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const path=process.env.REPLAY_FILE||'data/replay/metrica-sample-1-full.json';
const replay=JSON.parse(readFileSync(path,'utf8'));
const ending=`${Math.floor(replay.duration/60)}:${String(Math.floor(replay.duration%60)).padStart(2,'0')}`;
assert.equal(replay.source,'metrica');assert.ok(replay.formatVersion>=2);
const bundle=await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {apply,playback} from './plugin/src/skin';
import {frameAt} from './src/replay/format';
window.visiblePlayers=()=>frameAt(playback.file,playback.index).players.filter(p=>p.visible).map(p=>p.id);
window.inspectReplay=()=>({seconds:playback.index/(playback.file?.fps||1),now:performance.now(),playing:playback.playing});
window.nearEnd=()=>{playback.index=playback.file.duration*playback.file.fps-2;};
apply({slots:{inject:(_,fn)=>fn(),register:(meta,Component)=>{const el=document.createElement('div');document.body.append(el);if(meta.name==='conversation.composer.dock')el.style.cssText='position:fixed;bottom:20px;right:20px';createRoot(el).render(React.createElement(Component));return ()=>el.remove();}},effect:fn=>fn()});`,resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'test-observation',setup(b){b.onLoad({filter:/plugin[\\/]src[\\/]skin\.tsx$/},a=>({contents:readFileSync(a.path,'utf8')+'\nexport {playback};',loader:'tsx'}));}}]});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://replay.test/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="background:#171b19"></body></html>'});
  const data=p.endsWith('/health')?{capabilities:{coordinates:true}}:p.endsWith('/replays')?{replays:[{id:replay.id,title:replay.title,duration:replay.duration,fps:replay.fps}]}:p.endsWith('/replay')?replay:{matches:[]};
  return r.fulfill({json:data});
 });
 await page.goto('http://replay.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByTitle('切换直播 / 回放').click();await page.getByRole('button',{name:new RegExp('Metrica')}).click();
 const canvas=page.locator('.tl-window canvas');await canvas.waitFor({state:'visible'});
 await page.waitForFunction(()=>window.inspectReplay().seconds>0.2);
 const start=await page.evaluate(()=>window.inspectReplay());const picture=await canvas.evaluate(c=>c.toDataURL());
 await page.waitForTimeout(1500);
 // Force a slow rendering frame. Playback must catch up, not discard elapsed time.
 await page.evaluate(()=>{const end=performance.now()+650;while(performance.now()<end){};});await page.waitForTimeout(150);
 const after=await page.evaluate(()=>window.inspectReplay());
 const drift=Math.abs((after.seconds-start.seconds)-(after.now-start.now)/1000);
 assert.ok(drift<.15,`wall-clock drift ${drift}`);
 assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),picture);
 await page.getByTitle('播放 / 暂停').click();await page.waitForTimeout(50);
 const paused=await page.evaluate(()=>window.inspectReplay().seconds);await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.inspectReplay().seconds),paused);
 await page.getByTitle('播放 / 暂停').click();await page.waitForTimeout(250);
 assert.ok((await page.evaluate(()=>window.inspectReplay().seconds))>paused);
 mkdirSync('tmp',{recursive:true});await page.screenshot({path:'tmp/metrica-replay.png'});
 await page.getByTitle('播放 / 暂停').click();
 for(const sub of replay.substitutions??[]) {
  for(const [seconds,before] of [[sub.time-1,true],[sub.time+.1,false]]) {
   await page.getByLabel('回放片段').selectOption(String(seconds));
   await page.waitForTimeout(80);
   const visible=await page.evaluate(()=>window.visiblePlayers());
   assert.equal(visible.includes(sub.out),before);assert.equal(visible.includes(sub.in),!before);
   assert.equal(visible.length,22);
  }
 }
 const second=replay.periods?.findIndex(p=>p===2)??-1;
 if(second>=0){await page.getByLabel('回放片段').selectOption(String(second/replay.fps));await page.waitForTimeout(550);assert.match(await page.locator('.tl-replay-controls').innerText(),/下半场/);}
 await page.getByLabel('回放片段').selectOption('0');await page.waitForTimeout(80);
 assert.equal((await page.evaluate(()=>window.visiblePlayers())).length,22);
 await page.screenshot({path:'tmp/metrica-full-replay.png'});
 await page.evaluate(()=>window.nearEnd());await page.getByTitle('播放 / 暂停').click();
 await page.waitForFunction(end=>!window.inspectReplay().playing && document.querySelector('.tl-window .tl-clock')?.textContent===end,ending);
 assert.equal(await page.locator('.tl-window .tl-clock').textContent(),ending);
 await page.getByTitle('播放 / 暂停').click();await page.waitForTimeout(100);
 assert.ok((await page.evaluate(()=>window.inspectReplay().seconds))<1);
 assert.deepEqual(errors,[]);
 const result={source:path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),duration:replay.duration,frames:replay.frames.length/((replay.formatVersion>=3?replay.players.length:22)*2+2),wallClockDriftSeconds:drift,pauseResume:true,ending,substitutionsChecked:replay.substitutions?.length??0,secondHalf:second>=0,restart:true,pageErrors:errors};
 writeFileSync('tmp/metrica-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}

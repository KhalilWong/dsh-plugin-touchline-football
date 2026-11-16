import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {apply,feed} from './plugin/src/skin';import {createReplayMatch} from './src/replay/format';
window.fixture=createReplayMatch({id:'999999',title:'直播同步验收（模拟）',source:'test',hasBall:true,teams:[{id:'h',name:'模拟主队',abbr:'测试H',color:'#3b7dd8'},{id:'a',name:'模拟客队',abbr:'测试A',color:'#d8733b'}],players:Array.from({length:22},(_,i)=>({id:String(i),name:String(i),jersey:String(i%11+1),teamId:i<11?'h':'a'}))});
window.fixture.lineups.away.starters.forEach(p=>p.slotX=100-p.slotX);
window.engineState=()=>({sim:feed.engine.sim,ball:{...feed.engine.ball.pos},players:feed.engine.players.map(p=>({...p.pos}))});
apply({slots:{inject:(_,fn)=>fn(),register:(meta,C)=>{const el=document.createElement('div');document.body.append(el);if(meta.name==='conversation.composer.dock')el.style.cssText='position:fixed;bottom:20px;right:20px';createRoot(el).render(React.createElement(C));return ()=>el.remove();}},effect:fn=>fn()});
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'observe',setup(b){b.onLoad({filter:/plugin[\\/]src[\\/]skin\.tsx$/},a=>({contents:readFileSync(a.path,'utf8')+'\nexport {feed};',loader:'tsx'}));}}]});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let fixture,phase=0;const requests=[];
 const response=()=>{const m=structuredClone(fixture);m.fetchedAt=new Date().toISOString();m.status.clock=100+phase*30;m.status.displayClock=`${Math.floor(m.status.clock/60)}'`;m.plays=[{id:String(phase),order:0,period:1,totalClock:100+phase*30,type:'pass',x:phase===0?15:85,y:phase===0?20:80,x2:null,y2:null,teamId:'h',playerName:'1',jersey:'2'}];m.stale=phase===2;return m;};
 await page.route('http://live.test/**',r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><body style="background:#171b19">'});if(p.endsWith('/match')){requests.push(Date.now());return r.fulfill({json:response()});}return r.fulfill({json:p.endsWith('/health')?{capabilities:{coordinates:true}}:p.endsWith('/replays')?{replays:[]}:{matches:fixture?[response()]:[]}});});
 await page.goto('http://live.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});fixture=await page.evaluate(()=>window.fixture);
 // Trigger a selection through the actual feed for a deterministic initial listing.
 await page.waitForTimeout(31000);
 await page.locator('.tl-window canvas').waitFor();
 phase=1;await page.waitForFunction(()=>window.engineState().sim>=130);
 const a=await page.evaluate(()=>window.engineState());await page.waitForTimeout(150);const b=await page.evaluate(()=>window.engineState());
 assert.ok(Math.hypot(b.ball.x-a.ball.x,b.ball.y-a.ball.y)<=24*.25);
 await page.waitForTimeout(6000);const settled=await page.evaluate(()=>window.engineState());await page.waitForTimeout(1000);assert.deepEqual(await page.evaluate(()=>window.engineState()),settled);
 phase=2;await page.waitForFunction(()=>document.querySelector('.tl-live-quality')?.textContent.includes('同步异常'));
 phase=1;await page.waitForFunction(()=>document.querySelector('.tl-live-quality')?.textContent.includes('最近同步'),{},{timeout:35000});
 assert.deepEqual(errors,[]);mkdirSync('tmp',{recursive:true});await page.screenshot({path:'tmp/live-sync.png'});
 const result={requests:requests.length,intervals:requests.slice(1).map((t,i)=>t-requests[i]),speedBound:true,settles:true,staleRecovery:true,pageErrors:errors};writeFileSync('tmp/live-sync-acceptance.json',JSON.stringify(result,null,2));
 // Temporary real-DSH renderer fixture: only Touchline endpoints, explicitly labelled.
 const injection=`(()=>{if(window.__tlRestore)window.__tlRestore();const original=window.fetch.bind(window),base=${JSON.stringify(fixture)};let phase=0;window.__tlPhase=n=>phase=n;window.fetch=async(input,init)=>{const url=String(input);if(!url.includes('/api/touchline/'))return original(input,init);if(!/\\/(live|scoreboard|match)(\\?|$)/.test(url))return original(input,init);const m=structuredClone(base);m.fetchedAt=new Date().toISOString();m.status.clock=100+phase*30;m.status.displayClock='验收 '+phase;m.plays=[{id:String(phase),order:0,period:1,totalClock:100+phase*30,type:'pass',x:phase===0?15:85,y:phase===0?20:80,x2:null,y2:null,teamId:'h',playerName:'1',jersey:'2'}];m.stale=phase===2;return new Response(JSON.stringify(url.includes('/match?')?m:{matches:[m]}),{headers:{'content-type':'application/json'}});};window.__tlRestore=()=>{window.fetch=original;delete window.__tlPhase;delete window.__tlRestore;};console.log('Touchline 临时模拟流已开启；__tlPhase(1)远端事件，__tlPhase(2)断流，__tlRestore()恢复');})()`;
 writeFileSync('tmp/live-dsh-inject.js',injection);console.log(result);
}finally{await browser.close();}

// Offline browser regression for the plugin's actual React components and
// module lifecycle. Real DSH installation is verified separately.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const replay = {
  id: 'demo', title: 'Synthetic regression', source: 'test', fps: 10, duration: 60, hasBall: true,
  teams: [{ id: 'h', name: 'Home', abbr: 'H', color: '#ff0000' }, { id: 'a', name: 'Away', abbr: 'A', color: '#0000ff' }],
  players: Array.from({ length: 22 }, (_, i) => ({ id: String(i), name: String(i), jersey: String(i + 1), teamId: i < 11 ? 'h' : 'a' })),
  frames: Array.from({ length: 600 }, (_, frame) => Array.from({ length: 46 }, (_, i) => 10 + (i * 3 + frame / 5) % 80)).flat(),
};
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {apply} from './plugin/src/skin';
    import {createReplayMatch} from './src/replay/format';
    window.fixtureMatch=createReplayMatch(${JSON.stringify({ ...replay, id: '123456', title: 'Synthetic live fixture' })});
    let disposers=[];
    window.mountPlugin=()=>apply({
      slots:{inject:(_,fn)=>disposers.push(fn()),register:(meta,Component)=>{
        const el=document.createElement('div'); document.body.append(el);
        if(meta.name==='conversation.composer.dock')el.style.cssText='position:fixed;bottom:20px;right:20px';
        const root=createRoot(el);root.render(React.createElement(Component));
        return ()=>{root.unmount();el.remove();};
      }},effect:fn=>disposers.push(fn())
    });
    window.unmountPlugin=()=>{for(const fn of disposers.reverse())fn?.();disposers=[];};
    window.mountPlugin();`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
});
const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  let liveMatch=null, matchRequests=0;
  await page.route('http://touchline.test/**', route => {
    const pathname=new URL(route.request().url()).pathname;
    const data=pathname.endsWith('/health')?{capabilities:{coordinates:true}}:
      pathname.endsWith('/replays')?{replays:[{id:'demo',title:replay.title,duration:60,fps:10}]}:
      pathname.endsWith('/replay')?replay:
      pathname.endsWith('/match')?(matchRequests++,liveMatch):{matches:liveMatch?[liveMatch]:[]};
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
    return route.fulfill({json:data});
  });
  await page.goto('http://touchline.test/'); await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByTitle('切换直播 / 回放').click();
  await page.getByRole('button',{name:/Synthetic regression/}).click();
  const canvas=page.locator('[data-dsh-touchline-window] canvas');
  await canvas.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.tl-clock')?.textContent!=='0:00');
  const first=await canvas.evaluate(c=>c.toDataURL());
  await page.waitForTimeout(350);
  assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),first,'replay must draw changing frames');
  await page.keyboard.press('Control+Shift+X');
  assert.equal(await page.locator('[data-dsh-touchline-window]').count(),0);
  await page.keyboard.press('Control+Shift+X'); await canvas.waitFor({state:'visible'});
  const restored=await canvas.evaluate(c=>c.toDataURL()); await page.waitForTimeout(350);
  assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),restored,'restored canvas must resume drawing');
  // Holding the boss key must not alternate hidden/visible on key repeat.
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.down('X');
  await page.waitForFunction(()=>!document.querySelector('[data-dsh-touchline-window]'));
  await page.keyboard.down('X');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-dsh-touchline-window]').count(),0,'held boss key must stay hidden');
  await page.keyboard.up('X'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.keyboard.press('Control+Shift+X'); await canvas.waitFor({state:'visible'});
  await page.evaluate(()=>window.unmountPlugin());
  assert.equal(await page.locator('#dsh-touchline-widget').count(),0);
  assert.equal(await page.locator('[data-dsh-touchline-window]').count(),0);
  await page.evaluate(()=>window.mountPlugin());
  await page.getByTitle('切换直播 / 回放').click();
  await page.getByRole('button',{name:/Synthetic regression/}).click();
  await page.waitForFunction(()=>document.querySelector('.tl-clock')?.textContent!=='0:00');
  // Exercise the complete UI round trip with a synthetic live response.
  await page.evaluate(()=>window.unmountPlugin());
  liveMatch=await page.evaluate(()=>window.fixtureMatch);
  await page.evaluate(()=>window.mountPlugin());
  await page.locator('.tl-window .tl-vs').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.tl-window canvas')?.width>0);
  assert.ok(matchRequests>0,'live selection must fetch match details');
  await page.locator('.tl-window').getByTitle('切换直播 / 回放').click();
  await page.locator('.tl-window').getByRole('button',{name:/Synthetic regression/}).click();
  await page.locator('.tl-window .tl-replay-title').waitFor({state:'visible'});
  const requestsAtReplay=matchRequests;
  await page.waitForTimeout(25_000); // More than two 12-second match polling intervals.
  assert.equal(matchRequests,requestsAtReplay,'replay must stop live match polling');
  assert.match(await page.locator('.tl-window .tl-replay-title').textContent(),/Synthetic regression/);
  await page.locator('.tl-window').getByTitle('切换直播 / 回放').click();
  await page.locator('.tl-window').getByRole('menuitemradio',{name:/Home.*Away/}).click();
  await page.locator('.tl-window .tl-vs').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.tl-window .tl-replay-title'));
  assert.ok(matchRequests>requestsAtReplay,'returning to live must resume match fetching');
  assert.deepEqual(errors,[]);
  console.log('PASS: empty live -> animated replay; boss hide/restore and held key; unmount/remount; synthetic live -> replay -> live; no page errors');
} finally {await browser.close();}

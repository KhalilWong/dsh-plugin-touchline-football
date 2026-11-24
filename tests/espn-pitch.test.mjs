import test from 'node:test';
import assert from 'node:assert/strict';
import {getMatch} from '../plugin/host/sources/espn.js';

test('ESPN match coordinates share a fixed pitch across possession and periods', async () => {
  const original=globalThis.fetch;
  const event=(id,team,type,t,xy,extra={})=>({id,team:{$ref:`https://example.test/teams/${{h:'1',a:'2',unknown:'3'}[team]}`},type:{type,text:type},clock:{value:t},period:{number:1},
    fieldPositionX:xy[0],fieldPositionY:xy[1],fieldPosition2X:xy[2],fieldPosition2Y:xy[3],...extra});
  const plays=[
    event('home','h','pass',10,[40,30,70,80]),
    event('away','a','pass',11,[30,20,25,30]),
    event('shot','a','shot-on-target',3020,[86,60,100,50],{period:{number:2}}),
    event('goal','h','goal',30,[90,40,100,50],{scoringPlay:true}),
    event('assist','h','assist',30,[null,null,null,null]),
    event('restart','a','pass',90,[50,50,40,45]),
    event('later-centre','a','pass',92,[50,50,42,40]),
    event('unknown','unknown','pass',95,[0,null,null,0]),
  ];
  const summary={header:{league:{slug:'test'},competitions:[{status:{type:{state:'in'},period:2},competitors:[
    {id:'1',homeAway:'home',team:{id:'1'}},{id:'2',homeAway:'away',team:{id:'2'}}]}]}};
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/summary?')?summary:{items:plays,pageCount:1}});
  try {
    const m=await getMatch('123456');const by=id=>m.plays.find(p=>p.id===id);
    const xy=p=>[p.x,p.y,p.x2,p.y2];
    assert.deepEqual(xy(by('home')),[40,30,70,80]);
    assert.deepEqual(xy(by('away')),[70,80,75,70]);
    assert.deepEqual(xy(by('shot')),[14,40,0,50]);
    assert.deepEqual(xy(by('unknown')),[0,null,null,0]);
    assert.equal(by('restart').restart,'kickoff-after-goal');
    assert.equal(by('later-centre').restart,undefined);
    assert.equal(by('restart').type,'pass');
  } finally {globalThis.fetch=original;}
});

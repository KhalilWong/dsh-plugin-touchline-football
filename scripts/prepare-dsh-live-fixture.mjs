// Local acceptance package only. Never publish or replace the production source.
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),dest=path.join(root,'tmp/dsh-live-fixture');
await mkdir(dest,{recursive:true});await cp(path.join(root,'plugin'),dest,{recursive:true});
const injection=await readFile('tmp/live-dsh-inject.js','utf8');
const base=JSON.parse(injection.slice(injection.indexOf('base=')+5,injection.indexOf(';let phase=0')));
await writeFile('tmp/live-dsh-base.json',JSON.stringify(base));
await writeFile('tmp/live-dsh-phase.json',JSON.stringify({phase:0}));
const pkg=JSON.parse(await readFile(path.join(dest,'package.json'),'utf8'));pkg.version='0.8.0-acceptance';
await writeFile(path.join(dest,'package.json'),JSON.stringify(pkg,null,2));
const phaseFile=JSON.stringify(path.join(root,'tmp/live-dsh-phase.json'));
const logFile=JSON.stringify(path.join(root,'tmp/live-dsh-requests.jsonl'));
const source=`import {readFile,appendFile} from 'node:fs/promises';
export const id='espn';export const label='本地模拟验收，非真实赛事';export const capabilities={coordinates:true};
const base=${JSON.stringify(base)};
async function snapshot(){const {phase}=JSON.parse(await readFile(${phaseFile},'utf8'));const m=structuredClone(base);m.status.clock=100+phase*30;m.status.displayClock='验收 '+phase;m.plays=[{id:String(phase),order:0,period:1,totalClock:100+phase*30,type:'pass',x:phase===0?15:85,y:phase===0?20:80,x2:null,y2:null,teamId:'h',playerName:'1',jersey:'2'}];return {m,phase};}
export async function getScoreboard(date){const {m}=await snapshot();return {date,matches:[m]};}
export async function getMatch(){const {m,phase}=await snapshot();await appendFile(${logFile},JSON.stringify({at:new Date().toISOString(),phase})+'\\n');if(phase===2)throw new Error('模拟事件源暂时断流');return m;}
`;
await writeFile(path.join(dest,'host/sources/espn.js'),source);
console.log(dest);

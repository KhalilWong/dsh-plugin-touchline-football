/** Metrica CSV tracking importer. Coordinates missing in the source stay null. */
const number = value => value == null || String(value).trim() === '' ? NaN : Number(value);
const point = (cells, i) => {
  const x = number(cells[i]), y = number(cells[i + 1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};
export function parseTrackingCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const headerIndex = lines.findIndex((line, i) => i < 12 && line.split(',').some(cell => /^frame$/i.test(cell.trim())));
  if (headerIndex < 0) throw new Error('tracking CSV: no Frame column');
  const header = lines[headerIndex].split(',').map(s => s.trim());
  const fi = header.findIndex(s => /^frame$/i.test(s));
  const ti = header.findIndex(s => /^time(?: \[s\])?$/i.test(s));
  const pi = header.findIndex(s => /^period$/i.test(s));
  const bi = header.findIndex(s => /^ball(?: x)?$/i.test(s));
  const pairs = [];
  for (let i = 0; i < header.length; i++) {
    if (/^player\d+$/i.test(header[i]) || (/ x$/i.test(header[i]) && i !== bi)) {
      pairs.push({ name: header[i].replace(/ x$/i, ''), xi: i });
    }
  }
  if (ti < 0 || !pairs.length) throw new Error('tracking CSV: missing time or player columns');
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split(',');
    const frame = number(cells[fi]), time = number(cells[ti]);
    if (!Number.isFinite(frame) || !Number.isFinite(time)) continue;
    rows.push({ frame, time, period: pi < 0 ? 1 : number(cells[pi]),
      values: pairs.map(p => point(cells, p.xi)), ball: bi < 0 ? null : point(cells, bi) });
  }
  rows.sort((a,b) => a.time - b.time);
  return { players: pairs.map(p => p.name), rows, hasBallColumn: bi >= 0 };
}

// Retained for tools importing event metadata; replay positions use tracking only.
export function parseEventsCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const header = lines.shift().split(',').map(s => s.trim().toLowerCase());
  const at = name => header.indexOf(name);
  return lines.map(line => {
    const c = line.split(',');
    return { start: number(c[at('start frame')]), end: number(c[at('end frame')]),
      sx: number(c[at('start x')]), sy: number(c[at('start y')]),
      ex: number(c[at('end x')]), ey: number(c[at('end y')]) };
  }).filter(e => [e.start,e.sx,e.sy].every(Number.isFinite)).sort((a,b)=>a.start-b.start);
}

const blend = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
/** Only interpolate a short, bounded gap within the same period. No extrapolation. */
function channel(rows, getter, maxGap) {
  const points = rows.map(row => ({ time: row.time, period: row.period, value: getter(row) })).filter(p => p.value);
  let cursor = 0;
  return (time, period) => {
    while (cursor + 1 < points.length && points[cursor + 1].time <= time + 1e-8) cursor++;
    const a = points[cursor], b = points[cursor + 1];
    if (!a || a.period !== period) return null;
    if (Math.abs(time-a.time)<1e-8) return a.value;
    if (!b || b.period !== period || time<a.time || time>b.time || b.time-a.time>maxGap+1e-8) return null;
    return blend(a.value,b.value,(time-a.time)/(b.time-a.time));
  };
}

export function convertSample(input) {
  const fps = input.fps ?? 10, minutes = input.full ? Number.MAX_VALUE : input.minutes ?? 15;
  if (!(Number.isFinite(fps) && fps>0 && fps<=25 && Number.isFinite(minutes) && minutes>0)) throw new Error('invalid replay sampling options');
  const home = parseTrackingCsv(input.homeCsv), away = parseTrackingCsv(input.awayCsv);
  if (!home.rows.length || !away.rows.length) throw new Error('tracking CSV: no data');
  const start = Math.max(home.rows[0].time, away.rows[0].time);
  const end = Math.min(home.rows.at(-1).time,away.rows.at(-1).time) + 1/25;
  const duration = Math.min(minutes*60,end-start);
  const total = Math.ceil(duration*fps-1e-8);
  const maxGap = 0.4;
  // All tracked identities remain stable, including substitutes. Availability
  // is inferred from first/last observations, not from short missing gaps.
  const roster = (side, prefix, teamId) => side.players.map((name, i) => {
    let first, last;
    for (const row of side.rows) if (row.values[i]) { first ??= row.time; last = row.time; }
    return { id: `${prefix}-${name}`, name, jersey: name.replace(/^Player/i,''), teamId,
      start: first ?? Infinity, end: last == null ? -Infinity : last + 1/25, column: i };
  }).filter(p => Number.isFinite(p.start));
  const hr=roster(home,'home',input.teams[0].id), ar=roster(away,'away',input.teams[1].id);
  const substitutions=[];
  for (const roster of [hr, ar]) {
    for (const incoming of roster.filter(p=>p.start>start+1/25)) {
      const outgoing=roster.filter(p=>p!==incoming && p.start<incoming.start && Math.abs(p.end-1/25-incoming.start)<0.081);
      // Only report an unambiguous pair. A tracking dropout is not a substitution.
      if(outgoing.length===1) {
        const out=outgoing[0]; out.end=incoming.start;
        substitutions.push({time:incoming.start-start,teamId:incoming.teamId,out:out.id,in:incoming.id,source:'tracking-inferred'});
      }
    }
  }
  substitutions.sort((a,b)=>a.time-b.time);
  const rosterAll=[...hr,...ar];
  const channels = [...hr.map(p=>channel(home.rows,r=>r.values[p.column],maxGap)), ...ar.map(p=>channel(away.rows,r=>r.values[p.column],maxGap))];
  const homeBall=channel(home.rows,r=>r.ball,maxGap), awayBall=channel(away.rows,r=>r.ball,maxGap);
  const frames=[], periods=[];
  let cursor=0, missingPlayers=0, offPitchPlayers=0, missingBall=0, observedBall=0;
  for (let i=0;i<total;i++) {
    const time=start+i/fps;
    while(cursor+1<home.rows.length && home.rows[cursor+1].time<=time+1e-8)cursor++;
    const period=home.rows[cursor].period;
    periods.push(period);
    for(let slot=0;slot<channels.length;slot++) {
      const member=rosterAll[slot];
      const active=time+1e-8>=member.start && time<member.end-1e-8;
      const p=active ? channels[slot](time,period) : null;
      if(!active)offPitchPlayers++; else if(!p)missingPlayers++;
      frames.push(...(p?p.map(v=>Math.round(v*100000)/1000):[null,null]));
    }
    const ball=homeBall(time,period)??awayBall(time,period);
    if(ball)observedBall++;else missingBall++;
    frames.push(...(ball?ball.map(v=>Math.round(v*100000)/1000):[null,null]));
  }
  const players=rosterAll.map(({column,start:from,end:to,...p})=>({...p,activeFrom:Math.max(0,from-start),activeUntil:Math.min(duration,to-start)}));
  return { formatVersion:3,id:input.id,title:input.title,source:'metrica',fps,duration,teams:input.teams,players,
    hasBall:observedBall>0,frames,periods,substitutions:substitutions.filter(s=>s.time<duration),
    provenance:{provider:'Metrica Sports',url:'https://github.com/metrica-sports/sample-data',sourceFps:25,sourceStartSeconds:start,ball:'tracking',maxInterpolatedGapSeconds:maxGap,roster:'all-tracked-identities',missingPlayerSamples:missingPlayers,offPitchPlayerSamples:offPitchPlayers,missingBallSamples:missingBall} };
}

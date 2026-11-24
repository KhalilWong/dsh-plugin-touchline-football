/**
 * Touchline data source: ESPN public soccer feeds.
 *
 * Adapter contract (see ./index.js and ../docs/data-sources.md):
 *   id            stable source id used by the plugin config
 *   capabilities  { coordinates: boolean } — does this feed give pitch positions?
 *   getScoreboard(date) → { date, count, liveCount, matches[] }
 *   getMatch(matchId)   → normalized MatchResponse
 *
 * ESPN answers without a key, but it is public-not-official: no SLA, no
 * published licence, and the JSON shape can move. Keep request rates low
 * (the host caches for 20 s / 6 s and retries once) and never commit its
 * payloads to the repository.
 */
import { placeLineup } from './formations.js';

export const id = 'espn';
export const capabilities = { coordinates: true };
export const label = 'ESPN 公开足球接口';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Touchline/1.0';
const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/soccer';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson(url, { timeout = 16000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json, text/plain, */*',
          'user-agent': USER_AGENT,
          referer: 'https://www.espn.com/',
        },
      });
      if (!response.ok) throw new Error(`ESPN ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(450);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function clamp(value, min = 0, max = 100) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function color(value, fallback = '8a9a86') {
  const clean = String(value || '').replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean}` : `#${fallback}`;
}

function parseLeagueId(uid) {
  const match = String(uid || '').match(/~l:(\d+)~/);
  return match ? match[1] : null;
}

function clockSeconds(clock) {
  if (!clock) return 0;
  const value = Number(clock.value);
  return Number.isFinite(value) ? value : 0;
}

function displayClock(clock, fallback = '') {
  return String(clock?.displayValue || fallback || '');
}

function normalizeStatus(status) {
  const type = status?.type || {};
  const state = type.state || 'pre';
  return {
    state,
    completed: Boolean(type.completed),
    name: type.name || '',
    description: type.description || '',
    detail: type.detail || '',
    shortDetail: type.shortDetail || '',
    clock: Number(status?.clock) || 0,
    displayClock: status?.displayClock || "0'",
    period: Number(status?.period) || 0,
  };
}

function normalizeCompetitor(competitor) {
  const team = competitor?.team || {};
  return {
    id: String(competitor?.id || team.id || ''),
    name: team.displayName || team.name || 'Unknown',
    shortName: team.shortDisplayName || team.name || team.displayName || 'Unknown',
    abbr: team.abbreviation || (team.displayName || '???').slice(0, 3).toUpperCase(),
    color: color(team.color),
    altColor: color(team.alternateColor, 'f0eee4'),
    logo: team.logo || null,
    score: Number(competitor?.score) || 0,
    shootoutScore: Number(competitor?.shootoutScore) || 0,
    winner: Boolean(competitor?.winner),
    form: competitor?.form || '',
    homeAway: competitor?.homeAway === 'away' ? 'away' : 'home',
  };
}

function matchFromEvent(event) {
  const competition = event?.competitions?.[0];
  if (!competition) return null;
  const competitors = competition.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  if (!home || !away) return null;
  const status = competition.status || event.status;
  return {
    id: String(event.id),
    date: event.date,
    leagueName:
      competition.altGameNote ||
      competition.notes?.[0]?.text ||
      event.season?.slug ||
      'Football',
    leagueId: parseLeagueId(event.uid || competition.uid),
    venue: competition.venue?.fullName || event.venue?.displayName || '',
    city: competition.venue?.address?.city || '',
    country: competition.venue?.address?.country || '',
    status: normalizeStatus(status),
    home: normalizeCompetitor(home),
    away: normalizeCompetitor(away),
    broadcasts: [...new Set((competition.broadcasts || []).flatMap((b) => b.names || []))].slice(0, 4),
    hasPlayByPlay: Boolean(competition.playByPlayAvailable),
  };
}

export async function getScoreboard(date) {
  const raw = await fetchJson(`${ESPN_SITE}/all/scoreboard?dates=${date}`, { timeout: 18000, retries: 2 });
  const matches = (raw.events || []).map(matchFromEvent).filter(Boolean);
  matches.sort((a, b) => {
    const rank = (m) => (m.status.state === 'in' ? 0 : m.status.state === 'pre' ? 1 : 2);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff) return rankDiff;
    if (a.status.state === 'post') return new Date(b.date).getTime() - new Date(a.date).getTime();
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  return {
    date,
    fetchedAt: new Date().toISOString(),
    count: matches.length,
    liveCount: matches.filter((m) => m.status.state === 'in').length,
    matches,
  };
}

function normalizeStats(summary, homeId, awayId) {
  const teams = summary?.boxscore?.teams || [];
  const byTeam = new Map(teams.map((t) => [String(t.team?.id || ''), t]));
  const homeTeam = byTeam.get(String(homeId));
  const awayTeam = byTeam.get(String(awayId));
  if (!homeTeam?.statistics && !awayTeam?.statistics) return [];

  const homeMap = new Map((homeTeam?.statistics || []).map((s) => [s.name, s]));
  const awayMap = new Map((awayTeam?.statistics || []).map((s) => [s.name, s]));
  const names = [...new Set([...homeMap.keys(), ...awayMap.keys()])];
  const preferred = [
    'possessionPct',
    'totalShots',
    'shotsOnTarget',
    'wonCorners',
    'saves',
    'foulsCommitted',
    'yellowCards',
    'redCards',
    'offsides',
    'totalPasses',
    'passPct',
    'accuratePasses',
    'totalCrosses',
    'accurateCrosses',
    'expectedGoals',
    'expectedAssists',
  ];
  const ordered = [
    ...preferred.filter((name) => names.includes(name)),
    ...names.filter((name) => !preferred.includes(name)),
  ];

  const pct = (name, value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (name === 'passPct' || name === 'shotPct' || name === 'crossPct') {
      return Math.round((n <= 1 ? n * 100 : n) * 10) / 10;
    }
    return Math.round(n * 10) / 10;
  };

  const format = (name, value) => {
    if (value === null || value === undefined) return '—';
    if (name === 'possessionPct') return `${Math.round(value)}%`;
    if (name === 'passPct' || name === 'shotPct' || name === 'crossPct') return `${Math.round(value)}%`;
    if (name === 'expectedGoals' || name === 'expectedAssists') return Number(value).toFixed(2);
    return String(Math.round(value * 10) / 10);
  };

  return ordered
    .map((name) => {
      const h = homeMap.get(name);
      const a = awayMap.get(name);
      const hv = h ? pct(name, h.value ?? h.displayValue) : null;
      const av = a ? pct(name, a.value ?? a.displayValue) : null;
      if (hv === null && av === null) return null;
      return {
        key: name,
        label: h?.label || a?.label || name,
        home: hv,
        away: av,
        homeDisplay: format(name, hv),
        awayDisplay: format(name, av),
      };
    })
    .filter(Boolean);
}

function extractPlayer(text) {
  if (!text) return { playerName: '', teamNameFromText: '' };
  const match = String(text).match(
    /([\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+)*)\s+\(([^)]+)\)/u,
  );
  return match ? { playerName: match[1], teamNameFromText: match[2] } : { playerName: '', teamNameFromText: '' };
}

function normalizePlay(play, index) {
  const type = play.type || {};
  const typeText = type.text || '';
  const text = String(play.text || play.shortText || typeText || '').trim();
  const teamIdMatch = String(play.team?.$ref || '').match(/teams\/(\d+)/);
  const teamId = teamIdMatch ? teamIdMatch[1] : null;
  const participants = play.participants || [];
  const participantName = participants[0]?.athlete?.displayName || participants[0]?.athlete?.shortName || '';
  const { playerName: parsedName } = extractPlayer(text);
  const x = clamp(play.fieldPositionX);
  const y = clamp(play.fieldPositionY);
  const x2 = clamp(play.fieldPosition2X);
  const y2 = clamp(play.fieldPosition2Y);
  const typeKey = String(type.type || typeText).toLowerCase();
  const clock = clockSeconds(play.clock);
  const added = clockSeconds(play.addedClock);
  return {
    id: String(play.id || `${index}`),
    order: index,
    type: typeKey,
    typeText,
    text,
    shortText: play.shortText || '',
    clock,
    totalClock: clock + added,
    displayClock: displayClock(play.clock, ''),
    addedClock: added,
    period: Number(play.period?.number) || 1,
    teamId,
    playerName: participantName || parsedName,
    jersey: participants[0]?.jersey ? String(participants[0].jersey) : '',
    x,
    y,
    x2,
    y2,
    scoring: Boolean(play.scoringPlay),
    goal:
      Boolean(play.scoringPlay) ||
      typeKey === 'goal' ||
      typeKey === 'own-goal' ||
      typeKey === 'penalty-goal',
    yellow: Boolean(play.yellowCard) || typeKey === 'yellow-card',
    red: Boolean(play.redCard) || typeKey === 'red-card',
    sub: Boolean(play.substitution) || typeKey === 'substitution',
    shot:
      typeKey.includes('shot') ||
      typeKey === 'goal' ||
      typeKey === 'penalty-goal' ||
      typeKey === 'own-goal',
    corner: typeKey.includes('corner'),
    foul: typeKey.includes('foul'),
    offside: typeKey.includes('offside'),
    save: typeKey === 'save' || typeKey === 'save-on-target',
    penalty: Boolean(play.penaltyKick) || typeKey.includes('penalty'),
    ownGoal: Boolean(play.ownGoal) || typeKey === 'own-goal',
    shootout: Boolean(play.shootout),
    wallclock: play.wallclock || null,
    homeScore: play.homeScore != null && String(play.homeScore).trim() !== '' && Number.isFinite(Number(play.homeScore)) ? Number(play.homeScore) : null,
    awayScore: play.awayScore != null && String(play.awayScore).trim() !== '' && Number.isFinite(Number(play.awayScore)) ? Number(play.awayScore) : null,
  };
}

function normalizeDetail(detail, index) {
  const typeText = detail.scoringPlay
    ? detail.ownGoal
      ? 'Own Goal'
      : 'Goal'
    : detail.redCard
      ? 'Red Card'
      : detail.yellowCard
        ? 'Yellow Card'
        : 'Event';
  const players = (detail.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
  return {
    id: String(detail.id || `detail-${index}`),
    type: typeText.toLowerCase().replace(/\s+/g, '-'),
    typeText,
    text: detail.text || (players.length ? `${players.join(' · ')} — ${typeText}` : typeText),
    shortText: '',
    clock: clockSeconds(detail.clock),
    totalClock: clockSeconds(detail.clock) + clockSeconds(detail.addedClock),
    displayClock: displayClock(detail.clock, ''),
    addedClock: clockSeconds(detail.addedClock),
    period: Number(detail.period?.number) || 0,
    teamId: detail.team?.id ? String(detail.team.id) : null,
    playerName: players[0] || '',
    jersey: '',
    x: clamp(detail.fieldPositionX),
    y: clamp(detail.fieldPositionY),
    x2: clamp(detail.fieldPosition2X),
    y2: clamp(detail.fieldPosition2Y),
    scoring: Boolean(detail.scoringPlay),
    goal: Boolean(detail.scoringPlay),
    yellow: Boolean(detail.yellowCard),
    red: Boolean(detail.redCard),
    sub: Boolean(detail.substitution),
    shot: Boolean(detail.scoringPlay),
    corner: false,
    foul: false,
    offside: false,
    save: false,
    penalty: Boolean(detail.penaltyKick),
    ownGoal: Boolean(detail.ownGoal),
    shootout: Boolean(detail.shootout),
  };
}

function normalizeKeyEvent(event) {
  const type = event.type || {};
  const typeKey = String(type.type || type.text || '').toLowerCase();
  const players = (event.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
  const clock = clockSeconds(event.clock);
  const added = clockSeconds(event.addedClock);
  return {
    id: String(event.id || ''),
    type: typeKey,
    typeText: type.text || typeKey,
    text: event.text || event.shortText || type.text || '',
    shortText: event.shortText || '',
    clock,
    totalClock: clock + added,
    displayClock: displayClock(event.clock, ''),
    addedClock: added,
    period: Number(event.period?.number) || 0,
    teamId: event.team?.id ? String(event.team.id) : null,
    playerName: players[0] || extractPlayer(event.text).playerName,
    jersey: '',
    x: clamp(event.fieldPositionX),
    y: clamp(event.fieldPositionY),
    x2: clamp(event.fieldPosition2X),
    y2: clamp(event.fieldPosition2Y),
    scoring: Boolean(event.scoringPlay),
    goal: Boolean(event.scoringPlay) || typeKey === 'goal' || typeKey.includes('own-goal'),
    yellow: typeKey.includes('yellow'),
    red: typeKey.includes('red'),
    sub: typeKey.includes('sub'),
    shot: typeKey.includes('shot') || typeKey === 'goal',
    corner: typeKey.includes('corner'),
    foul: typeKey.includes('foul'),
    offside: typeKey.includes('offside'),
    save: typeKey.includes('save'),
    penalty: Boolean(event.penaltyKick) || typeKey.includes('penalty'),
    ownGoal: Boolean(event.ownGoal),
    shootout: Boolean(event.shootout),
  };
}

function normalizeCommentary(commentary) {
  return (commentary || []).slice(-160).map((item, index) => {
    const play = item.play || {};
    return {
      id: String(play.id || `commentary-${index}`),
      sequence: item.sequence ?? index,
      clock: clockSeconds(item.time),
      displayClock: displayClock(item.time, ''),
      text: item.text || play.text || '',
      type: String(play.type?.type || play.type?.text || '').toLowerCase(),
      teamId: play.team?.id ? String(play.team.id) : null,
      playerName: extractPlayer(item.text || play.text).playerName,
      x: clamp(play.fieldPositionX),
      y: clamp(play.fieldPositionY),
      x2: clamp(play.fieldPosition2X),
      y2: clamp(play.fieldPosition2Y),
      scoring: Boolean(play.scoringPlay),
    };
  });
}

function normalizeRoster(teamRoster, team) {
  const roster = teamRoster?.roster || [];
  const starters = roster.filter((p) => p.starter).sort((a, b) => Number(a.formationPlace || 99) - Number(b.formationPlace || 99));
  const bench = roster.filter((p) => !p.starter);
  const chosen = [...starters.slice(0, 11)];
  if (chosen.length < 11) {
    for (const player of bench) {
      if (chosen.length >= 11) break;
      chosen.push(player);
    }
  }
  const players = chosen.map((p) => ({
    id: String(p.athlete?.id || p.playerId || ''),
    name: p.athlete?.displayName || p.athlete?.fullName || 'Unknown',
    shortName: p.athlete?.shortName || p.athlete?.displayName || 'Unknown',
    jersey: String(p.jersey || ''),
    position: p.position?.name || '',
    positionAbbr: p.position?.abbreviation || '',
    formationPlace: String(p.formationPlace || ''),
    starter: Boolean(p.starter),
    subbedIn: Boolean(p.subbedIn?.didSub || p.subbedIn),
    subbedOut: Boolean(p.subbedOut?.didSub || p.subbedOut),
  }));
  const placed = placeLineup(players, teamRoster?.formation || '4-3-3');
  return {
    teamId: String(team?.id || ''),
    formation: teamRoster?.formation || '4-3-3',
    starters: placed,
    benchCount: bench.length,
    available: roster.length > 0,
  };
}

function syntheticLineup(team, homeAway) {
  const base = [
    ['1', '门将', 'G'],
    ['2', '右后卫', 'RB'],
    ['4', '中卫', 'CB'],
    ['5', '中卫', 'CB'],
    ['3', '左后卫', 'LB'],
    ['6', '后腰', 'CDM'],
    ['8', '中场', 'CM'],
    ['10', '前腰', 'AM'],
    ['7', '右边锋', 'RW'],
    ['9', '中锋', 'ST'],
    ['11', '左边锋', 'LW'],
  ];
  const players = base.map(([jersey, name, positionAbbr], index) => ({
    id: `${team.id}-${index}`,
    name: `${team.shortName} ${name}`,
    shortName: `${name}`,
    jersey,
    position: positionAbbr,
    positionAbbr,
    formationPlace: String(index + 1),
    starter: true,
  }));
  return {
    teamId: String(team.id),
    formation: '4-3-3',
    starters: placeLineup(players, '4-3-3'),
    benchCount: 0,
    available: false,
    synthetic: true,
    homeAway,
  };
}

function teamFromCompetitor(competitor) {
  const team = competitor?.team || {};
  return {
    id: String(competitor?.id || team.id || ''),
    name: team.displayName || team.name || 'Unknown',
    shortName: team.shortDisplayName || team.name || 'Unknown',
    abbr: team.abbreviation || '???',
    color: color(team.color),
    altColor: color(team.alternateColor, 'f0eee4'),
    logo: team.logo || null,
    score: Number(competitor?.score) || 0,
    shootoutScore: Number(competitor?.shootoutScore) || 0,
    winner: Boolean(competitor?.winner),
    form: competitor?.form || '',
    homeAway: competitor?.homeAway === 'away' ? 'away' : 'home',
  };
}

function scoreLabel(status) {
  if (status.state === 'pre') return '未开始';
  if (status.state === 'post') return '已结束';
  return status.displayClock || 'LIVE';
}

// ESPN reports both teams' actions towards x=100. Keep one pitch frame:
// home attacks right, away attacks left, including after half-time.
function orientPlay(play, awayId) {
  if (!awayId || play.teamId !== awayId) return play;
  const result = { ...play };
  for (const axis of ['x', 'y', 'x2', 'y2']) {
    if (Number.isFinite(result[axis])) result[axis] = 100 - result[axis];
  }
  return result;
}

function markRestarts(plays) {
  let goal = null;
  for (const play of plays) {
    if (goal && play.period !== goal.period) goal = null;
    if (play.goal) { goal = play; continue; }
    if (!goal) continue;
    // Some feeds omit a separate kick-off event. Only classify the first
    // subsequent on-ball action when it is the other team's centre pass.
    if (Number.isFinite(play.x) && Number.isFinite(play.y)) {
      if (play.type === 'pass' && play.teamId && goal.teamId && play.teamId !== goal.teamId &&
          play.totalClock > goal.totalClock && play.totalClock - goal.totalClock <= 300 &&
          Math.hypot(play.x - 50, play.y - 50) <= 3) play.restart = 'kickoff-after-goal';
      goal = null;
    } else if (/kick[ -]?off|^pass$|end-|start-/i.test(play.type)) goal = null;
  }
}

export async function getMatch(eventId) {
  const summaryUrl = `${ESPN_SITE}/all/summary?event=${encodeURIComponent(eventId)}`;
  const summary = await fetchJson(summaryUrl, { timeout: 8000, retries: 0 });
  const competition = summary?.header?.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const homeCompetitor = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayCompetitor = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const home = teamFromCompetitor(homeCompetitor);
  const away = teamFromCompetitor(awayCompetitor);
  const status = normalizeStatus(competition.status);
  const league = summary?.header?.league || {};
  const leagueSlug = league.slug || 'all';

  let plays = [];
  let playsError = null;
  if (status.state !== 'pre' || competition.playByPlayAvailable) {
    try {
      const base = `${ESPN_CORE}/leagues/${encodeURIComponent(leagueSlug)}/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(eventId)}/plays`;
      const first = await fetchJson(`${base}?limit=1000`, { timeout: 4000, retries: 0 });
      const items = [...(first.items || [])];
      const pageCount = Number(first.pageCount) || 1;
      if (pageCount > 1) {
        const remaining = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, i) =>
            fetchJson(`${base}?limit=1000&page=${i + 2}`, { timeout: 4000, retries: 0 }),
          ),
        );
        for (const page of remaining) items.push(...(page.items || []));
      }
      plays = items.map(normalizePlay).map(play => orientPlay(play, away.id));
      plays.sort((a, b) => a.totalClock - b.totalClock || a.order - b.order);
      plays.forEach((play, index) => {
        play.order = index;
      });
      markRestarts(plays);
    } catch (error) {
      playsError = error.message || 'play-by-play unavailable';
    }
  }

  const rosters = summary?.rosters || [];
  const homeRoster = rosters.find((r) => r.homeAway === 'home') || rosters[0];
  const awayRoster = rosters.find((r) => r.homeAway === 'away') || rosters[1];
  const homeLineup = homeRoster?.roster?.length ? normalizeRoster(homeRoster, home) : syntheticLineup(home, 'home');
  const awayLineup = awayRoster?.roster?.length ? normalizeRoster(awayRoster, away) : syntheticLineup(away, 'away');

  const keyEvents = (summary?.keyEvents || []).map(normalizeKeyEvent).map(play => orientPlay(play, away.id));
  const detailEvents = (competition.details || []).map(normalizeDetail).map(play => orientPlay(play, away.id));
  const timeline = [...keyEvents];
  const timelineKeys = new Set(
    timeline.map((e) => `${e.typeText}|${e.totalClock}|${e.playerName}|${e.teamId}`),
  );
  for (const detail of detailEvents) {
    const fingerprint = `${detail.typeText}|${detail.totalClock}|${detail.playerName}|${detail.teamId}`;
    if (!timelineKeys.has(fingerprint)) {
      timeline.push(detail);
      timelineKeys.add(fingerprint);
    }
  }
  timeline.sort((a, b) => a.totalClock - b.totalClock || a.id.localeCompare(b.id));

  const commentary = normalizeCommentary(summary?.commentary);
  const latestPlay = plays.length ? plays[plays.length - 1] : null;

  if (status.state === 'in') {
    const parsed = String(status.displayClock || '').match(/(\d+)(?:\+(\d+))?/);
    const boardClock = parsed
      ? Number(parsed[1]) * 60 + Number(parsed[2] || 0) * 60
      : 0;
    status.clock = Math.max(status.clock || 0, boardClock || 0, latestPlay?.totalClock || 0);
    if (!status.displayClock || status.displayClock === "0'") {
      const minute = Math.floor(status.clock / 60);
      status.displayClock = `${minute}'`;
    }
  }

  const stats = normalizeStats(summary, home.id, away.id);

  const venueInfo = competition.venue || summary?.gameInfo?.venue || null;
  const venue = venueInfo
    ? {
        name: venueInfo.fullName || '',
        city: venueInfo.address?.city || '',
        country: venueInfo.address?.country || '',
      }
    : { name: '', city: '', country: '' };

  return {
    id: String(eventId),
    league: {
      id: String(league.id || ''),
      name: league.name || competition.altGameNote || 'Football',
      slug: leagueSlug,
      abbr: league.abbreviation || '',
    },
    date: competition.date || summary?.header?.date || null,
    venue,
    status,
    statusLabel: scoreLabel(status),
    home,
    away,
    lineups: { home: homeLineup, away: awayLineup },
    stats,
    timeline,
    commentary,
    plays,
    playCount: plays.length,
    latestPlayClock: latestPlay?.totalClock ?? null,
    latestPlay,
    playsError,
    source: {
      provider: 'ESPN',
      coordinateSystem: 'home-attacks-right',
      summaryUrl,
      fetchedAt: new Date().toISOString(),
      playByPlay: plays.length > 0,
      tracksBall: plays.some((p) => p.x !== null),
    },
  };
}

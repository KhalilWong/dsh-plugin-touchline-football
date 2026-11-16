export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function dateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}${m}${d}`;
}

export function shiftDateKey(key: string, days: number) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(4, 6));
  const d = Number(key.slice(6, 8));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dateKeyLocal(date);
}

export function dateFromKey(key: string) {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
}

export function kickoffTime(iso: string) {
  if (!iso) return '--:--';
  const date = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function longDateLabel(key: string) {
  const date = dateFromKey(key);
  const today = new Date();
  const todayKey = dateKeyLocal(today);
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  if (key === todayKey) return '今天';
  if (key === tomorrowKey) return '明天';
  if (key === yesterdayKey) return '昨天';
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

export function shortDateLabel(key: string) {
  const date = dateFromKey(key);
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
}

export function isLightColor(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}

export function teamTextColor(hex: string) {
  return isLightColor(hex) ? '#101510' : '#f4f1e5';
}

export function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function statLabel(key: string, fallback = '') {
  const labels: Record<string, string> = {
    possessionPct: '控球率',
    totalShots: '射门',
    shotsOnTarget: '射正',
    wonCorners: '角球',
    saves: '扑救',
    foulsCommitted: '犯规',
    yellowCards: '黄牌',
    redCards: '红牌',
    offsides: '越位',
    totalPasses: '传球',
    passPct: '传球成功率',
    accuratePasses: '成功传球',
    totalCrosses: '传中',
    accurateCrosses: '成功传中',
    expectedGoals: '预期进球 xG',
    expectedAssists: '预期助攻 xA',
    blockedShots: '被封堵',
    interceptions: '拦截',
    effectiveTackles: '抢断',
    totalTackles: '尝试抢断',
    totalClearance: '解围',
  };
  return labels[key] || fallback;
}

export function eventVerb(type: string, typeText: string) {
  const t = `${type} ${typeText}`.toLowerCase();
  if (t.includes('goal')) return '进球';
  if (t.includes('yellow')) return '黄牌';
  if (t.includes('red')) return '红牌';
  if (t.includes('sub')) return '换人';
  if (t.includes('corner')) return '角球';
  if (t.includes('shot') || t.includes('attempt') || t.includes('save')) return '攻门';
  if (t.includes('offside')) return '越位';
  if (t.includes('foul')) return '犯规';
  if (t.includes('half') || t.includes('kickoff')) return '节拍';
  return typeText || '事件';
}

export function modeLabel(mode: 'live' | 'replay' | 'pre') {
  if (mode === 'live') return '直播映射';
  if (mode === 'replay') return '比赛回放';
  return '赛前';
}

export function phaseLabel(status: { state: string; description: string; period: number; displayClock: string }) {
  if (status.state === 'pre') return '未开赛';
  if (status.state === 'post') return '全场结束';
  if (/half.?time/i.test(status.description)) return '中场';
  if (/penalt/i.test(status.description)) return '点球';
  if (status.period === 1) return '上半场';
  if (status.period === 2) return '下半场';
  if (status.period >= 3) return '加时';
  return status.description || '进行中';
}

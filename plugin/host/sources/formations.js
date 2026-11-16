const POSITION_INFO = {
  G: { group: 'gk', y: 50 },
  GK: { group: 'gk', y: 50 },
  RB: { group: 'def', y: 88 },
  LB: { group: 'def', y: 12 },
  RWB: { group: 'def', y: 92 },
  LWB: { group: 'def', y: 8 },
  'CD-R': { group: 'def', y: 63 },
  'CD-L': { group: 'def', y: 37 },
  CB: { group: 'def', y: 50 },
  SW: { group: 'def', y: 50 },
  D: { group: 'def', y: 50 },
  CDM: { group: 'mid', y: 50, advance: 0.05 },
  DM: { group: 'mid', y: 50, advance: 0.05 },
  CM: { group: 'mid', y: 50, advance: 0.25 },
  LM: { group: 'mid', y: 32, advance: 0.2 },
  RM: { group: 'mid', y: 68, advance: 0.2 },
  M: { group: 'mid', y: 50, advance: 0.3 },
  AM: { group: 'mid', y: 50, advance: 0.85 },
  'AM-L': { group: 'mid', y: 20, advance: 0.9 },
  'AM-R': { group: 'mid', y: 80, advance: 0.9 },
  LW: { group: 'fwd', y: 14, advance: 1 },
  RW: { group: 'fwd', y: 86, advance: 1 },
  F: { group: 'fwd', y: 50, advance: 1 },
  CF: { group: 'fwd', y: 50, advance: 1 },
  ST: { group: 'fwd', y: 50, advance: 1 },
  S: { group: 'fwd', y: 50, advance: 1 },
};

export function parseFormation(formation) {
  const numbers = String(formation || '')
    .match(/\d+/g)
    ?.map(Number)
    .filter((n) => n >= 1 && n <= 6);
  if (numbers && numbers.length >= 2 && numbers.reduce((a, b) => a + b, 0) === 10) {
    return numbers;
  }
  return [4, 3, 3];
}

function infoFor(player) {
  const abbr = String(player.positionAbbr || '').toUpperCase();
  if (POSITION_INFO[abbr]) return POSITION_INFO[abbr];
  if (abbr.startsWith('CD')) return POSITION_INFO.CB;
  if (abbr.startsWith('AM')) return POSITION_INFO.AM;
  if (abbr.startsWith('LM')) return POSITION_INFO.LM;
  if (abbr.startsWith('RM')) return POSITION_INFO.RM;
  if (abbr.startsWith('CM')) return POSITION_INFO.CM;
  if (abbr.startsWith('DM')) return POSITION_INFO.DM;
  const name = String(player.position || '').toLowerCase();
  if (name.includes('goal')) return POSITION_INFO.G;
  if (name.includes('back') || name.includes('defend')) return POSITION_INFO.CB;
  if (name.includes('midfield')) return POSITION_INFO.CM;
  if (name.includes('forward') || name.includes('striker') || name.includes('wing')) {
    return POSITION_INFO.F;
  }
  return POSITION_INFO.M;
}

function lineYs(count) {
  if (count <= 1) return [50];
  const spread = Math.min(70, 15 + count * 11);
  const top = 50 - spread / 2;
  return Array.from({ length: count }, (_, i) => top + (i * spread) / (count - 1));
}

function byPreference(a, b) {
  return infoFor(a).y - infoFor(b).y || Number(a.formationPlace || 99) - Number(b.formationPlace || 99);
}

export function placeLineup(players, formation) {
  const rows = parseFormation(formation);
  const outfield = players.filter((p) => String(p.positionAbbr || '').toUpperCase() !== 'G' && String(p.positionAbbr || '').toUpperCase() !== 'GK');
  const keepers = players.filter((p) => !outfield.includes(p));
  const keeper = keepers[0] || players[0];

  const groups = { def: [], mid: [], fwd: [] };
  for (const p of outfield) {
    groups[infoFor(p).group].push(p);
  }

  const defCount = rows[0];
  const fwdCount = rows[rows.length - 1];
  const defenders = groups.def.slice(0, defCount);
  const forwards = groups.fwd.slice(0, fwdCount);

  const leftovers = outfield.filter((p) => !defenders.includes(p) && !forwards.includes(p));
  const mids = leftovers.slice();
  while (defenders.length < defCount && mids.length) {
    const candidate = mids
      .filter((p) => infoFor(p).group === 'mid')
      .sort((a, b) => infoFor(a).advance - infoFor(b).advance)[0] || mids[0];
    defenders.push(candidate);
    mids.splice(mids.indexOf(candidate), 1);
  }
  while (forwards.length < fwdCount && mids.length) {
    const candidate = mids
      .filter((p) => infoFor(p).group === 'mid')
      .sort((a, b) => infoFor(b).advance - infoFor(a).advance)[0] || mids[mids.length - 1];
    forwards.push(candidate);
    mids.splice(mids.indexOf(candidate), 1);
  }

  const result = [];
  const lineCount = rows.length;
  const xs = rows.map((_, i) => (lineCount === 1 ? 45 : 19 + (i * 53) / (lineCount - 1)));

  const placeRow = (list, lineIndex, count) => {
    const targets = lineYs(count);
    const sorted = list.slice().sort(byPreference);
    for (let i = 0; i < count; i += 1) {
      const player = sorted[i] || list[i];
      if (!player) continue;
      result.push({
        ...player,
        slotX: Math.round(xs[lineIndex] * 10) / 10,
        slotY: Math.round((targets[i] ?? 50) * 10) / 10,
        lineIndex,
      });
    }
  };

  placeRow(defenders, 0, rows[0]);
  if (lineCount > 2) {
    const midRows = rows.slice(1, -1);
    const midSlots = [];
    midRows.forEach((count, idx) => {
      for (let i = 0; i < count; i += 1) midSlots.push({ lineIndex: idx + 1, count });
    });
    const sortedMids = mids.slice().sort((a, b) => infoFor(a).advance - infoFor(b).advance);
    midRows.forEach((count, idx) => {
      const slice = sortedMids.splice(0, count);
      placeRow(slice, idx + 1, count);
    });
    if (sortedMids.length) {
      placeRow(sortedMids, lineCount - 2, sortedMids.length);
    }
  } else if (lineCount === 2) {
    placeRow(mids, 0, mids.length);
  }
  placeRow(forwards, lineCount - 1, rows[rows.length - 1]);

  if (keeper) {
    result.unshift({
      ...keeper,
      slotX: 6.5,
      slotY: 50,
      lineIndex: 0,
    });
  }

  return result;
}

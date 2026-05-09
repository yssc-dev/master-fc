// N×N 시너지 매트릭스: 같은팀 출전 라운드의 팀승률
// our_members_json + opponent_members_json 양쪽 모두 처리하고 (date, match_id) 단위로 dedupe
export function calcSynergyMatrix({ matchLogs, minRounds = 5 }) {
  const playerSet = new Set();
  const cells = {};
  const seenByKey = {}; // key -> Set<roundKey>
  const bump = (key, outcome, roundKey) => {
    if (!seenByKey[key]) seenByKey[key] = new Set();
    if (seenByKey[key].has(roundKey)) return;
    seenByKey[key].add(roundKey);
    if (!cells[key]) cells[key] = { games: 0, wins: 0, draws: 0, losses: 0 };
    cells[key].games++;
    if (outcome === 'W') cells[key].wins++;
    else if (outcome === 'D') cells[key].draws++;
    else cells[key].losses++;
  };

  const parseMembers = (s) => {
    try {
      const parsed = JSON.parse(s || '[]');
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : [];
    } catch { return []; }
  };

  for (const m of matchLogs || []) {
    const home = parseMembers(m.our_members_json);
    const away = parseMembers(m.opponent_members_json);
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const homeOutcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');
    const awayOutcome = opp > our ? 'W' : (our === opp ? 'D' : 'L');
    const roundKey = `${m.date}|${m.match_id}`;

    const tally = (members, outcome) => {
      if (members.length === 0) return;
      members.forEach(n => playerSet.add(n));
      for (const name of members) bump(`${name}|${name}`, outcome, roundKey);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const [a, b] = [members[i], members[j]].sort((x, y) => x.localeCompare(y, 'ko'));
          bump(`${a}|${b}`, outcome, roundKey);
        }
      }
    };

    tally(home, homeOutcome);
    tally(away, awayOutcome);
  }

  // 1차: 각 셀 winRate 계산
  for (const k of Object.keys(cells)) {
    const c = cells[k];
    c.winRate = c.games > 0 ? (c.wins + 0.5 * c.draws) / c.games : 0;
  }
  // 2차: 페어 셀에 liftSymmetric 부착 — 두 사람 개인 평균 승률 대비 함께 뛸 때 추가 효과
  // self 셀(name|name)은 개인 전체 승률이므로 lift 0
  for (const k of Object.keys(cells)) {
    const [a, b] = k.split('|');
    if (a === b) { cells[k].liftSymmetric = 0; continue; }
    const aRate = cells[`${a}|${a}`]?.winRate ?? 0;
    const bRate = cells[`${b}|${b}`]?.winRate ?? 0;
    cells[k].liftSymmetric = cells[k].winRate - (aRate + bRate) / 2;
  }

  return {
    players: [...playerSet].sort((a, b) => a.localeCompare(b, 'ko')),
    cells,
    minRounds,
  };
}

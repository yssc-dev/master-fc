// 선수 분석 탭 재설계용 순수 계산 함수 모음.
// React/DOM 의존성 없음 — 테스트 가능성 최우선.

export function calcTeamRanking(record) {
  const { teamNames, matches } = record;
  const stats = {};
  teamNames.forEach(name => {
    stats[name] = { wins: 0, losses: 0, gf: 0, ga: 0 };
  });
  (matches || []).forEach(m => {
    if (m.isExtra) return;
    const home = teamNames[m.homeIdx];
    const away = teamNames[m.awayIdx];
    if (!home || !away) return;
    stats[home].gf += m.homeScore;
    stats[home].ga += m.awayScore;
    stats[away].gf += m.awayScore;
    stats[away].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { stats[home].wins++; stats[away].losses++; }
    else if (m.homeScore < m.awayScore) { stats[away].wins++; stats[home].losses++; }
    // draws not tracked — not used in comparator
  });
  return teamNames.slice().sort((a, b) => {
    const sa = stats[a], sb = stats[b];
    if (sb.wins !== sa.wins) return sb.wins - sa.wins;
    const da = sa.gf - sa.ga, db = sb.gf - sb.ga;
    if (db !== da) return db - da;
    if (sb.gf !== sa.gf) return sb.gf - sa.gf;
    return a.localeCompare(b, 'ko'); // stable alphabetical fallback when all criteria tie
  });
}

export function calcCrovaGogumaFreq(gameRecords) {
  const crova = {}, goguma = {};
  (gameRecords || []).forEach(record => {
    const ranking = calcTeamRanking(record);
    if (ranking.length === 0) return;
    const firstTeam = ranking[0];
    const lastTeam = ranking[ranking.length - 1];
    const firstIdx = record.teamNames.indexOf(firstTeam);
    const lastIdx = record.teamNames.indexOf(lastTeam);
    (record.teams?.[firstIdx] || []).forEach(p => {
      crova[p] = (crova[p] || 0) + 1;
    });
    if (firstIdx !== lastIdx) { // skip when only 1 team in session (1st and last resolve to same team)
      (record.teams?.[lastIdx] || []).forEach(p => {
        goguma[p] = (goguma[p] || 0) + 1;
      });
    }
  });
  return { crova, goguma };
}

export function calcRoundMidpointTimePattern(gameRecords) {
  const stats = {};
  (gameRecords || []).forEach(record => {
    const mainMatches = (record.matches || []).filter(m => !m.isExtra);
    const N = mainMatches.length;
    if (N <= 1) return; // N=1이면 midpoint=0 → 전부 late로 분류됨. 의미 없는 세션은 건너뜀.
    const midpoint = Math.floor(N / 2);
    const matchIndex = {};
    mainMatches.forEach((m, i) => { matchIndex[m.matchId] = i; });
    (record.events || []).forEach(ev => {
      if (ev.type !== 'goal') return;
      const idx = matchIndex[ev.matchId];
      if (idx === undefined) return;
      const player = ev.player;
      if (!stats[player]) stats[player] = { early: 0, late: 0, total: 0 };
      if (idx < midpoint) stats[player].early++;
      else stats[player].late++;
      stats[player].total++;
    });
  });
  return stats;
}

/**
 * @param {'best'|'worst'} direction — 'worst'만 승률 asc, 그 외는 모두 'best' (desc)
 */
export function sortSynergyWithTieBreak(partners, direction) {
  const arr = partners.slice();
  arr.sort((a, b) => {
    const rateDiff = direction === 'worst' ? a.winRate - b.winRate : b.winRate - a.winRate;
    if (rateDiff !== 0) return rateDiff;
    if (b.games !== a.games) return b.games - a.games;
    return a.name.localeCompare(b.name, 'ko');
  });
  return arr;
}

// _late는 미사용. 호출부 가독성(early + late + total 대칭)을 위해 유지.
export function classifyTimeSlot(early, _late, total) {
  if (total < 5) return null;
  const earlyRate = early / total;
  if (earlyRate >= 0.6) return { label: '초반형', emoji: '🔥' };
  if (earlyRate <= 0.4) return { label: '후반형', emoji: '⚡' };
  return { label: '균형형', emoji: '⚖️' };
}

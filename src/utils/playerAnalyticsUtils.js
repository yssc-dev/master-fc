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

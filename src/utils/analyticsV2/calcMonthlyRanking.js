// 특정 YYYY-MM 기준 득점/어시/승률 TOP N
export function calcMonthlyRanking({ yearMonth, playerLogs, matchLogs, topN = 5 }) {
  if (!yearMonth) return { goals: [], assists: [], winRate: [] };

  const inMonth = (d) => typeof d === 'string' && d.startsWith(yearMonth + '-');

  const goalsMap = {}, assistsMap = {};
  for (const p of playerLogs || []) {
    if (!inMonth(p.date)) continue;
    goalsMap[p.player] = (goalsMap[p.player] || 0) + (Number(p.goals) || 0);
    assistsMap[p.player] = (assistsMap[p.player] || 0) + (Number(p.assists) || 0);
  }

  const winMap = {};
  for (const m of matchLogs || []) {
    if (!inMonth(m.date)) continue;
    let members;
    try { members = JSON.parse(m.our_members_json || '[]'); } catch { continue; }
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const outcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');
    for (const name of members) {
      if (!winMap[name]) winMap[name] = { wins: 0, draws: 0, games: 0 };
      winMap[name].games++;
      if (outcome === 'W') winMap[name].wins++;
      else if (outcome === 'D') winMap[name].draws++;
    }
  }

  const toList = (map, valueFn) =>
    Object.entries(map)
      .map(([player, v]) => ({ player, ...valueFn(v) }))
      .filter(x => x.value > 0 || x.games > 0)
      .sort((a, b) => b.value - a.value || a.player.localeCompare(b.player, 'ko'))
      .slice(0, topN);

  return {
    goals: toList(goalsMap, v => ({ value: v })),
    assists: toList(assistsMap, v => ({ value: v })),
    winRate: toList(winMap, v => ({ value: (v.wins + 0.5 * v.draws) / v.games, games: v.games })),
  };
}

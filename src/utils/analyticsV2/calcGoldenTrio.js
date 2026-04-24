// 3인 조합 승률 TOP N
export function calcGoldenTrio({ matchLogs, minRounds = 3, topN = 5 }) {
  const trios = {};
  const bump = (key, outcome) => {
    if (!trios[key]) trios[key] = { games: 0, wins: 0, draws: 0, losses: 0 };
    trios[key].games++;
    if (outcome === 'W') trios[key].wins++;
    else if (outcome === 'D') trios[key].draws++;
    else trios[key].losses++;
  };

  for (const m of matchLogs || []) {
    let members;
    try {
      const parsed = JSON.parse(m.our_members_json || '[]');
      members = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : null;
    } catch { continue; }
    if (!members || members.length < 3) continue;

    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const outcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');

    const sorted = [...members].sort((a, b) => a.localeCompare(b, 'ko'));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        for (let k = j + 1; k < sorted.length; k++) {
          bump(`${sorted[i]}|${sorted[j]}|${sorted[k]}`, outcome);
        }
      }
    }
  }

  return Object.entries(trios)
    .filter(([, v]) => v.games >= minRounds)
    .map(([key, v]) => ({
      members: key.split('|'),
      games: v.games, wins: v.wins, draws: v.draws, losses: v.losses,
      winRate: (v.wins + 0.5 * v.draws) / v.games,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, topN);
}

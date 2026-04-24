// 선수의 최근 세션 트렌드: 경기당 득점/어시, 팀승률 + 이동평균
export function calcTrends({ playerName, playerLogs, matchLogs, maxSessions = 12, smoothWindow = 3 }) {
  if (!playerName || !playerLogs || !matchLogs) return { points: [], smoothed: [] };

  const playerSessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (playerSessions.length === 0) return { points: [], smoothed: [] };

  const sessionMatches = {};
  for (const m of matchLogs) {
    let members;
    try { members = JSON.parse(m.our_members_json || '[]'); } catch { continue; }
    if (!members.includes(playerName)) continue;
    if (!sessionMatches[m.date]) sessionMatches[m.date] = [];
    sessionMatches[m.date].push(m);
  }

  const points = playerSessions.map(p => {
    const matches = sessionMatches[p.date] || [];
    let wins = 0, draws = 0;
    const total = matches.length;
    for (const m of matches) {
      const our = Number(m.our_score) || 0;
      const opp = Number(m.opponent_score) || 0;
      if (our > opp) wins++;
      else if (our === opp) draws++;
    }
    const winRate = total > 0 ? (wins + 0.5 * draws) / total : 0;
    const gpg = total > 0 ? (p.goals || 0) / total : 0;
    const apg = total > 0 ? (p.assists || 0) / total : 0;
    return { date: p.date, gpg, apg, winRate };
  });

  const capped = points.slice(-maxSessions);

  const smoothed = capped.map((_, i) => {
    const start = Math.max(0, i - smoothWindow + 1);
    const window = capped.slice(start, i + 1);
    const avg = (key) => window.reduce((s, w) => s + w[key], 0) / window.length;
    return { date: capped[i].date, gpg: avg('gpg'), apg: avg('apg'), winRate: avg('winRate') };
  });

  return { points: capped, smoothed };
}

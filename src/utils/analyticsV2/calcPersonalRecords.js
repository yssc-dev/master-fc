// Personal Records: 단일 세션 최고치 + GK 최장 무실점
export function calcPersonalRecords({ playerName, playerLogs }) {
  const empty = { mostGoals: null, mostAssists: null, longestCleanSheet: null, bestRankScore: null };
  if (!playerName || !playerLogs) return empty;

  const sessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sessions.length === 0) return empty;

  const pickMax = (key) => {
    let best = null;
    for (const s of sessions) {
      const v = Number(s[key]) || 0;
      if (best === null || v > best.value) best = { value: v, date: s.date };
    }
    return best && best.value > 0 ? best : null;
  };

  let cur = 0, curStart = null;
  let best = null;
  for (const s of sessions) {
    if ((s.keeper_games || 0) === 0) continue;
    if ((s.conceded || 0) === 0) {
      if (cur === 0) curStart = s.date;
      cur++;
      if (!best || cur > best.value) best = { value: cur, startDate: curStart, endDate: s.date };
    } else {
      cur = 0; curStart = null;
    }
  }

  return {
    mostGoals: pickMax('goals'),
    mostAssists: pickMax('assists'),
    longestCleanSheet: best,
    bestRankScore: pickMax('rank_score'),
  };
}

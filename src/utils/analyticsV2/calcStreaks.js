// 연속 기록: 득점 세션 / GK 무실점 세션
export function calcStreaks({ playerName, playerLogs }) {
  const empty = { current: 0, best: 0 };
  if (!playerName || !playerLogs) return { scoringStreak: empty, cleanSheetStreak: empty };

  const sessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));

  let curScore = 0, bestScore = 0;
  for (const s of sessions) {
    if ((s.goals || 0) >= 1) { curScore++; if (curScore > bestScore) bestScore = curScore; }
    else curScore = 0;
  }

  let curCs = 0, bestCs = 0;
  for (const s of sessions) {
    if ((s.keeper_games || 0) === 0) continue;
    if ((s.conceded || 0) === 0) { curCs++; if (curCs > bestCs) bestCs = curCs; }
    else curCs = 0;
  }

  return {
    scoringStreak: { current: curScore, best: bestScore },
    cleanSheetStreak: { current: curCs, best: bestCs },
  };
}

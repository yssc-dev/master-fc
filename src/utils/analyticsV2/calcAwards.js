// 재미 어워드: 불꽃(해트트릭+) / 수호신(세션 내 전 GK경기 무실점) / 자책 랭킹
export function calcAwards({ playerLogs, topN = {} }) {
  const limits = {
    fireStarter: topN.fireStarter ?? 5,
    guardian: topN.guardian ?? 5,
    owngoal: topN.owngoal ?? 3,
  };

  const fire = {}, guard = {}, own = {};
  for (const p of playerLogs || []) {
    const name = p.player;
    if ((Number(p.goals) || 0) >= 3) fire[name] = (fire[name] || 0) + 1;
    if ((Number(p.keeper_games) || 0) >= 2 && (Number(p.conceded) || 0) === 0) {
      guard[name] = (guard[name] || 0) + 1;
    }
    const og = Number(p.owngoals) || 0;
    if (og > 0) own[name] = (own[name] || 0) + og;
  }

  const toList = (map, key, limit) =>
    Object.entries(map)
      .map(([player, value]) => ({ player, [key]: value }))
      .sort((a, b) => b[key] - a[key] || a.player.localeCompare(b.player, 'ko'))
      .slice(0, limit);

  return {
    fireStarter: toList(fire, 'count', limits.fireStarter),
    guardian: toList(guard, 'count', limits.guardian),
    owngoalKings: toList(own, 'total', limits.owngoal),
  };
}

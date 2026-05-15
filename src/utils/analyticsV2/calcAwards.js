// 재미 어워드: 불꽃(해트트릭+) / 수호신(세션 내 전 GK경기 무실점) / 자책 랭킹
// owngoal은 로그_이벤트(event_type='owngoal')가 있으면 그쪽을 진실 소스로 사용.
// 없으면 폴백으로 playerLogs.owngoals 컬럼 합산.
export function calcAwards({ playerLogs, eventLogs, topN = {} }) {
  const limits = {
    fireStarter: topN.fireStarter ?? 5,
    guardian: topN.guardian ?? 5,
    owngoal: topN.owngoal ?? 3,
  };

  const fire = {}, guard = {}, gkSessions = {}, own = {};
  for (const p of playerLogs || []) {
    const name = p.player;
    if ((Number(p.goals) || 0) >= 3) fire[name] = (fire[name] || 0) + 1;
    // 수호신: 세션 내 키퍼로 2경기 이상 출전한 경우만 카운트 (분모/분자 공통)
    if ((Number(p.keeper_games) || 0) >= 2) {
      gkSessions[name] = (gkSessions[name] || 0) + 1;
      if ((Number(p.conceded) || 0) === 0) {
        guard[name] = (guard[name] || 0) + 1;
      }
    }
  }

  if (eventLogs && eventLogs.length > 0) {
    for (const e of eventLogs) {
      if (e.event_type !== 'owngoal') continue;
      const name = e.player;
      if (!name) continue;
      own[name] = (own[name] || 0) + 1;
    }
  } else {
    for (const p of playerLogs || []) {
      const og = Number(p.owngoals) || 0;
      if (og > 0) own[p.player] = (own[p.player] || 0) + og;
    }
  }

  const toList = (map, key, limit) =>
    Object.entries(map)
      .map(([player, value]) => ({ player, [key]: value }))
      .sort((a, b) => b[key] - a[key] || a.player.localeCompare(b.player, 'ko'))
      .slice(0, limit);

  // 수호신은 횟수에 무실점률(rate) + 키퍼 세션 수도 같이 노출
  const guardianList = Object.entries(guard)
    .map(([player, count]) => ({
      player,
      count,
      sessions: gkSessions[player] || count,
      rate: (gkSessions[player] || count) > 0 ? count / (gkSessions[player] || count) : 0,
    }))
    .sort((a, b) => (b.count - a.count) || (b.rate - a.rate) || a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.guardian);

  return {
    fireStarter: toList(fire, 'count', limits.fireStarter),
    guardian: guardianList,
    owngoalKings: toList(own, 'total', limits.owngoal),
  };
}

// 재미 어워드: 불꽃(해트트릭+) / 키퍼(클린시트·실점률) / 자책 랭킹
// owngoal은 로그_이벤트(event_type='owngoal')가 있으면 그쪽을 진실 소스로 사용.
// 없으면 폴백으로 playerLogs.owngoals 컬럼 합산.
// 키퍼 지표는 PG(로그_선수경기)의 누적 컬럼을 권위 소스로 사용:
//   keeper_games(키퍼로 뛴 경기 수), conceded(실점 합), cleansheets(무실점 세션 0/1).
//   클린시트 수 = Σcleansheets, 실점률 = Σconceded / Σkeeper_games (경기당, 낮을수록 좋음).
export function calcAwards({ playerLogs, eventLogs, topN = {}, minKeeperGames = 4 }) {
  const limits = {
    fireStarter: topN.fireStarter ?? 5,
    cleanSheet: topN.cleanSheet ?? 5,
    stingiest: topN.stingiest ?? 5,
    owngoal: topN.owngoal ?? 3,
  };

  const fire = {}, keeper = {}, own = {};
  for (const p of playerLogs || []) {
    const name = p.player;
    if ((Number(p.goals) || 0) >= 3) fire[name] = (fire[name] || 0) + 1;
    // 키퍼 누적: 키퍼로 한 경기라도 뛴 세션만 합산
    const kg = Number(p.keeper_games) || 0;
    if (kg > 0) {
      const a = keeper[name] || (keeper[name] = { keeperGames: 0, conceded: 0, cleanSheets: 0 });
      a.keeperGames += kg;
      a.conceded += Number(p.conceded) || 0;
      a.cleanSheets += Number(p.cleansheets) || 0;
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

  // 키퍼 행: player + 누적 + 실점률(경기당)
  const keeperRows = Object.entries(keeper).map(([player, a]) => ({
    player,
    keeperGames: a.keeperGames,
    conceded: a.conceded,
    cleanSheets: a.cleanSheets,
    concededRate: a.keeperGames > 0 ? a.conceded / a.keeperGames : null,
  }));

  // 클린시트 수: 누적 무실점 세션 많은 순 (동률은 실점률 낮은 순 → 이름)
  const cleanSheetKings = keeperRows
    .filter(r => r.cleanSheets > 0)
    .sort((a, b) =>
      b.cleanSheets - a.cleanSheets ||
      a.concededRate - b.concededRate ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.cleanSheet);

  // 실점률: 경기당 실점 적은 순 (소표본 컷, 동률은 표본 많은 순 → 이름)
  const stingiest = keeperRows
    .filter(r => r.keeperGames >= minKeeperGames)
    .sort((a, b) =>
      a.concededRate - b.concededRate ||
      b.keeperGames - a.keeperGames ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.stingiest);

  return {
    fireStarter: toList(fire, 'count', limits.fireStarter),
    keepers: { cleanSheetKings, stingiest },
    owngoalKings: toList(own, 'total', limits.owngoal),
  };
}

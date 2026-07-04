// 일일 MVP: 그날 최종포인트 1위. (B안, 2026-07-04 사용자 결정)
// 최종포인트 = rank_score + crova + goguma + goals + assists + cleansheets − owngoals
//   - goguma는 시트에 음수로 저장되어 합산이 곧 차감
//   - owngoals는 PG에 양수 카운트로 저장 → 명시적으로 차감
//   - 개인포인트까지 합산하므로 별도 타이브레이크 불필요 — 완전 동점만 공동 MVP
//   (팀 배점만 합산하던 이전 정의는 매주 1위 팀 전원이 공동 1등이 되는 문제가 있었음)
// 레거시 방어: 그날 전원 rank_score/crova/goguma가 0이면(포인트 제도 미기록 세션)
// 골 기록이 있어도 그 날짜는 스킵 — 제도 밖 세션에 소급 MVP를 주지 않는다.
export function calcDailyMvp({ playerGameLogs, topN = 5, recentN = 5 }) {
  const byDate = {};
  for (const p of playerGameLogs || []) {
    if (!p.player || !p.date) continue;
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push({
      player: p.player,
      points:
        (Number(p.rank_score) || 0) + (Number(p.crova) || 0) + (Number(p.goguma) || 0) +
        (Number(p.goals) || 0) + (Number(p.assists) || 0) + (Number(p.cleansheets) || 0) -
        (Number(p.owngoals) || 0),
      hasPointData:
        (Number(p.rank_score) || 0) !== 0 || (Number(p.crova) || 0) !== 0 || (Number(p.goguma) || 0) !== 0,
    });
  }

  const counts = {};
  const recent = [];
  let eligibleDates = 0;
  const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
  for (const date of dates) {
    const rows = byDate[date];
    if (!rows.some(r => r.hasPointData)) continue; // 포인트 제도 미기록 세션
    eligibleDates++;
    const maxPoints = Math.max(...rows.map(r => r.points));
    const mvps = rows.filter(r => r.points === maxPoints).map(r => r.player)
      .sort((a, b) => a.localeCompare(b, 'ko'));
    for (const name of mvps) counts[name] = (counts[name] || 0) + 1;
    recent.push({ date, mvps, points: maxPoints });
  }
  recent.reverse(); // 최신순

  const ranking = Object.entries(counts)
    .map(([player, value]) => ({ player, value }))
    .sort((a, b) => b.value - a.value || a.player.localeCompare(b.player, 'ko'))
    .slice(0, topN);

  return { ranking, recent: recent.slice(0, recentN), eligibleDates };
}

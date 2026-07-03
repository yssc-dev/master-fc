// 일일 MVP: 그날 최종포인트 1위.
// 최종포인트 = rank_score + crova + goguma — DualTeamTab의 individual 총점과 동일 통화.
//   (goguma는 시트에 음수로 저장되어 합산이 곧 차감. 크로바/고구마 미사용 팀은 0이라 rank_score만 남음)
// 동점 시 personalPt(goals+assists+owngoals+cleansheets)로 타이브레이크, 그래도 같으면 공동 MVP.
// 레거시 방어: 그날 전원 최종포인트 구성요소가 0이면(백필 등 포인트 미기록) 그 날짜는 스킵.
export function calcDailyMvp({ playerGameLogs, topN = 5, recentN = 5 }) {
  const byDate = {};
  for (const p of playerGameLogs || []) {
    if (!p.player || !p.date) continue;
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push({
      player: p.player,
      points: (Number(p.rank_score) || 0) + (Number(p.crova) || 0) + (Number(p.goguma) || 0),
      personalPt: (Number(p.goals) || 0) + (Number(p.assists) || 0) + (Number(p.owngoals) || 0) + (Number(p.cleansheets) || 0),
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
    if (!rows.some(r => r.hasPointData)) continue; // 포인트 미기록 세션
    eligibleDates++;
    const maxPoints = Math.max(...rows.map(r => r.points));
    const top = rows.filter(r => r.points === maxPoints);
    const maxPersonal = Math.max(...top.map(r => r.personalPt));
    const mvps = top.filter(r => r.personalPt === maxPersonal).map(r => r.player)
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

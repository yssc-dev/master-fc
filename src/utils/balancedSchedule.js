import { generateRoundRobin } from './brackets';

/**
 * 균등 자동 스케줄 라운드 묶음 생성.
 * 4·5팀에 한정. 6팀+ / 3팀은 호출 시점에서 막혀야 함(UI 책임).
 *
 * @param {Object} args
 * @param {number} args.teamCount - 팀 수 (4 또는 5)
 * @param {number} args.courtCount - 1 또는 2
 * @param {number} args.cycles - 반복 횟수 (1, 2, 3 ...)
 * @returns {Array<{matches: Array<[number, number]>}>} schedule에 append할 라운드 배열
 */
export function generateBalancedSegment({ teamCount, courtCount, cycles }) {
  const pool = generateRoundRobin(Array.from({ length: teamCount }, (_, i) => i));
  // pool[r] = 라운드 r의 동시 매치 배열 (circle method)

  const oneCycle = courtCount >= 2
    ? pool.map(round => ({ matches: round }))
    : pool.flatMap(round => round.map(m => ({ matches: [m] })));

  return Array.from({ length: cycles }).flatMap(() => oneCycle);
}

/**
 * 미리보기용 — 누적 매치 수를 팀별로 카운트.
 */
export function countCurrentMatchesPerTeam(completedMatches, teamCount) {
  const counts = Array(teamCount).fill(0);
  for (const m of completedMatches) {
    if (typeof m.homeIdx === 'number') counts[m.homeIdx]++;
    if (typeof m.awayIdx === 'number') counts[m.awayIdx]++;
  }
  return counts;
}

/**
 * 매치당 시간 자동 추정.
 * 최근 5매치 중 이벤트 ≥ 2개인 매치들에서 이벤트 시각 범위(분) 평균을 ceil.
 * 데이터 부족 시 10분 고정.
 */
export function estimateMatchMinutes(completedMatches, allEvents) {
  const recent = completedMatches.slice(-5);
  const durations = [];
  for (const m of recent) {
    if (!m.matchId) continue;
    const evts = allEvents.filter(e => e.matchId === m.matchId && typeof e.timestamp === 'number');
    if (evts.length < 2) continue;
    const ts = evts.map(e => e.timestamp);
    durations.push(Math.max(...ts) - Math.min(...ts));
  }
  if (durations.length < 2) return 10;
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  return Math.max(1, Math.ceil(avgMs / 60000));
}

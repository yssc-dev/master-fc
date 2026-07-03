import { describe, it, expect } from 'vitest';
import { calcDailyMvp } from '../calcDailyMvp';

const pg = (player, date, over = {}) => ({
  player, date, goals: 0, assists: 0, owngoals: 0, cleansheets: 0,
  crova: 0, goguma: 0, rank_score: 0, ...over,
});

describe('calcDailyMvp', () => {
  it('그날 최종포인트(rank_score+crova+goguma) 1위가 MVP, 횟수 랭킹 집계', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, crova: 1 }),          // 4점 ← MVP
      pg('B', '2026-06-04', { rank_score: 3 }),                    // 3점
      pg('A', '2026-06-11', { rank_score: 2 }),                    // 2점 ← MVP
      pg('B', '2026-06-11', { rank_score: 1 }),                    // 1점
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'A', value: 2 });
    expect(r.ranking.find(x => x.player === 'B')).toBeUndefined();
  });

  it('고구마(음수)가 반영되어 순위가 뒤집힌다', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, goguma: -2 }),        // 1점
      pg('B', '2026-06-04', { rank_score: 2 }),                    // 2점 ← MVP
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'B', value: 1 });
  });

  it('최종포인트 동점이면 personalPt(골+어시+자책+클린시트)로 타이브레이크', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, goals: 2 }),          // 3점, pPt 2 ← MVP
      pg('B', '2026-06-04', { rank_score: 3, goals: 1 }),          // 3점, pPt 1
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking).toHaveLength(1);
    expect(r.ranking[0]).toMatchObject({ player: 'A', value: 1 });
  });

  it('타이브레이크까지 동점이면 공동 MVP (둘 다 +1)', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, goals: 1 }),
      pg('B', '2026-06-04', { rank_score: 3, goals: 1 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking.find(x => x.player === 'A').value).toBe(1);
    expect(r.ranking.find(x => x.player === 'B').value).toBe(1);
  });

  it('포인트 데이터가 전무한 날짜(레거시 백필 등 전원 0)는 스킵', () => {
    const logs = [
      pg('A', '2026-01-01', { goals: 5 }),   // rank_score/crova/goguma 전원 0 → 스킵
      pg('B', '2026-01-01'),
      pg('A', '2026-06-04', { rank_score: 1 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'A', value: 1 });
    expect(r.eligibleDates).toBe(1);
  });

  it('recent: 최근 세션의 MVP와 포인트를 최신순으로 반환', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3 }),
      pg('B', '2026-06-11', { rank_score: 4, crova: 1 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs, recentN: 2 });
    expect(r.recent[0]).toMatchObject({ date: '2026-06-11', mvps: ['B'], points: 5 });
    expect(r.recent[1]).toMatchObject({ date: '2026-06-04', mvps: ['A'], points: 3 });
  });
});

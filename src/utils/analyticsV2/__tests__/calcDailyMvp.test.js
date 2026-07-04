import { describe, it, expect } from 'vitest';
import { calcDailyMvp } from '../calcDailyMvp';

const pg = (player, date, over = {}) => ({
  player, date, goals: 0, assists: 0, owngoals: 0, cleansheets: 0,
  crova: 0, goguma: 0, rank_score: 0, ...over,
});

describe('calcDailyMvp (B안: 최종포인트 = 랭크+크로바+고구마+골+어시+클린시트−자책)', () => {
  it('개인포인트까지 합산해 1위 판정 — 같은 팀 배점이라도 골 수로 갈림', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, goals: 2 }),          // 3+2 = 5 ← MVP
      pg('B', '2026-06-04', { rank_score: 3, goals: 1 }),          // 3+1 = 4
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking).toHaveLength(1);
    expect(r.ranking[0]).toMatchObject({ player: 'A', value: 1 });
    expect(r.recent[0].points).toBe(5);
  });

  it('자책골은 차감 (PG owngoals는 양수 카운트)', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, owngoals: 2 }),       // 3-2 = 1
      pg('B', '2026-06-04', { rank_score: 2 }),                    // 2 ← MVP
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'B', value: 1 });
  });

  it('고구마(음수)와 크로바, 어시·클린시트 모두 반영', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, crova: 1, goguma: -2, assists: 1 }), // 3점
      pg('B', '2026-06-04', { rank_score: 2, cleansheets: 1, goals: 1 }),         // 4점 ← MVP
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'B', value: 1 });
    expect(r.recent[0].points).toBe(4);
  });

  it('완전 동점이면 공동 MVP (둘 다 +1)', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, goals: 1 }),
      pg('B', '2026-06-04', { rank_score: 2, goals: 2 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking.find(x => x.player === 'A').value).toBe(1);
    expect(r.ranking.find(x => x.player === 'B').value).toBe(1);
    expect(r.recent[0].mvps).toEqual(['A', 'B']);
  });

  it('포인트 제도 미기록 날짜(랭크/크로바/고구마 전원 0)는 골 기록이 있어도 스킵', () => {
    const logs = [
      pg('A', '2026-01-01', { goals: 5 }),   // 제도 미기록 세션 → 스킵
      pg('B', '2026-01-01', { goals: 1 }),
      pg('A', '2026-06-04', { rank_score: 1 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'A', value: 1 });
    expect(r.eligibleDates).toBe(1);
  });

  it('recent: 최신순, 새 공식 포인트 표기', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 3, goals: 1 }),
      pg('B', '2026-06-11', { rank_score: 4, crova: 1, assists: 2 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs, recentN: 2 });
    expect(r.recent[0]).toMatchObject({ date: '2026-06-11', mvps: ['B'], points: 7 });
    expect(r.recent[1]).toMatchObject({ date: '2026-06-04', mvps: ['A'], points: 4 });
  });
});

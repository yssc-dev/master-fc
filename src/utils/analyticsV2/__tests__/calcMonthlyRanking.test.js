import { describe, it, expect } from 'vitest';
import { calcMonthlyRanking } from '../calcMonthlyRanking';

describe('calcMonthlyRanking', () => {
  const playerLogs = [
    { player: 'A', date: '2026-01-05', goals: 3, assists: 1 },
    { player: 'A', date: '2026-01-12', goals: 2, assists: 0 },
    { player: 'B', date: '2026-01-05', goals: 1, assists: 3 },
    { player: 'A', date: '2026-02-01', goals: 10, assists: 0 },
  ];
  const matchLogs = [
    { date: '2026-01-05', our_members_json: '["A","B"]', our_score: 3, opponent_score: 1 },
    { date: '2026-01-12', our_members_json: '["A"]', our_score: 1, opponent_score: 2 },
    { date: '2026-02-01', our_members_json: '["A"]', our_score: 5, opponent_score: 0 },
  ];

  it('aggregates within month only', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.goals[0]).toEqual({ player: 'A', value: 5 });
    expect(r.goals.find(x => x.player === 'A').value).toBe(5);
  });

  it('ranks assists descending', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.assists[0]).toEqual({ player: 'B', value: 3 });
  });

  it('winRate uses only that month matches and includes games', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    const a = r.winRate.find(x => x.player === 'A');
    expect(a.games).toBe(2);
    expect(a.value).toBeCloseTo(0.5, 5);
  });

  it('respects topN', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs, topN: 1 });
    expect(r.goals).toHaveLength(1);
    expect(r.assists).toHaveLength(1);
  });

  it('returns empty arrays for month with no data', () => {
    const r = calcMonthlyRanking({ yearMonth: '2025-12', playerLogs, matchLogs });
    expect(r).toEqual({ goals: [], assists: [], winRate: [] });
  });
});

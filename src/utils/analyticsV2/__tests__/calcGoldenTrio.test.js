import { describe, it, expect } from 'vitest';
import { calcGoldenTrio } from '../calcGoldenTrio';

describe('calcGoldenTrio', () => {
  it('returns trios sorted by winRate desc', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 2, opponent_score: 0 },
      { our_members_json: '["A","B","C"]', our_score: 3, opponent_score: 1 },
      { our_members_json: '["A","B","C"]', our_score: 0, opponent_score: 1 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 0, opponent_score: 2 },
      { our_members_json: '["A","B","D"]', our_score: 0, opponent_score: 2 },
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    expect(r[0].members).toEqual(['A', 'B', 'C']);
    expect(r[0].winRate).toBeCloseTo(2 / 3, 5);
    expect(r[1].members).toEqual(['A', 'B', 'D']);
  });

  it('filters trios below minRounds', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    expect(r).toHaveLength(1);
    expect(r[0].members).toEqual(['A', 'B', 'D']);
  });

  it('teams with <3 members produce no trios', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 1, topN: 5 });
    expect(r).toEqual([]);
  });

  it('respects topN', () => {
    const mk = (members) => ({ our_members_json: JSON.stringify(members), our_score: 1, opponent_score: 0 });
    const matchLogs = [
      ...Array(3).fill(mk(['A','B','C'])),
      ...Array(3).fill(mk(['A','B','D'])),
      ...Array(3).fill(mk(['A','B','E'])),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 2 });
    expect(r).toHaveLength(2);
  });
});

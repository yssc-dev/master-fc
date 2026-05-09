import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';

describe('calcSynergyMatrix', () => {
  it('returns unique sorted player list', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.players).toEqual(['A', 'B', 'C']);
  });

  it('counts wins/draws/losses per pair', () => {
    const matchLogs = [
      { match_id: 'R1_C1', our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { match_id: 'R2_C1', our_members_json: '["A","B"]', our_score: 1, opponent_score: 1 },
      { match_id: 'R3_C1', our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const ab = r.cells['A|B'];
    expect(ab.games).toBe(3);
    expect(ab.wins).toBe(1);
    expect(ab.draws).toBe(1);
    expect(ab.losses).toBe(1);
    expect(ab.winRate).toBeCloseTo((1 + 0.5) / 3, 6);
  });

  it('diagonal = individual overall winRate, liftSymmetric=0', () => {
    const matchLogs = [
      { match_id: 'R1_C1', our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { match_id: 'R2_C1', our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const aa = r.cells['A|A'];
    expect(aa.games).toBe(2);
    expect(aa.wins).toBe(1);
    expect(aa.winRate).toBe(0.5);
    expect(aa.liftSymmetric).toBe(0);
  });

  it('liftSymmetric = pair winRate - (X solo + Y solo)/2', () => {
    const matchLogs = [
      // A,B 같이 4승 0패 → pair 1.0
      ...Array.from({ length: 4 }, (_, i) => ({ match_id: `R${i}_C1`, our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 })),
      // A 혼자 (B 없이) 0승 2패 → A solo 추가 결과
      { match_id: 'X1_C1', our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
      { match_id: 'X2_C1', our_members_json: '["A","D"]', our_score: 0, opponent_score: 1 },
      // B 혼자 0승 2패
      { match_id: 'Y1_C1', our_members_json: '["B","E"]', our_score: 0, opponent_score: 1 },
      { match_id: 'Y2_C1', our_members_json: '["B","F"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    // A solo: 4승 2패 = 4/6, B solo: 4승 2패 = 4/6, AB pair: 4승 0패 = 1.0
    // lift = 1.0 - (4/6 + 4/6)/2 = 1.0 - 4/6 = 1/3
    expect(r.cells['A|B'].liftSymmetric).toBeCloseTo(1 / 3, 5);
  });

  it('cells with games < minRounds still present but flagged via games<min', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    expect(r.cells['A|B'].games).toBe(1);
  });

  it('skips malformed our_members_json', () => {
    const matchLogs = [
      { our_members_json: 'not-json', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.players).toEqual(['A']);
  });
});

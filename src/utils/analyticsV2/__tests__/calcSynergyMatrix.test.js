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
      { our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 1 },
      { our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|B']).toEqual({ games: 3, wins: 1, draws: 1, losses: 1, winRate: (1 + 0.5) / 3 });
  });

  it('diagonal = individual overall winRate', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|A']).toEqual({ games: 2, wins: 1, draws: 0, losses: 1, winRate: 0.5 });
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

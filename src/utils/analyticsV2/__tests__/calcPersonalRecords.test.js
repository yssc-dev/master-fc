import { describe, it, expect } from 'vitest';
import { calcPersonalRecords } from '../calcPersonalRecords';

describe('calcPersonalRecords', () => {
  it('returns max goals/assists with date', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 1, keeper_games: 0, conceded: 0, rank_score: 3 },
      { player: 'A', date: '2026-01-02', goals: 5, assists: 0, keeper_games: 0, conceded: 0, rank_score: 5 },
      { player: 'A', date: '2026-01-03', goals: 1, assists: 3, keeper_games: 0, conceded: 0, rank_score: 4 },
    ];
    const r = calcPersonalRecords({ playerName: 'A', playerLogs: logs });
    expect(r.mostGoals).toEqual({ value: 5, date: '2026-01-02' });
    expect(r.mostAssists).toEqual({ value: 3, date: '2026-01-03' });
    expect(r.bestRankScore).toEqual({ value: 5, date: '2026-01-02' });
  });

  it('computes longest clean sheet streak with dates', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 1, conceded: 2, rank_score: 0 },
      { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 1, conceded: 0, rank_score: 1 },
    ];
    const r = calcPersonalRecords({ playerName: 'G', playerLogs: logs });
    expect(r.longestCleanSheet).toEqual({ value: 2, startDate: '2026-01-01', endDate: '2026-01-02' });
  });

  it('returns null records for player with no logs', () => {
    const r = calcPersonalRecords({ playerName: 'X', playerLogs: [] });
    expect(r).toEqual({
      mostGoals: null, mostAssists: null,
      longestCleanSheet: null, bestRankScore: null,
    });
  });
});

import { describe, it, expect } from 'vitest';
import { calcStreaks } from '../calcStreaks';

describe('calcStreaks', () => {
  it('counts current & best scoring streak', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 2, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-02', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-03', goals: 0, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-04', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-05', goals: 2, keeper_games: 0, conceded: 0 },
    ];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs });
    expect(r.scoringStreak).toEqual({ current: 2, best: 2 });
  });

  it('best > current when last session is non-scoring', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-02', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-03', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-04', goals: 0, keeper_games: 0, conceded: 0 },
    ];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs });
    expect(r.scoringStreak).toEqual({ current: 0, best: 3 });
  });

  it('clean sheet streak only counts sessions where keeper_games>0', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, keeper_games: 2, conceded: 0 },
      { player: 'G', date: '2026-01-02', goals: 0, keeper_games: 0, conceded: 0 },
      { player: 'G', date: '2026-01-03', goals: 0, keeper_games: 1, conceded: 0 },
      { player: 'G', date: '2026-01-04', goals: 0, keeper_games: 1, conceded: 1 },
    ];
    const r = calcStreaks({ playerName: 'G', playerLogs: logs });
    expect(r.cleanSheetStreak).toEqual({ current: 0, best: 2 });
  });

  it('returns zeros for unknown player', () => {
    const r = calcStreaks({ playerName: 'X', playerLogs: [] });
    expect(r).toEqual({
      scoringStreak: { current: 0, best: 0 },
      cleanSheetStreak: { current: 0, best: 0 },
    });
  });
});

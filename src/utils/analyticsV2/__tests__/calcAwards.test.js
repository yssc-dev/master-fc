import { describe, it, expect } from 'vitest';
import { calcAwards } from '../calcAwards';

describe('calcAwards', () => {
  const logs = [
    { player: 'A', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-02', goals: 4, assists: 0, keeper_games: 0, conceded: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-03', goals: 2, assists: 0, keeper_games: 0, conceded: 0, owngoals: 1 },
    { player: 'B', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 3, conceded: 1, owngoals: 0 },
    { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 2, conceded: 0, owngoals: 0 },
    { player: 'C', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 0, conceded: 0, owngoals: 3 },
  ];

  it('fireStarter counts goals>=3 sessions', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.fireStarter).toEqual([
      { player: 'A', count: 2 },
      { player: 'B', count: 1 },
    ]);
  });

  it('guardian counts keeper_games>=2 && conceded=0 sessions', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.guardian).toEqual([{ player: 'G', count: 2 }]);
  });

  it('owngoalKings returns only players with >0 owngoals, sorted desc', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.owngoalKings).toEqual([
      { player: 'C', total: 3 },
      { player: 'A', total: 1 },
    ]);
  });

  it('respects custom topN', () => {
    const r = calcAwards({ playerLogs: logs, topN: { fireStarter: 1, guardian: 1, owngoal: 1 } });
    expect(r.fireStarter).toHaveLength(1);
    expect(r.guardian).toHaveLength(1);
    expect(r.owngoalKings).toHaveLength(1);
  });
});

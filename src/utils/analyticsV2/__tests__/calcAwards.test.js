import { describe, it, expect } from 'vitest';
import { calcAwards } from '../calcAwards';

describe('calcAwards', () => {
  const logs = [
    // 필드 플레이어 (불꽃/자책용)
    { player: 'A', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-02', goals: 4, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-03', goals: 2, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 1 },
    { player: 'B', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0 },
    { player: 'C', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 3 },
    // 키퍼 G: keeper_games 2+1+3+2=8, conceded 0+0+1+0=1, cleansheets 1+1+0+1=3 → 실점률 0.125
    { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0 },
    { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, cleansheets: 1, owngoals: 0 },
    { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 3, conceded: 1, cleansheets: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0 },
    // 키퍼 H: keeper_games 4, conceded 0, cleansheets 1 → 실점률 0 (최저), 클린시트는 1
    { player: 'H', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 4, conceded: 0, cleansheets: 1, owngoals: 0 },
    // 키퍼 L: keeper_games 2 (min 미달), conceded 0, cleansheets 1 → 클린시트엔 포함, 실점률엔 제외
    { player: 'L', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0 },
  ];

  it('fireStarter counts goals>=3 sessions', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.fireStarter).toEqual([
      { player: 'A', count: 2 },
      { player: 'B', count: 1 },
    ]);
  });

  it('keepers.cleanSheetKings: PG 누적 cleansheets 합 내림차순', () => {
    const r = calcAwards({ playerLogs: logs });
    // G 3, H 1, L 1 → 동률은 실점률 낮은 순(H,L 둘다 0) → 이름순 H,L
    expect(r.keepers.cleanSheetKings.map(x => x.player)).toEqual(['G', 'H', 'L']);
    const g = r.keepers.cleanSheetKings.find(x => x.player === 'G');
    expect(g.cleanSheets).toBe(3);
    expect(g.keeperGames).toBe(8);
    expect(g.concededRate).toBeCloseTo(0.125, 5);
  });

  it('keepers.stingiest: 경기당 실점 오름차순, 최소 키퍼경기 미달 제외', () => {
    const r = calcAwards({ playerLogs: logs, minKeeperGames: 4 });
    // 자격: G(8경기, 0.125), H(4경기, 0). L(2경기)은 제외
    expect(r.keepers.stingiest.map(x => x.player)).toEqual(['H', 'G']);
    expect(r.keepers.stingiest.find(x => x.player === 'H').concededRate).toBe(0);
    expect(r.keepers.stingiest.find(x => x.player === 'L')).toBeUndefined();
  });

  it('owngoalKings returns only players with >0 owngoals, sorted desc', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.owngoalKings).toEqual([
      { player: 'C', total: 3 },
      { player: 'A', total: 1 },
    ]);
  });

  it('respects custom topN', () => {
    const r = calcAwards({ playerLogs: logs, topN: { fireStarter: 1, cleanSheet: 1, stingiest: 1, owngoal: 1 } });
    expect(r.fireStarter).toHaveLength(1);
    expect(r.keepers.cleanSheetKings).toHaveLength(1);
    expect(r.keepers.stingiest).toHaveLength(1);
    expect(r.owngoalKings).toHaveLength(1);
  });
});

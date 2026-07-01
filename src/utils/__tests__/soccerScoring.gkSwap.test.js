import { describe, it, expect } from 'vitest';
import { getMatchGks, getCleanSheetPlayers, calcSoccerPlayerStats } from '../soccerScoring';

// A가 GK로 시작 → 위치교대(gkChange)로 B가 GK. 최종 match.gk = B.
const zeroConceded = {
  matchIdx: 0, status: 'finished', opponent: '한울',
  lineup: ['A', 'B', 'C'], gk: 'B', defenders: [],
  events: [
    { id: 'g', type: 'goal', player: 'C', timestamp: 50 },
    { id: 'sw', type: 'gkChange', playerOut: 'A', playerIn: 'B', timestamp: 100 },
  ],
};

// A가 GK일 때 1실점 → 교대로 B가 GK, 이후 무실점. 경기 총실점=1.
const oneConceded = {
  matchIdx: 1, status: 'finished', opponent: '아이콘',
  lineup: ['A', 'B', 'C'], gk: 'B', defenders: [],
  events: [
    { id: 'og', type: 'opponentGoal', currentGk: 'A', timestamp: 50 },
    { id: 'sw', type: 'gkChange', playerOut: 'A', playerIn: 'B', timestamp: 100 },
  ],
};

describe('getMatchGks — 뛴 모든 GK', () => {
  it('gkChange의 나간/들어온 선수와 최종 gk를 모두 포함', () => {
    expect([...getMatchGks(zeroConceded)].sort()).toEqual(['A', 'B']);
  });
  it('sub(pos GK)도 두 선수 모두 포함', () => {
    const m = { gk: 'Z', events: [{ type: 'sub', position: 'GK', playerOut: 'Y', playerIn: 'Z' }] };
    expect([...getMatchGks(m)].sort()).toEqual(['Y', 'Z']);
  });
  it('GK 변경이 없으면 최종 gk만', () => {
    expect([...getMatchGks({ gk: 'B', events: [] })]).toEqual(['B']);
  });
});

describe('getCleanSheetPlayers — 매치단위(총실점 0일 때만) + 뛴 GK 모두', () => {
  it('0실점 경기: 교대로 뛴 두 GK(A,B) 모두 클린시트', () => {
    const cs = getCleanSheetPlayers(zeroConceded);
    expect(cs).toContain('A');
    expect(cs).toContain('B');
  });
  it('총실점 1이면(교대 후 무실점이라도) 아무도 클린시트 아님', () => {
    expect(getCleanSheetPlayers(oneConceded)).toEqual([]);
  });
});

describe('calcSoccerPlayerStats — GK 교대 집계', () => {
  it('0실점: A·B 둘 다 keeperGames=1, cleanSheets=1', () => {
    const s = calcSoccerPlayerStats([zeroConceded]);
    expect(s.A.keeperGames).toBe(1);
    expect(s.B.keeperGames).toBe(1);
    expect(s.A.cleanSheets).toBe(1);
    expect(s.B.cleanSheets).toBe(1);
    expect(s.C.fieldGames).toBe(1);
    expect(s.C.cleanSheets).toBe(0);
  });
  it('1실점: A가 실점 귀속(교체 전), 둘 다 keeperGames=1, 클린시트 0', () => {
    const s = calcSoccerPlayerStats([oneConceded]);
    expect(s.A.conceded).toBe(1);
    expect(s.B.conceded).toBe(0);
    expect(s.A.keeperGames).toBe(1);
    expect(s.B.keeperGames).toBe(1);
    expect(s.A.cleanSheets).toBe(0);
    expect(s.B.cleanSheets).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
const withState = (o) => ({ ...initialState, ...o });

describe('gameReducer — DELETE_SOCCER_EVENT sub 되돌리기', () => {
  // p1(DF slot1)이 p2로 교체됨. 슬롯1엔 현재 p2, subs엔 p1.
  const base = () => withState({ soccerMatches: [{
    matchIdx: 0, status: 'finished', opponent: 'X',
    lineup: ['GK', 'p1', 'M'], defenders: ['p1'], gk: 'GK',
    assignments: { 0: 'GK', 1: 'p2', 2: 'M' }, positionMap: { GK: 'GK', p2: 'DF', M: 'MF' },
    subs: ['p1'],
    events: [{ id: 's', type: 'sub', playerOut: 'p1', playerIn: 'p2', position: 'DF', posIdx: 1, timestamp: 1 }],
  }] });

  it('슬롯 미변경 시: 배치/subs/gk 되돌리고 이벤트 삭제', () => {
    const next = gameReducer(base(), { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    const m = next.soccerMatches[0];
    expect(m.events).toHaveLength(0);
    expect(m.assignments[1]).toBe('p1');       // playerOut 복귀
    expect(m.positionMap['p1']).toBe('DF');
    expect(m.positionMap['p2']).toBeUndefined();
    expect(m.subs).toContain('p2');            // playerIn 벤치로
    expect(m.subs).not.toContain('p1');
  });

  it('슬롯이 이후 변경된(chained) 경우: 배치 미변경, 이벤트만 삭제', () => {
    const s = base();
    s.soccerMatches[0].assignments = { 0: 'GK', 1: 'p3', 2: 'M' }; // slot1이 p2가 아님(이후 또 바뀜)
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    const m = next.soccerMatches[0];
    expect(m.events).toHaveLength(0);
    expect(m.assignments[1]).toBe('p3'); // 그대로(오염 방지)
    expect(m.subs).toEqual(['p1']);
  });

  it('posIdx 없는 레거시 sub: 배치 미변경', () => {
    const s = base();
    delete s.soccerMatches[0].events[0].posIdx;
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    expect(next.soccerMatches[0].assignments[1]).toBe('p2');
  });

  it('비-sub 이벤트 삭제는 기존대로(배치 무관)', () => {
    const s = withState({ soccerMatches: [{
      matchIdx: 0, status: 'finished', opponent: 'X', assignments: { 0: 'A' }, positionMap: {}, subs: [],
      events: [{ id: 'g', type: 'goal', player: 'A', timestamp: 1 }],
    }] });
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'g' });
    expect(next.soccerMatches[0].events).toHaveLength(0);
    expect(next.soccerMatches[0].assignments).toEqual({ 0: 'A' });
  });

  it('GK 교체 되돌리기: gk가 playerOut으로 복원', () => {
    const s = withState({ soccerMatches: [{
      matchIdx: 0, status: 'finished', opponent: 'X',
      lineup: ['oldGK', 'D'], defenders: ['D'], gk: 'newGK',
      assignments: { 0: 'newGK', 1: 'D' }, positionMap: { newGK: 'GK', D: 'DF' },
      subs: ['oldGK'],
      events: [{ id: 's', type: 'sub', playerOut: 'oldGK', playerIn: 'newGK', position: 'GK', posIdx: 0, timestamp: 1 }],
    }] });
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    const m = next.soccerMatches[0];
    expect(m.gk).toBe('oldGK');
    expect(m.assignments[0]).toBe('oldGK');
    expect(m.positionMap['oldGK']).toBe('GK');
  });
});

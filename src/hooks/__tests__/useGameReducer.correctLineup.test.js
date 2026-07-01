import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const withState = (o) => ({ ...initialState, ...o });

describe('gameReducer — CORRECT_SOCCER_LINEUP', () => {
  // b(장치광)를 DF 선발로 오기입, 실제로는 a(장주성)가 뜀. b는 골도 하나 찍힘.
  const base = () => withState({ soccerMatches: [
    { matchIdx: 0, opponent: '한울', status: 'finished',
      lineup: ['GK1', '장치광', 'M1'], defenders: ['장치광'], gk: 'GK1',
      assignments: { 0: 'GK1', 1: '장치광', 2: 'M1' },
      positionMap: { GK1: 'GK', 장치광: 'DF', M1: 'MF' },
      subs: ['장주성', 'BN1'],
      events: [{ id: 'g', type: 'goal', player: '장치광', assist: null, timestamp: 1 }],
    },
    { matchIdx: 1, opponent: '아이콘', status: 'finished', lineup: ['P1'], defenders: [], gk: '', assignments: {}, positionMap: {}, subs: [], events: [] },
  ] });

  it('b→a 치환: lineup/defenders/assignments/positionMap/gk/이벤트, b는 subs로', () => {
    const next = gameReducer(base(), { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: '장치광', in: '장주성' });
    const m = next.soccerMatches[0];
    expect(m.lineup).toEqual(['GK1', '장주성', 'M1']);
    expect(m.defenders).toEqual(['장주성']);
    expect(m.assignments).toEqual({ 0: 'GK1', 1: '장주성', 2: 'M1' });
    expect(m.positionMap['장주성']).toBe('DF');
    expect(m.positionMap['장치광']).toBeUndefined();
    expect(m.subs).toContain('장치광');       // b는 미출전(벤치)
    expect(m.subs).not.toContain('장주성');    // a는 출전
    expect(m.events[0].player).toBe('장주성'); // 골 이관
  });

  it('타 경기 무변경(경기 독립성)', () => {
    const s = base();
    const next = gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: '장치광', in: '장주성' });
    expect(next.soccerMatches[1]).toEqual(s.soccerMatches[1]);
  });

  it('GK 정정: gk와 currentGk 이관', () => {
    const s = withState({ soccerMatches: [{
      matchIdx: 0, opponent: 'X', status: 'finished',
      lineup: ['badGK', 'D1'], defenders: ['D1'], gk: 'badGK',
      assignments: { 0: 'badGK', 1: 'D1' }, positionMap: { badGK: 'GK', D1: 'DF' },
      subs: ['realGK'],
      events: [{ id: 'og', type: 'opponentGoal', currentGk: 'badGK', timestamp: 1 }],
    }] });
    const next = gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: 'badGK', in: 'realGK' });
    const m = next.soccerMatches[0];
    expect(m.gk).toBe('realGK');
    expect(m.positionMap['realGK']).toBe('GK');
    expect(m.events[0].currentGk).toBe('realGK');
  });

  it('orphan 케이스(positionMap[b] 없음): a의 기존 role 보존', () => {
    // b가 assignments엔 없고 lineup에만, a는 이미 assignments에 role 보유(교체+삭제 흔적)
    const s = withState({ soccerMatches: [{
      matchIdx: 0, opponent: 'X', status: 'finished',
      lineup: ['GK1', 'b'], defenders: [], gk: 'GK1',
      assignments: { 0: 'GK1', 1: 'a' }, positionMap: { GK1: 'GK', a: 'MF' }, // b는 positionMap에 없음
      subs: ['b'], events: [],
    }] });
    const next = gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: 'b', in: 'a' });
    const m = next.soccerMatches[0];
    expect(m.positionMap['a']).toBe('MF'); // undefined로 덮어쓰지 않음
    expect(m.lineup).toEqual(['GK1', 'a']);
  });

  it('out===in 또는 빈 값이면 무변경', () => {
    const s = base();
    expect(gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: 'X', in: 'X' })).toBe(s);
  });
});

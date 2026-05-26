import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — CREATE_SOCCER_MATCH subs 스냅샷', () => {
  it('subs를 match 객체에 저장한다', () => {
    const s = withState({ soccerMatches: [] });
    const next = gameReducer(s, {
      type: 'CREATE_SOCCER_MATCH',
      opponent: '한울',
      lineup: ['A', 'B', 'C'],
      gk: 'A',
      defenders: ['B'],
      subs: ['X', 'Y'],
    });
    const m = next.soccerMatches[0];
    expect(m.subs).toEqual(['X', 'Y']);
    expect(m.lineup).toEqual(['A', 'B', 'C']);
    expect(m.opponent).toBe('한울');
    expect(m.status).toBe('playing');
    expect(next.currentMatchIdx).toBe(0);
  });

  it('subs 미전달 시 빈 배열로 방어', () => {
    const s = withState({ soccerMatches: [] });
    const next = gameReducer(s, {
      type: 'CREATE_SOCCER_MATCH', opponent: '시청', lineup: [], gk: '', defenders: [],
    });
    expect(next.soccerMatches[0].subs).toEqual([]);
  });
});

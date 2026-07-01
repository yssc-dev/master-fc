import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
const withState = (o) => ({ ...initialState, ...o });

const base = () => withState({ soccerMatches: [
  { matchIdx: 0, opponent: 'X', status: 'playing', formation: '4-4-2',
    lineup: ['A','B'], defenders: ['A'], gk: '', assignments: {0:'A',1:'B'},
    positionMap: {A:'DF',B:'MF'}, subs: [], events: [] },
] });

describe('gameReducer — UPDATE_SOCCER_MATCH_FORMATION defenders 화이트리스트', () => {
  it('patch에 defenders 있으면 반영', () => {
    const next = gameReducer(base(), { type: 'UPDATE_SOCCER_MATCH_FORMATION', matchIdx: 0, patch: { defenders: ['B'] } });
    expect(next.soccerMatches[0].defenders).toEqual(['B']);
  });
  it('patch에 defenders 없으면 기존 유지(기존 호출부 무영향)', () => {
    const next = gameReducer(base(), { type: 'UPDATE_SOCCER_MATCH_FORMATION', matchIdx: 0, patch: { gk: 'A' } });
    expect(next.soccerMatches[0].defenders).toEqual(['A']);
  });
});

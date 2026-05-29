import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('EDIT_PAST_ABSENT_TOGGLE', () => {
  it('home 측에 휴식 추가', () => {
    const state = withState({
      completedMatches: [{
        matchId: 'F1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: 'A', awayTeam: 'B', homeAbsent: [], awayAbsent: [],
      }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_ABSENT_TOGGLE',
      matchId: 'F1_C0', teamIdx: 0, player: '김장수',
    });
    expect(next.completedMatches[0].homeAbsent).toEqual(['김장수']);
    expect(next.completedMatches[0].awayAbsent).toEqual([]);
  });

  it('이미 휴식이면 해제', () => {
    const state = withState({
      completedMatches: [{
        matchId: 'F1_C0', homeIdx: 0, awayIdx: 1,
        homeAbsent: ['김장수'], awayAbsent: [],
      }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_ABSENT_TOGGLE',
      matchId: 'F1_C0', teamIdx: 0, player: '김장수',
    });
    expect(next.completedMatches[0].homeAbsent).toEqual([]);
  });

  it('away 측 토글', () => {
    const state = withState({
      completedMatches: [{
        matchId: 'F1_C0', homeIdx: 0, awayIdx: 1,
        homeAbsent: [], awayAbsent: [],
      }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_ABSENT_TOGGLE',
      matchId: 'F1_C0', teamIdx: 1, player: '박형조',
    });
    expect(next.completedMatches[0].awayAbsent).toEqual(['박형조']);
  });

  it('matchId 못 찾으면 state 그대로', () => {
    const state = withState({
      completedMatches: [{ matchId: 'F1_C0', homeIdx: 0, awayIdx: 1 }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_ABSENT_TOGGLE',
      matchId: 'NOPE', teamIdx: 0, player: 'X',
    });
    expect(next).toBe(state);
  });

  it('teamIdx mismatch면 state 그대로', () => {
    const state = withState({
      completedMatches: [{ matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeAbsent: [], awayAbsent: [] }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_ABSENT_TOGGLE',
      matchId: 'F1_C0', teamIdx: 5, player: 'X',
    });
    expect(next).toBe(state);
  });
});

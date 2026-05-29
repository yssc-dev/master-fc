import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('EDIT_PAST_MERC_ADD — stale entry 정리', () => {
  it('mercenaries에 같은 player의 stale teamIdx 있으면 정리하고 새 entry로 교체', () => {
    const state = withState({
      teams: [['A1'], ['B1'], [], [], [], []],
      completedMatches: [{
        matchId: 'F2_C0',
        homeIdx: 4, awayIdx: 0,
        homeTeam: '팀E', awayTeam: '팀A',
        mercenaries: [
          { player: '이영문', teamIdx: 7 }, // stale — teamIdx가 home/away 어느 쪽도 아님
        ],
      }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_MERC_ADD',
      matchId: 'F2_C0', teamIdx: 4, player: '이영문',
    });
    const target = next.completedMatches[0];
    expect(target.mercenaries).toHaveLength(1); // stale 제거 + 새 entry 추가 = 1
    expect(target.mercenaries[0]).toEqual({ player: '이영문', teamIdx: 4 });
  });

  it('같은 player를 다른 측에 다시 추가 — 기존 entry 교체', () => {
    const state = withState({
      teams: [[], []],
      completedMatches: [{
        matchId: 'F1_C0',
        homeIdx: 0, awayIdx: 1,
        homeTeam: '팀A', awayTeam: '팀B',
        mercenaries: [
          { player: '용병1', teamIdx: 0 }, // home 측에 있던 용병
        ],
      }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_MERC_ADD',
      matchId: 'F1_C0', teamIdx: 1, player: '용병1', // away 측으로 이동 요청
    });
    const target = next.completedMatches[0];
    expect(target.mercenaries).toHaveLength(1);
    expect(target.mercenaries[0]).toEqual({ player: '용병1', teamIdx: 1 });
  });

  it('teamIdx가 home/away 둘 다 아니면 state 그대로 반환', () => {
    const state = withState({
      completedMatches: [{ matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, mercenaries: [] }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_MERC_ADD',
      matchId: 'F1_C0', teamIdx: 5, player: '이영문',
    });
    expect(next.completedMatches[0].mercenaries).toEqual([]);
  });

  it('새 player 추가 — 기존 mercenaries 유지', () => {
    const state = withState({
      teams: [[], []],
      completedMatches: [{
        matchId: 'F1_C0',
        homeIdx: 0, awayIdx: 1,
        mercenaries: [{ player: '용병1', teamIdx: 0 }],
      }],
    });
    const next = gameReducer(state, {
      type: 'EDIT_PAST_MERC_ADD',
      matchId: 'F1_C0', teamIdx: 0, player: '용병2',
    });
    const target = next.completedMatches[0];
    expect(target.mercenaries).toHaveLength(2);
    expect(target.mercenaries).toEqual(expect.arrayContaining([
      { player: '용병1', teamIdx: 0 },
      { player: '용병2', teamIdx: 0 },
    ]));
  });
});

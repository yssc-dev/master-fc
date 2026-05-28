import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — APPEND_SCHEDULE_SEGMENT', () => {
  it('빈 schedule에 첫 segment 추가 — currentRoundIdx=0', () => {
    const state = withState({ schedule: [], currentRoundIdx: 0, courtCount: 1 });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }],
      newCourtCount: 2,
    });
    expect(next.schedule.length).toBe(2);
    expect(next.courtCount).toBe(2);
    expect(next.currentRoundIdx).toBe(0);
    expect(next.viewingRoundIdx).toBe(0);
  });

  it('기존 segment 전부 확정 → segment 추가 시 currentRoundIdx가 새 첫 라운드 가리킴', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }],
      currentRoundIdx: 2, // 마지막 + 1 (범위 밖, 다 확정)
      confirmedRounds: { 0: true, 1: true },
      courtCount: 1,
    });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[0, 2]] }],
      newCourtCount: 2,
    });
    expect(next.schedule.length).toBe(3);
    expect(next.currentRoundIdx).toBe(2); // 새 첫 라운드 인덱스
    expect(next.viewingRoundIdx).toBe(2);
  });

  it('기존 segment 일부만 확정 → currentRoundIdx 보존', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }, { matches: [[0, 2]] }],
      currentRoundIdx: 1, // R2 진행 중
      confirmedRounds: { 0: true },
      courtCount: 2,
    });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[1, 3]] }],
      newCourtCount: 1,
    });
    expect(next.schedule.length).toBe(4);
    expect(next.currentRoundIdx).toBe(1); // 보존
    expect(next.courtCount).toBe(1);
  });

  it('confirmedRounds, completedMatches는 변경되지 않음', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }],
      currentRoundIdx: 1,
    });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[2, 3]] }],
      newCourtCount: 2,
    });
    expect(next.confirmedRounds).toEqual({ 0: true });
    expect(next.completedMatches).toEqual([{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }]);
  });
});

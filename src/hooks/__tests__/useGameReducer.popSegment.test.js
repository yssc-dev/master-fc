import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — POP_SCHEDULE_SEGMENT', () => {
  it('마지막 N라운드를 schedule에서 제거', () => {
    const state = withState({
      schedule: Array.from({ length: 10 }, (_, i) => ({ matches: [[0, 1], [2, 3]] })),
    });
    const next = gameReducer(state, { type: 'POP_SCHEDULE_SEGMENT', count: 5 });
    expect(next.schedule.length).toBe(5);
  });

  it('제거된 라운드의 confirmedRounds / completedMatches / allEvents / gksHistory 정리', () => {
    const state = withState({
      schedule: [
        { matches: [[0, 1]] },
        { matches: [[2, 3]] },
        { matches: [[0, 2]] },
      ],
      confirmedRounds: { 0: true, 1: true, 2: true },
      completedMatches: [
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 },
        { matchId: 'R2_C0', homeIdx: 2, awayIdx: 3 },
        { matchId: 'R3_C0', homeIdx: 0, awayIdx: 2 },
      ],
      allEvents: [
        { matchId: 'R1_C0', type: 'goal' },
        { matchId: 'R2_C0', type: 'goal' },
        { matchId: 'R3_C0', type: 'goal' },
      ],
      gksHistory: { 0: { 0: 'A' }, 1: { 1: 'B' }, 2: { 2: 'C' } },
    });
    const next = gameReducer(state, { type: 'POP_SCHEDULE_SEGMENT', count: 2 });
    expect(next.schedule.length).toBe(1);
    expect(next.confirmedRounds).toEqual({ 0: true });
    expect(next.completedMatches).toEqual([
      { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 },
    ]);
    expect(next.allEvents).toEqual([{ matchId: 'R1_C0', type: 'goal' }]);
    expect(next.gksHistory).toEqual({ 0: { 0: 'A' } });
  });

  it('F-id 매치/이벤트는 보존', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      completedMatches: [
        { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1 },
        { matchId: 'R1_C0', homeIdx: 2, awayIdx: 3 },
      ],
      allEvents: [
        { matchId: 'F1_C0', type: 'goal' },
        { matchId: 'R1_C0', type: 'goal' },
      ],
    });
    const next = gameReducer(state, { type: 'POP_SCHEDULE_SEGMENT', count: 1 });
    expect(next.schedule.length).toBe(0);
    expect(next.completedMatches).toEqual([{ matchId: 'F1_C0', homeIdx: 0, awayIdx: 1 }]);
    expect(next.allEvents).toEqual([{ matchId: 'F1_C0', type: 'goal' }]);
  });

  it('currentRoundIdx / viewingRoundIdx 범위 보정', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }, { matches: [[0, 2]] }],
      currentRoundIdx: 2,
      viewingRoundIdx: 2,
    });
    const next = gameReducer(state, { type: 'POP_SCHEDULE_SEGMENT', count: 2 });
    expect(next.schedule.length).toBe(1);
    expect(next.currentRoundIdx).toBe(1); // newLen = 1, min(2, 1) = 1
    expect(next.viewingRoundIdx).toBe(0); // min(2, max(0, 0)) = 0
  });

  it('count가 schedule.length보다 크면 schedule.length로 clamp', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }],
    });
    const next = gameReducer(state, { type: 'POP_SCHEDULE_SEGMENT', count: 100 });
    expect(next.schedule).toEqual([]);
  });

  it('count <= 0이면 변화 없음', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
    });
    const next = gameReducer(state, { type: 'POP_SCHEDULE_SEGMENT', count: 0 });
    expect(next.schedule.length).toBe(1);
  });
});

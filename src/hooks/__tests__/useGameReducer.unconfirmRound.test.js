import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — UNCONFIRM_ROUND gks 복원', () => {
  it('뒤 라운드가 확정된 중간 라운드 취소 시 라이브 gks를 덮어쓰지 않음', () => {
    // 라운드 1,2 확정 후 라운드 3 진행 중(라이브 GK 지정됨) — 라운드 1을 취소해도
    // 라이브 gks가 라운드 1 당시 GK로 롤백되면 안 됨 (이후 확정 시 로그_선수경기 GK 오염)
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }, { matches: [[0, 2]] }],
      confirmedRounds: { 0: true, 1: true },
      gksHistory: { 0: { 0: 'A' }, 1: { 1: 'B' } },
      gks: { 0: 'LIVE' },
      completedMatches: [
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 },
        { matchId: 'R2_C0', homeIdx: 2, awayIdx: 3 },
      ],
      currentRoundIdx: 2,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.gks).toEqual({ 0: 'LIVE' });
    expect(next.currentRoundIdx).toBe(2);
    expect(next.confirmedRounds).toEqual({ 1: true });
  });

  it('가장 최신 확정 라운드 취소 시 그 라운드의 gks 복원 (기존 동작 유지)', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      gksHistory: { 0: { 0: 'A' } },
      gks: {},
      completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }],
      currentRoundIdx: 1,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.gks).toEqual({ 0: 'A' });
    expect(next.currentRoundIdx).toBe(0);
  });

  it('8팀 스플릿: 전반 라운드 취소 시 후반 스케줄 제거 + splitPhase=first 복귀', () => {
    const fullSchedule = Array.from({ length: 12 }, () => ({ matches: [[0, 1], [4, 5]] }));
    const state = withState({
      teamCount: 8, courtCount: 2, matchMode: 'schedule',
      splitPhase: 'second',
      schedule: fullSchedule,
      confirmedRounds: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true },
      gksHistory: {}, completedMatches: [], currentRoundIdx: 6,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 5 });
    expect(next.splitPhase).toBe('first');
    expect(next.schedule).toHaveLength(6);
  });

  it('8팀 스플릿: 후반 라운드 취소는 splitPhase/스케줄 유지 (후반 중복 재생성 방지)', () => {
    const fullSchedule = Array.from({ length: 12 }, () => ({ matches: [[0, 1], [4, 5]] }));
    const state = withState({
      teamCount: 8, courtCount: 2, matchMode: 'schedule',
      splitPhase: 'second',
      schedule: fullSchedule,
      confirmedRounds: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
      gksHistory: {}, completedMatches: [], currentRoundIdx: 7,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 6 });
    expect(next.splitPhase).toBe('second');
    expect(next.schedule).toHaveLength(12);
  });

  it('matchId 없는 completedMatches 항목이 있어도 크래시하지 않음', () => {
    // RTDB partial write 등으로 matchId가 빠진 항목이 동기화될 수 있음
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      gksHistory: { 0: {} },
      completedMatches: [
        { homeIdx: 0, awayIdx: 1 },
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 },
      ],
    });
    expect(() => gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 })).not.toThrow();
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.completedMatches).toEqual([{ homeIdx: 0, awayIdx: 1 }]);
  });
});

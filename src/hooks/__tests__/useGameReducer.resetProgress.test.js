import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — RESET_MATCH_PROGRESS', () => {
  it('진행 기록을 모두 지우고 팀 구성/설정은 보존', () => {
    const state = withState({
      teams: [['김씨', '이씨'], ['박씨', '최씨']],
      teamNames: ['팀 A', '팀 B'],
      teamColorIndices: [0, 1],
      attendees: ['김씨', '이씨', '박씨', '최씨'],
      matchMode: 'free',
      courtCount: 2,
      teamCount: 2,
      schedule: [{ matches: [[0, 1]] }],
      currentRoundIdx: 0,
      viewingRoundIdx: 0,
      completedMatches: [{ matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeScore: 1, awayScore: 0 }],
      allEvents: [{ matchId: 'F1_C0', type: 'goal' }],
      confirmedRounds: { 0: true },
      liveMercs: { 'F2_C0': [] },
      absentees: { 'F1_C0': { 0: ['김씨'] } },
      gks: { 0: '이씨' },
      gksHistory: { 0: { 0: '이씨' } },
      isExtraRound: true,
      earlyFinish: true,
      splitPhase: 'second',
    });
    const next = gameReducer(state, { type: 'RESET_MATCH_PROGRESS' });
    // 진행 기록 비워짐
    expect(next.schedule).toEqual([]);
    expect(next.completedMatches).toEqual([]);
    expect(next.allEvents).toEqual([]);
    expect(next.confirmedRounds).toEqual({});
    expect(next.liveMercs).toEqual({});
    expect(next.absentees).toEqual({});
    expect(next.gks).toEqual({});
    expect(next.gksHistory).toEqual({});
    expect(next.currentRoundIdx).toBe(0);
    expect(next.viewingRoundIdx).toBe(0);
    expect(next.isExtraRound).toBe(false);
    expect(next.earlyFinish).toBe(false);
    expect(next.splitPhase).toBe(null);
    // 팀 구성/설정 보존
    expect(next.teams).toEqual([['김씨', '이씨'], ['박씨', '최씨']]);
    expect(next.teamNames).toEqual(['팀 A', '팀 B']);
    expect(next.teamColorIndices).toEqual([0, 1]);
    expect(next.attendees).toEqual(['김씨', '이씨', '박씨', '최씨']);
    expect(next.matchMode).toBe('free');
    expect(next.courtCount).toBe(2);
    expect(next.teamCount).toBe(2);
  });

  it('push 모드면 pushState를 초기 상태로 재생성', () => {
    const state = withState({
      matchMode: 'push',
      teamCount: 4,
      pushState: { current: { home: 1, away: 2 }, queue: [3, 0], counters: { winStreak: 2 } },
      completedMatches: [{ matchId: 'P1_C0' }],
    });
    const next = gameReducer(state, { type: 'RESET_MATCH_PROGRESS' });
    expect(next.pushState).not.toEqual(state.pushState);
    expect(next.pushState).toBeTruthy();
    expect(next.completedMatches).toEqual([]);
  });

  it('free 모드면 pushState는 null', () => {
    const state = withState({ matchMode: 'free', pushState: null });
    const next = gameReducer(state, { type: 'RESET_MATCH_PROGRESS' });
    expect(next.pushState).toBe(null);
  });
});

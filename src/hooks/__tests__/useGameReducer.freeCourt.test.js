import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

// 자유대진 수동 편성(freeCourtMatches)이 reducer state로 관리되어 RTDB 실시간 공유되는지 검증.
// (예전엔 FreeMatchView 로컬 useState라 다른 접속자에게 공유 안 됐던 버그를 reducer로 끌어올림)
function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — freeCourtMatches (자유대진 편성 실시간 공유)', () => {
  it('SET_FREE_COURT_MATCH: 코트별 {home, away} 저장', () => {
    const s = withState({ matchMode: 'free', freeCourtMatches: {} });
    const next = gameReducer(s, { type: 'SET_FREE_COURT_MATCH', courtIdx: 0, home: 2, away: 1 });
    expect(next.freeCourtMatches).toEqual({ 0: { home: 2, away: 1 } });
  });

  it('두 코트 누적 + 같은 코트 덮어쓰기', () => {
    let s = withState({ matchMode: 'free', freeCourtMatches: {} });
    s = gameReducer(s, { type: 'SET_FREE_COURT_MATCH', courtIdx: 0, home: 0, away: 1 });
    s = gameReducer(s, { type: 'SET_FREE_COURT_MATCH', courtIdx: 1, home: 2, away: 3 });
    expect(s.freeCourtMatches).toEqual({ 0: { home: 0, away: 1 }, 1: { home: 2, away: 3 } });
    s = gameReducer(s, { type: 'SET_FREE_COURT_MATCH', courtIdx: 0, home: 3, away: 2 });
    expect(s.freeCourtMatches[0]).toEqual({ home: 3, away: 2 });
  });

  it('FINISH_MATCH 확정 시 freeCourtMatches 클리어', () => {
    const s = withState({
      matchMode: 'free',
      teams: [['a'], ['b']],
      completedMatches: [],
      freeCourtMatches: { 0: { home: 0, away: 1 } },
    });
    const next = gameReducer(s, {
      type: 'FINISH_MATCH',
      match: { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2', homeGk: 'a', awayGk: 'b', homeScore: 0, awayScore: 0 },
    });
    expect(next.freeCourtMatches).toEqual({});
    expect(next.completedMatches).toHaveLength(1);
  });

  it('START_MATCHES: splitPhase/freeCourtMatches 초기화 (이전 게임 잔재 방지)', () => {
    // 이전이 6팀 스플릿('second')이고 자유편성 잔재가 있던 상태에서 새 4팀 경기 시작
    const s = withState({ matchMode: 'schedule', splitPhase: 'second', freeCourtMatches: { 0: { home: 0, away: 1 } } });
    const next = gameReducer(s, { type: 'START_MATCHES', schedule: [], pushState: null, splitPhase: null });
    expect(next.splitPhase).toBe(null);
    expect(next.freeCourtMatches).toEqual({});
    expect(next.phase).toBe('match');
  });

  it('START_MATCHES: 6팀 스플릿이면 splitPhase=first 전달', () => {
    const next = gameReducer(withState({}), { type: 'START_MATCHES', schedule: [], pushState: null, splitPhase: 'first' });
    expect(next.splitPhase).toBe('first');
  });

  it('CONFIRM_FREE_ROUND 확정 시 freeCourtMatches 클리어', () => {
    const s = withState({
      matchMode: 'free',
      teams: [['a'], ['b'], ['c'], ['d']],
      completedMatches: [],
      freeCourtMatches: { 0: { home: 0, away: 1 }, 1: { home: 2, away: 3 } },
    });
    const next = gameReducer(s, {
      type: 'CONFIRM_FREE_ROUND',
      results: [
        { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2', homeGk: 'a', awayGk: 'b', homeScore: 0, awayScore: 0 },
        { matchId: 'F2_C1', homeIdx: 2, awayIdx: 3, homeTeam: '팀3', awayTeam: '팀4', homeGk: 'c', awayGk: 'd', homeScore: 0, awayScore: 0 },
      ],
    });
    expect(next.freeCourtMatches).toEqual({});
    expect(next.completedMatches).toHaveLength(2);
  });
});

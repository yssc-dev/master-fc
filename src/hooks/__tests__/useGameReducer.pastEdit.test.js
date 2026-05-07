import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — past match edit', () => {
  describe('이벤트 변경 시 confirmed 매치 점수 재계산', () => {
    it('ADD_EVENT가 과거 매치 점수에 반영됨 (매치업은 불변)', () => {
      const state = withState({
        teamNames: ['Team A', 'Team B'],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'Team A', awayTeam: 'Team B',
          homeScore: 2, awayScore: 1,
        }],
        allEvents: [
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team A' },
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team A' },
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team B' },
        ],
      });
      const next = gameReducer(state, {
        type: 'ADD_EVENT',
        event: { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team B', courtId: '' },
      });
      const m = next.completedMatches[0];
      expect(m.homeScore).toBe(2);
      expect(m.awayScore).toBe(2);
      expect(m.homeIdx).toBe(0);
      expect(m.awayIdx).toBe(1);
    });

    it('DELETE_EVENT가 과거 매치 점수에 반영됨', () => {
      const state = withState({
        teamNames: ['A', 'B'],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B', homeScore: 2, awayScore: 0,
        }],
        allEvents: [
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'A' },
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'A' },
        ],
      });
      const next = gameReducer(state, { type: 'DELETE_EVENT', index: 1 });
      expect(next.completedMatches[0].homeScore).toBe(1);
    });

    it('EDIT_EVENT(scoringTeam 변경)도 점수에 반영', () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
        }],
        allEvents: [
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'A', courtId: '', timestamp: 1 },
        ],
      });
      const next = gameReducer(state, {
        type: 'EDIT_EVENT', index: 0,
        event: { matchId: 'R1_C0', type: 'goal', scoringTeam: 'B' },
      });
      expect(next.completedMatches[0].homeScore).toBe(0);
      expect(next.completedMatches[0].awayScore).toBe(1);
    });

    it('라이브 매치(미확정 matchId)에 이벤트 추가는 completedMatches 미변경', () => {
      const completed = [{
        matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
      }];
      const state = withState({
        completedMatches: completed,
        allEvents: [{ matchId: 'R1_C0', type: 'goal', scoringTeam: 'A' }],
      });
      const next = gameReducer(state, {
        type: 'ADD_EVENT',
        event: { matchId: 'R2_C0', type: 'goal', scoringTeam: 'A', courtId: '' },
      });
      expect(next.completedMatches).toBe(state.completedMatches);
    });

    it('push 모드: 점수 변경 시 pushState 재계산 (매치업 불변)', () => {
      const state = withState({
        matchMode: 'push',
        teamCount: 4,
        teamNames: ['T1', 'T2', 'T3', 'T4'],
        completedMatches: [{
          matchId: 'P1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'T1', awayTeam: 'T2', homeScore: 1, awayScore: 0,
        }],
        allEvents: [{ matchId: 'P1_C0', type: 'goal', scoringTeam: 'T1' }],
        pushState: { teamPlayCounts: {}, suggestedMatch: { home: 0, away: 1 } },
      });
      const next = gameReducer(state, {
        type: 'ADD_EVENT',
        event: { matchId: 'P1_C0', type: 'goal', scoringTeam: 'T2', courtId: '' },
      });
      // pushState 재계산이 일어남 (참조 변경)
      expect(next.pushState).not.toBe(state.pushState);
      // 매치업은 그대로
      expect(next.completedMatches[0].homeIdx).toBe(0);
      expect(next.completedMatches[0].awayIdx).toBe(1);
      // 점수도 반영
      expect(next.completedMatches[0].homeScore).toBe(1);
      expect(next.completedMatches[0].awayScore).toBe(1);
    });
  });

  describe('EDIT_PAST_GK', () => {
    it('schedule 모드: completedMatches와 gksHistory(roundIdx 키) 동시 갱신', () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R3_C1', homeIdx: 2, awayIdx: 4,
          homeTeam: 'A', awayTeam: 'B', homeGk: '구A', awayGk: '구B',
        }],
        gksHistory: { 2: { 2: '구A', 4: '구B' } },
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'R3_C1', side: 'home', player: '새A',
      });
      expect(next.completedMatches[0].homeGk).toBe('새A');
      expect(next.gksHistory[2][2]).toBe('새A');
      expect(next.gksHistory[2][4]).toBe('구B');
    });

    it('push 모드: gksHistory 키는 completedMatches 인덱스', () => {
      const state = withState({
        matchMode: 'push',
        completedMatches: [
          { matchId: 'P1_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'G1', awayGk: 'G2' },
          { matchId: 'P2_C0', homeIdx: 0, awayIdx: 2, homeTeam: 'A', awayTeam: 'C', homeGk: 'G1', awayGk: 'G3' },
        ],
        gksHistory: { 0: { 0: 'G1', 1: 'G2' }, 1: { 0: 'G1', 2: 'G3' } },
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'P2_C0', side: 'away', player: 'NEW',
      });
      expect(next.completedMatches[1].awayGk).toBe('NEW');
      expect(next.gksHistory[1][2]).toBe('NEW');
      expect(next.gksHistory[0]).toEqual({ 0: 'G1', 1: 'G2' });
    });

    it('존재하지 않는 matchId는 state 미변경', () => {
      const state = withState({ completedMatches: [] });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'R1_C0', side: 'home', player: 'X',
      });
      expect(next).toBe(state);
    });

    it('free 모드: gksHistory 키는 completedMatches 인덱스 (F* matchId)', () => {
      const state = withState({
        matchMode: 'free',
        completedMatches: [
          { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'GA', awayGk: 'GB' },
          { matchId: 'F2_C1', homeIdx: 2, awayIdx: 3, homeTeam: 'C', awayTeam: 'D', homeGk: 'GC', awayGk: 'GD' },
        ],
        gksHistory: {
          0: { 0: 'GA', 1: 'GB' },
          1: { 2: 'GC', 3: 'GD' },
        },
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'F2_C1', side: 'home', player: '새C',
      });
      expect(next.completedMatches[1].homeGk).toBe('새C');
      expect(next.gksHistory[1][2]).toBe('새C');
      expect(next.gksHistory[1][3]).toBe('GD');
      expect(next.gksHistory[0]).toEqual({ 0: 'GA', 1: 'GB' });
    });
  });

  describe('FINISH_MATCH / CONFIRM_FREE_ROUND — gksHistory 작성', () => {
    it('FINISH_MATCH (free 단건): gksHistory[completedIdx] 작성', () => {
      const state = withState({
        teams: [['A1'], ['B1']],
        completedMatches: [],
      });
      const match = {
        matchId: 'F1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: 'A', awayTeam: 'B', homeGk: 'GA', awayGk: 'GB',
        homeScore: 0, awayScore: 0,
      };
      const next = gameReducer(state, { type: 'FINISH_MATCH', match });
      expect(next.completedMatches.length).toBe(1);
      expect(next.gksHistory[0]).toEqual({ 0: 'GA', 1: 'GB' });
    });

    it('CONFIRM_FREE_ROUND (free 2코트): 매치별로 gksHistory 인덱스 분리 작성', () => {
      const state = withState({
        teams: [['A1'], ['B1'], ['C1'], ['D1']],
        completedMatches: [],
      });
      const results = [
        { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'GA', awayGk: 'GB', homeScore: 1, awayScore: 0 },
        { matchId: 'F2_C1', homeIdx: 2, awayIdx: 3, homeTeam: 'C', awayTeam: 'D', homeGk: 'GC', awayGk: 'GD', homeScore: 0, awayScore: 1 },
      ];
      const next = gameReducer(state, { type: 'CONFIRM_FREE_ROUND', results });
      expect(next.completedMatches.length).toBe(2);
      expect(next.gksHistory[0]).toEqual({ 0: 'GA', 1: 'GB' });
      expect(next.gksHistory[1]).toEqual({ 2: 'GC', 3: 'GD' });
    });

    it('CONFIRM_FREE_ROUND: 기존 completedMatches가 있어도 새 인덱스 baseIdx부터 작성', () => {
      const state = withState({
        teams: [['A1'], ['B1'], ['C1'], ['D1']],
        completedMatches: [
          { matchId: 'F0_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'X', awayGk: 'Y', homeScore: 0, awayScore: 0 },
        ],
        gksHistory: { 0: { 0: 'X', 1: 'Y' } },
      });
      const results = [
        { matchId: 'F1_C0', homeIdx: 0, awayIdx: 2, homeTeam: 'A', awayTeam: 'C', homeGk: 'GA', awayGk: 'GC', homeScore: 0, awayScore: 0 },
      ];
      const next = gameReducer(state, { type: 'CONFIRM_FREE_ROUND', results });
      expect(next.gksHistory[0]).toEqual({ 0: 'X', 1: 'Y' }); // 보존
      expect(next.gksHistory[1]).toEqual({ 0: 'GA', 2: 'GC' }); // 신규
    });
  });

  describe('EDIT_PAST_MERC_ADD / REMOVE', () => {
    it('용병 추가는 mercenaries와 homePlayers 갱신', () => {
      const state = withState({
        teams: [['A1', 'A2'], ['B1', 'B2']],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'TA', awayTeam: 'TB',
          homePlayers: ['A1', 'A2'], awayPlayers: ['B1', 'B2'],
          mercenaries: [],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', teamIdx: 0, player: '용병1',
      });
      const m = next.completedMatches[0];
      expect(m.mercenaries).toEqual([{ player: '용병1', teamIdx: 0 }]);
      expect(m.homePlayers).toContain('용병1');
      expect(m.awayPlayers).not.toContain('용병1');
    });

    it('용병 제거', () => {
      const state = withState({
        teams: [['A1'], ['B1']],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'TA', awayTeam: 'TB',
          homePlayers: ['A1'], awayPlayers: ['B1', '용병X'],
          mercenaries: [{ player: '용병X', teamIdx: 1 }],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_REMOVE', matchId: 'R1_C0', player: '용병X',
      });
      const m = next.completedMatches[0];
      expect(m.mercenaries).toEqual([]);
      expect(m.awayPlayers).toEqual(['B1']);
      expect(m.homePlayers).toEqual(['A1']);
    });

    it('잘못된 teamIdx (홈/원정 아님)는 state 미변경', () => {
      const state = withState({
        teams: [['A'], ['B'], ['C']],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'TA', awayTeam: 'TB',
          homePlayers: ['A'], awayPlayers: ['B'], mercenaries: [],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', teamIdx: 2, player: 'X',
      });
      expect(next).toBe(state);
    });

    it('이미 추가된 용병 중복 추가 무시', () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B',
          homePlayers: ['P1'], awayPlayers: ['P2'],
          mercenaries: [{ player: '용병', teamIdx: 0 }],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', teamIdx: 0, player: '용병',
      });
      expect(next).toBe(state);
    });
  });
});

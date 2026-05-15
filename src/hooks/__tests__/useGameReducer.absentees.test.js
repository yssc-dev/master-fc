import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — 매치별 휴식 (absentees)', () => {
  it('TOGGLE_ABSENT로 추가/제거 토글', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: '김성태' });
    expect(s.absentees['R1_C0'][0]).toEqual(['김성태']);
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: '김성태' });
    expect(s.absentees['R1_C0']).toBeUndefined();
  });

  it('같은 매치의 다른 팀에 독립적 휴식', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: 'A' });
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 1, player: 'X' });
    expect(s.absentees['R1_C0']).toEqual({ 0: ['A'], 1: ['X'] });
  });

  it('CONFIRM_ROUND 시 absentees가 completedMatches.homeAbsent/awayAbsent로 박제되고 라이브에서 제거', () => {
    const teams = [['A','B','C','D','E','F'], ['G','H','I','J','K'], [], []];
    const s = withState({
      teams,
      teamNames: ['팀1', '팀2', '팀3', '팀4'],
      currentRoundIdx: 0,
      schedule: [[{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2' }]],
      absentees: { 'R1_C0': { 0: ['F'], 1: [] } },
    });
    const matchResults = [{
      matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2',
      homeScore: 2, awayScore: 1, homeGk: 'A', awayGk: 'G',
    }];
    const next = gameReducer(s, { type: 'CONFIRM_ROUND', roundIdx: 0, matchResults });
    expect(next.completedMatches[0].homeAbsent).toEqual(['F']);
    expect(next.completedMatches[0].awayAbsent).toEqual([]);
    expect(next.absentees['R1_C0']).toBeUndefined();
  });

  it('UNCONFIRM_ROUND 시 박제됐던 absentees가 라이브로 복원', () => {
    const teams = [['A','B'], ['C','D'], [], []];
    const s = withState({
      teams,
      teamNames: ['팀1', '팀2', '팀3', '팀4'],
      confirmedRounds: { 0: true },
      currentRoundIdx: 1,
      schedule: [[], []],
      completedMatches: [{
        matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: '팀1', awayTeam: '팀2',
        homeScore: 1, awayScore: 0,
        homePlayers: ['A','B'], awayPlayers: ['C','D'],
        homeAbsent: ['B'], awayAbsent: ['D'],
      }],
    });
    const next = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.absentees['R1_C0']).toEqual({ 0: ['B'], 1: ['D'] });
  });
});

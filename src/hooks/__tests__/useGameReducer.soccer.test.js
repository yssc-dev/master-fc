import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — CREATE_SOCCER_MATCH subs 스냅샷', () => {
  it('subs를 match 객체에 저장한다', () => {
    const s = withState({ soccerMatches: [] });
    const next = gameReducer(s, {
      type: 'CREATE_SOCCER_MATCH',
      opponent: '한울',
      lineup: ['A', 'B', 'C'],
      gk: 'A',
      defenders: ['B'],
      subs: ['X', 'Y'],
    });
    const m = next.soccerMatches[0];
    expect(m.subs).toEqual(['X', 'Y']);
    expect(m.lineup).toEqual(['A', 'B', 'C']);
    expect(m.opponent).toBe('한울');
    expect(m.status).toBe('playing');
    expect(next.currentMatchIdx).toBe(0);
  });

  it('subs 미전달 시 빈 배열로 방어', () => {
    const s = withState({ soccerMatches: [] });
    const next = gameReducer(s, {
      type: 'CREATE_SOCCER_MATCH', opponent: '시청', lineup: [], gk: '', defenders: [],
    });
    expect(next.soccerMatches[0].subs).toEqual([]);
  });
});

describe('gameReducer — SET_SOCCER_MATCH_OPPONENT', () => {
  const threeMatches = [
    { matchIdx: 0, opponent: '한울', status: 'finished', events: [{ id: 'e0', type: 'goal', player: 'A', timestamp: 1 }], ourScore: 1, opponentScore: 0, lineup: ['A', 'B'] },
    { matchIdx: 1, opponent: '아이콘', status: 'finished', events: [{ id: 'e1', type: 'opponentGoal', currentGk: 'K', timestamp: 2 }], ourScore: 0, opponentScore: 1, lineup: ['C', 'D'] },
    { matchIdx: 2, opponent: '터틀파크', status: 'playing', events: [], ourScore: 0, opponentScore: 0, lineup: ['E', 'F'] },
  ];

  it('대상 경기의 opponent만 바꾸고 events/score/status/lineup은 보존한다', () => {
    const s = withState({ soccerMatches: threeMatches });
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: 1, opponent: '아이콘B' });
    const m = next.soccerMatches[1];
    expect(m.opponent).toBe('아이콘B');
    expect(m.events).toEqual(threeMatches[1].events);
    expect(m.ourScore).toBe(0);
    expect(m.opponentScore).toBe(1);
    expect(m.status).toBe('finished');
    expect(m.lineup).toEqual(['C', 'D']);
  });

  it('중간 경기 변경이 다른 경기(index 0·2)를 건드리지 않는다 (경기 독립성)', () => {
    const s = withState({ soccerMatches: threeMatches });
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: 1, opponent: 'X' });
    expect(next.soccerMatches[0]).toEqual(threeMatches[0]);
    expect(next.soccerMatches[2]).toEqual(threeMatches[2]);
  });

  it('논리 matchIdx로 매칭한다 (배열 순서가 아니라)', () => {
    // matchIdx가 배열 index와 다른 (이론상) 배열에서도 논리 matchIdx 기준으로 찾는다
    const shuffled = [
      { matchIdx: 5, opponent: 'P', status: 'finished', events: [] },
      { matchIdx: 3, opponent: 'Q', status: 'finished', events: [] },
    ];
    const s = withState({ soccerMatches: shuffled });
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: 3, opponent: 'Q2' });
    expect(next.soccerMatches.find(m => m.matchIdx === 3).opponent).toBe('Q2');
    expect(next.soccerMatches.find(m => m.matchIdx === 5).opponent).toBe('P');
  });
});

import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  eventsToObj,
  matchesToObj,
  soccerMatchesToObj,
  diffStateToWrites,
  reconstructState,
  expandStateForRtdb,
} from '../firebaseSyncDiff';

describe('deepEqual', () => {
  it('primitive 동등', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
  it('객체/배열 깊은 비교', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
  it('배열 vs 객체 구분', () => {
    expect(deepEqual([], {})).toBe(false);
  });
});

describe('eventsToObj/matchesToObj/soccerMatchesToObj', () => {
  it('events 는 id 키로 변환, id 없는 항목은 스킵', () => {
    const arr = [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }, { x: 3 }, null];
    expect(eventsToObj(arr)).toEqual({ e1: { id: 'e1', x: 1 }, e2: { id: 'e2', x: 2 } });
  });
  it('matches 는 matchId 키로', () => {
    const arr = [{ matchId: 'R1_C0' }, { matchId: 'R1_C1' }, {}];
    expect(matchesToObj(arr)).toEqual({
      R1_C0: { matchId: 'R1_C0' },
      R1_C1: { matchId: 'R1_C1' },
    });
  });
  it('soccerMatches 는 matchIdx 키로 (string화)', () => {
    const arr = [{ matchIdx: 0, x: 'a' }, { matchIdx: 1, x: 'b' }];
    expect(soccerMatchesToObj(arr)).toEqual({
      '0': { matchIdx: 0, x: 'a' },
      '1': { matchIdx: 1, x: 'b' },
    });
  });
  it('null/undefined 입력은 빈 객체', () => {
    expect(eventsToObj(null)).toEqual({});
    expect(eventsToObj(undefined)).toEqual({});
    expect(matchesToObj(null)).toEqual({});
    expect(soccerMatchesToObj(null)).toEqual({});
  });
});

describe('diffStateToWrites', () => {
  it('변경 없으면 빈 객체', () => {
    const s = { phase: 'ROUND', currentRoundIdx: 0 };
    expect(diffStateToWrites(s, s)).toEqual({});
  });

  it('meta 단일 필드 변경', () => {
    const prev = { phase: 'ROUND', currentRoundIdx: 0 };
    const next = { phase: 'ROUND', currentRoundIdx: 1 };
    expect(diffStateToWrites(prev, next)).toEqual({ 'meta/currentRoundIdx': 1 });
  });

  it('undefined 값은 null 로 변환 (RTDB 삭제)', () => {
    const prev = { phase: 'ROUND' };
    const next = {};
    expect(diffStateToWrites(prev, next)).toEqual({ 'meta/phase': null });
  });

  it('통째로 교체 필드 (teams)', () => {
    const prev = { teams: [['A'], ['B']] };
    const next = { teams: [['A'], ['B', 'C']] };
    expect(diffStateToWrites(prev, next)).toEqual({ teams: [['A'], ['B', 'C']] });
  });

  it('이벤트 추가는 events/{id} 단일 path', () => {
    const prev = { allEvents: [{ id: 'e1', x: 1 }] };
    const next = { allEvents: [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }] };
    expect(diffStateToWrites(prev, next)).toEqual({
      'events/e2': { id: 'e2', x: 2 },
    });
  });

  it('이벤트 삭제는 events/{id} = null', () => {
    const prev = { allEvents: [{ id: 'e1' }, { id: 'e2' }] };
    const next = { allEvents: [{ id: 'e1' }] };
    expect(diffStateToWrites(prev, next)).toEqual({ 'events/e2': null });
  });

  it('이벤트 수정은 events/{id} 통째 교체', () => {
    const prev = { allEvents: [{ id: 'e1', x: 1 }] };
    const next = { allEvents: [{ id: 'e1', x: 999 }] };
    expect(diffStateToWrites(prev, next)).toEqual({
      'events/e1': { id: 'e1', x: 999 },
    });
  });

  it('completedMatches 변경은 matches/{matchId} 단일 path', () => {
    const prev = { completedMatches: [{ matchId: 'R1_C0', score: [3, 2] }] };
    const next = { completedMatches: [{ matchId: 'R1_C0', score: [4, 2] }] };
    expect(diffStateToWrites(prev, next)).toEqual({
      'matches/R1_C0': { matchId: 'R1_C0', score: [4, 2] },
    });
  });

  it('gks 단일 키 변경 → gks/{teamIdx}', () => {
    const prev = { gks: { 0: '이동규', 1: '오희종' } };
    const next = { gks: { 0: '김형근', 1: '오희종' } };
    expect(diffStateToWrites(prev, next)).toEqual({ 'gks/0': '김형근' });
  });

  it('gksHistory round 단위 diff', () => {
    const prev = { gksHistory: { 0: { 0: 'A', 1: 'B' } } };
    const next = { gksHistory: { 0: { 0: 'A', 1: 'B' }, 1: { 0: 'C', 1: 'D' } } };
    expect(diffStateToWrites(prev, next)).toEqual({
      'gksHistory/1': { 0: 'C', 1: 'D' },
    });
  });

  it('confirmedRounds 토글', () => {
    const prev = { confirmedRounds: { 0: true } };
    const next = { confirmedRounds: { 0: true, 1: true } };
    expect(diffStateToWrites(prev, next)).toEqual({ 'confirmedRounds/1': true });
  });

  it('soccerMatches matchIdx 별 path', () => {
    const prev = { soccerMatches: [{ matchIdx: 0, score: [1, 0] }] };
    const next = {
      soccerMatches: [
        { matchIdx: 0, score: [1, 0] },
        { matchIdx: 1, score: [2, 1] },
      ],
    };
    expect(diffStateToWrites(prev, next)).toEqual({
      'soccerMatches/1': { matchIdx: 1, score: [2, 1] },
    });
  });

  it('여러 필드 동시 변경 — 각각 path 분리', () => {
    const prev = {
      phase: 'ROUND',
      currentRoundIdx: 0,
      gks: { 0: 'A' },
      allEvents: [{ id: 'e1', x: 1 }],
    };
    const next = {
      phase: 'ROUND',
      currentRoundIdx: 1,
      gks: { 0: 'B' },
      allEvents: [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }],
    };
    expect(diffStateToWrites(prev, next)).toEqual({
      'meta/currentRoundIdx': 1,
      'gks/0': 'B',
      'events/e2': { id: 'e2', x: 2 },
    });
  });

  it('prev null 이어도 안전 (초기 저장)', () => {
    const next = { phase: 'INIT', currentRoundIdx: 0, gks: { 0: 'A' } };
    const writes = diffStateToWrites(null, next);
    expect(writes['meta/phase']).toBe('INIT');
    expect(writes['meta/currentRoundIdx']).toBe(0);
    expect(writes['gks/0']).toBe('A');
  });
});

describe('reconstructState', () => {
  it('null raw → null', () => {
    expect(reconstructState('g_1', null)).toBeNull();
  });

  it('빈 raw → 기본값으로 채워진 state', () => {
    const s = reconstructState('g_1', {});
    expect(s.gameId).toBe('g_1');
    expect(s.phase).toBe('');
    expect(s.currentRoundIdx).toBe(0);
    expect(s.teamCount).toBe(4);
    expect(s.matchMode).toBe('schedule');
    expect(s.allEvents).toEqual([]);
    expect(s.completedMatches).toEqual([]);
    expect(s.soccerMatches).toEqual([]);
    expect(s.gks).toEqual({});
  });

  it('events 는 timestamp 오름차순 정렬', () => {
    const raw = {
      events: {
        e2: { id: 'e2', timestamp: 200 },
        e1: { id: 'e1', timestamp: 100 },
        e3: { id: 'e3', timestamp: 300 },
      },
    };
    const s = reconstructState('g_1', raw);
    expect(s.allEvents.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('soccerMatches 는 matchIdx 오름차순 정렬', () => {
    const raw = {
      soccerMatches: {
        '2': { matchIdx: 2 },
        '0': { matchIdx: 0 },
        '1': { matchIdx: 1 },
      },
    };
    const s = reconstructState('g_1', raw);
    expect(s.soccerMatches.map((m) => m.matchIdx)).toEqual([0, 1, 2]);
  });

  it('meta 값 매핑', () => {
    const raw = {
      meta: {
        phase: 'ROUND',
        currentRoundIdx: 3,
        gameCreator: '동근',
        teamCount: 6,
        gameFinalized: true,
      },
    };
    const s = reconstructState('g_1', raw);
    expect(s.phase).toBe('ROUND');
    expect(s.currentRoundIdx).toBe(3);
    expect(s.gameCreator).toBe('동근');
    expect(s.teamCount).toBe(6);
    expect(s.gameFinalized).toBe(true);
  });
});

describe('expandStateForRtdb / 라운드트립', () => {
  it('expand → reconstruct 라운드트립 (값 보존)', () => {
    const original = {
      phase: 'ROUND',
      currentRoundIdx: 2,
      teamCount: 4,
      gameCreator: '동근',
      teams: [['김형근'], ['이동규']],
      teamNames: ['A팀', 'B팀'],
      gks: { 0: '김형근', 1: '이동규' },
      gksHistory: { 0: { 0: '김형근', 1: '이동규' } },
      allEvents: [
        { id: 'e1', timestamp: 100, x: 'a' },
        { id: 'e2', timestamp: 200, x: 'b' },
      ],
      completedMatches: [{ matchId: 'R1_C0', score: [3, 2] }],
      soccerMatches: [{ matchIdx: 0, score: [1, 0] }],
      confirmedRounds: { 0: true },
    };
    const raw = expandStateForRtdb(original);
    const restored = reconstructState('g_1', raw);
    expect(restored.phase).toBe(original.phase);
    expect(restored.currentRoundIdx).toBe(original.currentRoundIdx);
    expect(restored.teamCount).toBe(original.teamCount);
    expect(restored.gameCreator).toBe(original.gameCreator);
    expect(restored.teams).toEqual(original.teams);
    expect(restored.teamNames).toEqual(original.teamNames);
    expect(restored.gks).toEqual(original.gks);
    expect(restored.gksHistory).toEqual(original.gksHistory);
    expect(restored.allEvents).toEqual(original.allEvents);
    expect(restored.completedMatches).toEqual(original.completedMatches);
    expect(restored.soccerMatches).toEqual(original.soccerMatches);
    expect(restored.confirmedRounds).toEqual(original.confirmedRounds);
  });

  it('빈 state 도 round-trip 안전', () => {
    const raw = expandStateForRtdb({});
    const restored = reconstructState('g_1', raw);
    expect(restored).not.toBeNull();
    expect(restored.allEvents).toEqual([]);
    expect(restored.completedMatches).toEqual([]);
  });

  it('events/matches 는 키 기반 객체로 펼쳐짐', () => {
    const raw = expandStateForRtdb({
      allEvents: [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }],
      completedMatches: [{ matchId: 'R1_C0' }],
    });
    expect(raw.events).toEqual({ e1: { id: 'e1', x: 1 }, e2: { id: 'e2', x: 2 } });
    expect(raw.matches).toEqual({ R1_C0: { matchId: 'R1_C0' } });
  });
});

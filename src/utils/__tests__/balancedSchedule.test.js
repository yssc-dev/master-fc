import { describe, it, expect } from 'vitest';
import { generateBalancedSegment, countCurrentMatchesPerTeam, estimateMatchMinutes } from '../balancedSchedule';

describe('generateBalancedSegment', () => {
  it('5팀 2코트 1사이클 — 5라운드 × 2매치, 각 팀 4경기, 각 팀 1번 휴식', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 2, cycles: 1 });
    expect(result.length).toBe(5); // 5라운드
    // 각 라운드 2매치
    result.forEach(round => expect(round.matches.length).toBe(2));
    // 총 10매치
    const totalMatches = result.reduce((sum, r) => sum + r.matches.length, 0);
    expect(totalMatches).toBe(10);
    // 각 팀 출전 수 = 4
    const counts = [0, 0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([4, 4, 4, 4, 4]);
    // 각 라운드 내 팀 충돌 없음
    result.forEach(round => {
      const teams = round.matches.flat();
      expect(new Set(teams).size).toBe(teams.length);
    });
  });
});

describe('generateBalancedSegment — 추가 케이스', () => {
  it('5팀 1코트 1사이클 — 10라운드 × 1매치, 각 팀 4경기', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 1, cycles: 1 });
    expect(result.length).toBe(10);
    result.forEach(round => expect(round.matches.length).toBe(1));
    const counts = [0, 0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([4, 4, 4, 4, 4]);
  });

  it('5팀 2코트 2사이클 — 10라운드, 각 팀 8경기', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 2, cycles: 2 });
    expect(result.length).toBe(10);
    const counts = [0, 0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([8, 8, 8, 8, 8]);
  });

  it('4팀 2코트 1사이클 — 3라운드 × 2매치, 각 팀 3경기, 휴식 없음', () => {
    const result = generateBalancedSegment({ teamCount: 4, courtCount: 2, cycles: 1 });
    expect(result.length).toBe(3);
    result.forEach(round => expect(round.matches.length).toBe(2));
    const counts = [0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([3, 3, 3, 3]);
  });

  it('4팀 1코트 2사이클 — 12라운드, 각 팀 6경기', () => {
    const result = generateBalancedSegment({ teamCount: 4, courtCount: 1, cycles: 2 });
    expect(result.length).toBe(12);
    const counts = [0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([6, 6, 6, 6]);
  });

  it('cycles=1에서 모든 매치업이 정확히 1번씩 등장 (5팀)', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 2, cycles: 1 });
    const pairs = new Map();
    result.forEach(r => r.matches.forEach(([h, a]) => {
      const key = [h, a].sort((x, y) => x - y).join('-');
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }));
    // C(5,2) = 10
    expect(pairs.size).toBe(10);
    pairs.forEach(count => expect(count).toBe(1));
  });
});

describe('countCurrentMatchesPerTeam', () => {
  it('completedMatches에서 팀별 매치 수 카운트', () => {
    const completed = [
      { homeIdx: 0, awayIdx: 1 },
      { homeIdx: 2, awayIdx: 3 },
      { homeIdx: 0, awayIdx: 2 },
    ];
    expect(countCurrentMatchesPerTeam(completed, 5)).toEqual([2, 1, 2, 1, 0]);
  });

  it('homeIdx/awayIdx 없는 매치는 무시', () => {
    const completed = [
      { homeIdx: 0, awayIdx: 1 },
      { foo: 'bar' },
    ];
    expect(countCurrentMatchesPerTeam(completed, 4)).toEqual([1, 1, 0, 0]);
  });
});

describe('estimateMatchMinutes', () => {
  it('데이터 충분하면 평균 시각 범위(분) 올림', () => {
    const completed = [
      { matchId: 'F1_C0' },
      { matchId: 'F2_C0' },
    ];
    const events = [
      { matchId: 'F1_C0', timestamp: 0 },
      { matchId: 'F1_C0', timestamp: 600000 }, // 10분
      { matchId: 'F2_C0', timestamp: 1000000 },
      { matchId: 'F2_C0', timestamp: 1480000 }, // 8분
    ];
    expect(estimateMatchMinutes(completed, events)).toBe(9); // (10+8)/2 = 9
  });

  it('이벤트 < 2개인 매치만 있으면 기본 10', () => {
    const completed = [{ matchId: 'F1_C0' }];
    const events = [{ matchId: 'F1_C0', timestamp: 0 }];
    expect(estimateMatchMinutes(completed, events)).toBe(10);
  });

  it('완료 매치가 없으면 10', () => {
    expect(estimateMatchMinutes([], [])).toBe(10);
  });

  it('최근 5매치만 고려', () => {
    const completed = Array.from({ length: 8 }, (_, i) => ({ matchId: `F${i + 1}_C0` }));
    // F1~F3은 길이 30분, F4~F8은 길이 5분 → 최근 5개(F4~F8) 평균 5분
    const events = completed.flatMap((m, i) => {
      const dur = i < 3 ? 1800000 : 300000;
      return [
        { matchId: m.matchId, timestamp: 0 },
        { matchId: m.matchId, timestamp: dur },
      ];
    });
    expect(estimateMatchMinutes(completed, events)).toBe(5);
  });
});

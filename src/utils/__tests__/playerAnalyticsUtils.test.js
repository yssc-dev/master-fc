import { describe, it, expect } from 'vitest';
import { calcTeamRanking, calcCrovaGogumaFreq, calcRoundMidpointTimePattern, sortSynergyWithTieBreak, classifyTimeSlot, calcTrend } from '../playerAnalyticsUtils';

describe('playerAnalyticsUtils', () => {
  it('module loads', () => {
    expect(true).toBe(true);
  });
});

describe('calcTeamRanking', () => {
  it('3팀 세션에서 승-득실차-득점 순 랭크', () => {
    const record = {
      gameDate: '2026-03-20',
      teamNames: ['A', 'B', 'C'],
      matches: [
        { homeIdx: 0, awayIdx: 1, homeScore: 3, awayScore: 1, isExtra: false },
        { homeIdx: 1, awayIdx: 2, homeScore: 2, awayScore: 2, isExtra: false },
        { homeIdx: 0, awayIdx: 2, homeScore: 2, awayScore: 0, isExtra: false },
      ],
    };
    expect(calcTeamRanking(record)).toEqual(['A', 'B', 'C']);
  });

  it('isExtra 경기는 순위 계산에서 제외', () => {
    const record = {
      gameDate: '2026-03-20',
      teamNames: ['A', 'B'],
      matches: [
        { homeIdx: 0, awayIdx: 1, homeScore: 1, awayScore: 0, isExtra: false },
        { homeIdx: 0, awayIdx: 1, homeScore: 0, awayScore: 5, isExtra: true },
      ],
    };
    expect(calcTeamRanking(record)).toEqual(['A', 'B']);
  });

  it('동점 시 알파벳 순 정렬 (localeCompare fallback)', () => {
    const record = {
      gameDate: '2026-03-20',
      teamNames: ['A', 'B'],
      matches: [{ homeIdx: 0, awayIdx: 1, homeScore: 1, awayScore: 1, isExtra: false }],
    };
    const ranking = calcTeamRanking(record);
    expect(ranking).toEqual(['A', 'B']); // alphabetical tie-break guarantees exact order
  });
});

describe('calcCrovaGogumaFreq', () => {
  it('선수별 1위/꼴찌 팀 소속 횟수 집계', () => {
    const records = [
      {
        gameDate: '2026-03-20',
        teamNames: ['A', 'B'],
        teams: [['알렉스', '본'], ['카이', '딘']],
        matches: [{ homeIdx: 0, awayIdx: 1, homeScore: 3, awayScore: 0, isExtra: false }],
      },
      {
        gameDate: '2026-03-27',
        teamNames: ['A', 'B'],
        teams: [['알렉스'], ['본']],
        matches: [{ homeIdx: 0, awayIdx: 1, homeScore: 0, awayScore: 2, isExtra: false }],
      },
    ];
    const result = calcCrovaGogumaFreq(records);
    expect(result.crova['알렉스']).toBe(1); // 3/20 1위
    expect(result.crova['본']).toBe(2);     // 3/20 1위 + 3/27 1위 (본이 B팀이었으니)
    expect(result.goguma['카이']).toBe(1);  // 3/20 꼴찌
    expect(result.goguma['딘']).toBe(1);    // 3/20 꼴찌
  });
});

describe('calcRoundMidpointTimePattern', () => {
  it('10라운드: 0~4는 전반, 5~9는 후반', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: Array.from({ length: 10 }, (_, i) => ({ matchId: `m${i}`, isExtra: false })),
      events: [
        { type: 'goal', matchId: 'm0', player: '서라현' },
        { type: 'goal', matchId: 'm4', player: '서라현' },
        { type: 'goal', matchId: 'm5', player: '서라현' },
        { type: 'goal', matchId: 'm9', player: '조재상' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 2, late: 1, total: 3 });
    expect(result['조재상']).toEqual({ early: 0, late: 1, total: 1 });
  });

  it('isExtra 라운드는 카운트 제외', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: [
        { matchId: 'm0', isExtra: false },
        { matchId: 'm1', isExtra: false },
        { matchId: 'm2', isExtra: true },
      ],
      events: [
        { type: 'goal', matchId: 'm0', player: '서라현' },
        { type: 'goal', matchId: 'm2', player: '서라현' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 1, late: 0, total: 1 });
  });

  it('9라운드 (홀수): 0~3 전반, 4~8 후반', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: Array.from({ length: 9 }, (_, i) => ({ matchId: `m${i}`, isExtra: false })),
      events: [
        { type: 'goal', matchId: 'm3', player: '서라현' },
        { type: 'goal', matchId: 'm4', player: '서라현' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 1, late: 1, total: 2 });
  });

  it('goal 아닌 이벤트는 무시', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: [{ matchId: 'm0', isExtra: false }, { matchId: 'm1', isExtra: false }],
      events: [
        { type: 'ownGoal', matchId: 'm0', player: '서라현' },
        { type: 'goal', matchId: 'm0', player: '서라현' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 1, late: 0, total: 1 });
  });

  it('N=1 세션은 건너뜀 (midpoint 의미 없음)', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: [{ matchId: 'm0', isExtra: false }],
      events: [{ type: 'goal', matchId: 'm0', player: '서라현' }],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toBeUndefined();
  });

  it('여러 세션에 걸쳐 누적 (서로 다른 N, 각자 midpoint 기준)', () => {
    const records = [
      {
        gameDate: '2026-03-20',
        matches: Array.from({ length: 10 }, (_, i) => ({ matchId: `a${i}`, isExtra: false })),
        events: [
          { type: 'goal', matchId: 'a1', player: '서라현' },  // midpoint=5, 1<5 → early
          { type: 'goal', matchId: 'a7', player: '서라현' },  // 7>=5 → late
        ],
      },
      {
        gameDate: '2026-03-27',
        matches: Array.from({ length: 6 }, (_, i) => ({ matchId: `b${i}`, isExtra: false })),
        events: [
          { type: 'goal', matchId: 'b0', player: '서라현' },  // midpoint=3, 0<3 → early
          { type: 'goal', matchId: 'b4', player: '서라현' },  // 4>=3 → late
        ],
      },
    ];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 2, late: 2, total: 4 });
  });
});

describe('sortSynergyWithTieBreak', () => {
  it('best 방향: 승률 desc → 라운드수 desc → 이름 asc', () => {
    const partners = [
      { name: '다연', games: 5, winRate: 0.5 },
      { name: '가연', games: 9, winRate: 0.5 },
      { name: '나연', games: 9, winRate: 0.5 },
      { name: '라연', games: 9, winRate: 0.7 },
    ];
    const sorted = sortSynergyWithTieBreak(partners, 'best');
    expect(sorted.map(p => p.name)).toEqual(['라연', '가연', '나연', '다연']);
  });

  it('worst 방향: 승률 asc → 라운드수 desc → 이름 asc', () => {
    const partners = [
      { name: '다연', games: 5, winRate: 0.3 },
      { name: '가연', games: 9, winRate: 0.3 },
      { name: '나연', games: 3, winRate: 0.1 },
    ];
    const sorted = sortSynergyWithTieBreak(partners, 'worst');
    expect(sorted.map(p => p.name)).toEqual(['나연', '가연', '다연']);
  });
});

describe('classifyTimeSlot', () => {
  it('초반 60% 이상: 초반형', () => {
    expect(classifyTimeSlot(6, 4, 10)).toEqual({ label: '초반형', emoji: '🔥' });
  });

  it('초반 40% 이하: 후반형', () => {
    expect(classifyTimeSlot(4, 6, 10)).toEqual({ label: '후반형', emoji: '⚡' });
  });

  it('초반 50%: 균형형', () => {
    expect(classifyTimeSlot(5, 5, 10)).toEqual({ label: '균형형', emoji: '⚖️' });
  });

  it('total<5: 샘플 부족 (null)', () => {
    expect(classifyTimeSlot(2, 2, 4)).toBe(null);
  });
});

describe('calcTrend', () => {
  it('최근 5세션 평균이 시즌 평균의 1.1배 이상이면 상승세', () => {
    const sessions = [1, 1, 1, 1, 1, 3, 3, 3, 3, 3]; // 시즌 avg 2, 최근 5 avg 3 → 1.5x
    expect(calcTrend(sessions)).toEqual({ direction: 'up', icon: '🔺', label: '상승세' });
  });

  it('최근 5세션 평균이 시즌 평균의 0.9배 이하이면 하락세', () => {
    const sessions = [5, 5, 5, 5, 5, 1, 1, 1, 1, 1]; // 시즌 avg 3, 최근 5 avg 1 → 0.33x
    expect(calcTrend(sessions)).toEqual({ direction: 'down', icon: '🔻', label: '하락세' });
  });

  it('사이면 유지', () => {
    const sessions = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]; // 동일
    expect(calcTrend(sessions)).toEqual({ direction: 'flat', icon: '➡️', label: '유지' });
  });

  it('세션 5개 미만: null', () => {
    expect(calcTrend([1, 2, 3])).toBe(null);
  });

  it('시즌 평균 0 (모두 0): 유지', () => {
    expect(calcTrend([0, 0, 0, 0, 0])).toEqual({ direction: 'flat', icon: '➡️', label: '유지' });
  });
});

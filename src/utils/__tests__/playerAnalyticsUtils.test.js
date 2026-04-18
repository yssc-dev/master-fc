import { describe, it, expect } from 'vitest';
import { calcTeamRanking, calcCrovaGogumaFreq } from '../playerAnalyticsUtils';

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

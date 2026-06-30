import { describe, it, expect } from 'vitest';
import { countFinishedSoccerMatches, calcSoccerOpponentRecords } from '../soccerScoring';

describe('countFinishedSoccerMatches', () => {
  it('status=finished 경기만 센다 (playing 제외)', () => {
    const matches = [
      { status: 'finished' },
      { status: 'finished' },
      { status: 'playing' },
    ];
    expect(countFinishedSoccerMatches(matches)).toBe(2);
  });

  it('휴식 경기(opponent="휴식")도 포함한다 — 진행도/헤더 카운트의 의도된 동작', () => {
    const matches = [
      { status: 'finished', opponent: '터틀파크' },
      { status: 'finished', opponent: '휴식' },
      { status: 'finished', opponent: '한울' },
    ];
    expect(countFinishedSoccerMatches(matches)).toBe(3);
  });

  it('전적계산(calcSoccerOpponentRecords)은 휴식을 제외 — 두 카운트는 의도적으로 다르다', () => {
    const matches = [
      { status: 'finished', opponent: '터틀파크', events: [] },
      { status: 'finished', opponent: '휴식', events: [] },
    ];
    // 진행도 카운트: 휴식 포함 → 2
    expect(countFinishedSoccerMatches(matches)).toBe(2);
    // 전적: 휴식 제외 → 상대팀 1팀(터틀파크)만 집계
    const recs = calcSoccerOpponentRecords(matches);
    expect(recs).toHaveLength(1);
    expect(recs[0].opponent).toBe('터틀파크');
  });

  it('undefined/null/빈배열 안전', () => {
    expect(countFinishedSoccerMatches(undefined)).toBe(0);
    expect(countFinishedSoccerMatches(null)).toBe(0);
    expect(countFinishedSoccerMatches([])).toBe(0);
  });

  it('null 원소가 섞여도 크래시하지 않는다', () => {
    expect(countFinishedSoccerMatches([null, { status: 'finished' }, undefined])).toBe(1);
  });
});

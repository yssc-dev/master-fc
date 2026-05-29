import { describe, it, expect } from 'vitest';
import { normalizeSchedule } from '../firebaseSyncDiff';

describe('normalizeSchedule', () => {
  it('정상 배열 형태는 그대로 통과', () => {
    const raw = [
      { matches: [[0, 1], [2, 3]] },
      { matches: [[0, 2], [1, 3]] },
    ];
    expect(normalizeSchedule(raw, [])).toEqual(raw);
  });

  it('outer 객체(희소 배열) → 배열로 정규화', () => {
    const raw = { 0: { matches: [[0, 1]] }, 1: { matches: [[2, 3]] } };
    expect(normalizeSchedule(raw, [])).toEqual([
      { matches: [[0, 1]] },
      { matches: [[2, 3]] },
    ]);
  });

  it('inner matches 객체 → 배열로 정규화', () => {
    const raw = [
      { matches: { 0: [0, 1], 1: [2, 3] } },
    ];
    expect(normalizeSchedule(raw, [])).toEqual([
      { matches: [[0, 1], [2, 3]] },
    ]);
  });

  it('inner pair 객체 → 배열로 정규화', () => {
    const raw = [
      { matches: [{ 0: 0, 1: 1 }, { 0: 2, 1: 3 }] },
    ];
    expect(normalizeSchedule(raw, [])).toEqual([
      { matches: [[0, 1], [2, 3]] },
    ]);
  });

  it('round.matches가 1개로 잘렸을 때 completedMatches로 복구', () => {
    const raw = [
      { matches: [[0, 1]] }, // 두 번째 매치 누락
    ];
    const completedMatches = [
      { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeScore: 1, awayScore: 0 },
      { matchId: 'R1_C1', homeIdx: 2, awayIdx: 3, homeScore: 2, awayScore: 1 },
    ];
    expect(normalizeSchedule(raw, completedMatches)).toEqual([
      { matches: [[0, 1], [2, 3]] },
    ]);
  });

  it('여러 라운드 + 누락된 슬롯 + completedMatches 복구', () => {
    const raw = [
      { matches: [[0, 1], [2, 3]] }, // OK
      { matches: [[0, 2]] }, // 두번째 누락
      { matches: [[0, 3]] }, // 두번째 누락
    ];
    const completedMatches = [
      { matchId: 'R2_C1', homeIdx: 1, awayIdx: 3 },
      { matchId: 'R3_C1', homeIdx: 1, awayIdx: 2 },
    ];
    expect(normalizeSchedule(raw, completedMatches)).toEqual([
      { matches: [[0, 1], [2, 3]] },
      { matches: [[0, 2], [1, 3]] },
      { matches: [[0, 3], [1, 2]] },
    ]);
  });

  it('빈 schedule', () => {
    expect(normalizeSchedule(null, [])).toEqual([]);
    expect(normalizeSchedule(undefined, [])).toEqual([]);
    expect(normalizeSchedule([], [])).toEqual([]);
  });

  it('null 라운드는 빈 matches로 안전 처리', () => {
    const raw = [{ matches: [[0, 1]] }, null];
    const result = normalizeSchedule(raw, []);
    expect(result[0]).toEqual({ matches: [[0, 1]] });
    expect(result[1]).toEqual({ matches: [] });
  });

  it('F 매치들은 무시 (R prefix만 라운드 복구 대상)', () => {
    const raw = [{ matches: [[0, 1]] }];
    const completedMatches = [
      { matchId: 'F1_C0', homeIdx: 9, awayIdx: 9 },
      { matchId: 'F2_C0', homeIdx: 8, awayIdx: 8 },
    ];
    expect(normalizeSchedule(raw, completedMatches)).toEqual([
      { matches: [[0, 1]] },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { calcTrend, calcRelativePosition } from '../playerAnalyticsUtils';

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

describe('calcRelativePosition', () => {
  it('팀 평균보다 높으면 양수 %', () => {
    expect(calcRelativePosition(1.5, [1.0, 1.0, 2.0])).toBe(13); // avg 1.333, (1.5/1.333-1)*100 = 12.5 → round
  });

  it('팀 평균보다 낮으면 음수 %', () => {
    expect(calcRelativePosition(0.5, [1.0, 1.0, 1.0])).toBe(-50);
  });

  it('팀 평균 0: 0 반환 (div-by-zero 방어)', () => {
    expect(calcRelativePosition(1, [0, 0, 0])).toBe(0);
  });

  it('팀 값 리스트 비어있으면 0', () => {
    expect(calcRelativePosition(1, [])).toBe(0);
  });
});

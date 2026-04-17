import { describe, it, expect } from 'vitest';
import { SPORT_DEFAULTS, PRESETS, resolvePreset } from '../settings.js';

describe('SPORT_DEFAULTS', () => {
  it('풋살 기본은 자살골 -1, 크로바/고구마 OFF', () => {
    expect(SPORT_DEFAULTS.풋살.ownGoalPoint).toBe(-1);
    expect(SPORT_DEFAULTS.풋살.useCrovaGoguma).toBe(false);
  });
  it('축구 기본은 자살골 -1, 클린시트 +1', () => {
    expect(SPORT_DEFAULTS.축구.ownGoalPoint).toBe(-1);
    expect(SPORT_DEFAULTS.축구.cleanSheetPoint).toBe(1);
  });
});

describe('PRESETS', () => {
  it('마스터FC풋살 프리셋은 자살골 -2 + 크로바/고구마 ON', () => {
    const p = PRESETS.풋살["마스터FC풋살"].values;
    expect(p.ownGoalPoint).toBe(-2);
    expect(p.useCrovaGoguma).toBe(true);
    expect(p.crovaPoint).toBe(2);
    expect(p.gogumaPoint).toBe(-1);
    expect(p.bonusMultiplier).toBe(2);
  });
  it('표준풋살 프리셋은 빈 values (SPORT_DEFAULTS만 의존)', () => {
    expect(PRESETS.풋살["표준풋살"].values).toEqual({});
  });
});

describe('resolvePreset', () => {
  it('마스터FC + 풋살 → 마스터FC풋살', () => {
    expect(resolvePreset("마스터FC", "풋살")).toBe("마스터FC풋살");
  });
  it('알 수 없는 팀 → 표준풋살', () => {
    expect(resolvePreset("알 수 없는 팀", "풋살")).toBe("표준풋살");
  });
  it('알 수 없는 팀 + 축구 → 표준축구', () => {
    expect(resolvePreset("알 수 없는 팀", "축구")).toBe("표준축구");
  });
});

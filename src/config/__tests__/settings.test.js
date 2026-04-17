import { describe, it, expect, beforeEach } from 'vitest';
import { SPORT_DEFAULTS, PRESETS, resolvePreset } from '../settings.js';
import { getEffectiveSettings, _setCacheForTest } from '../settings.js';

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

describe('getEffectiveSettings', () => {
  beforeEach(() => {
    _setCacheForTest({});
  });

  it('팀 데이터 없으면 SPORT_DEFAULTS만 반환', () => {
    const es = getEffectiveSettings("신규팀", "풋살");
    expect(es.ownGoalPoint).toBe(-1);
    expect(es.useCrovaGoguma).toBe(false);
  });

  it('프리셋이 SPORT_DEFAULTS를 덮어씀', () => {
    _setCacheForTest({
      "마스터FC": {
        shared: {},
        풋살: { preset: "마스터FC풋살", overrides: {} },
      },
    });
    const es = getEffectiveSettings("마스터FC", "풋살");
    expect(es.ownGoalPoint).toBe(-2);
    expect(es.useCrovaGoguma).toBe(true);
    expect(es.crovaPoint).toBe(2);
  });

  it('팀 오버라이드가 프리셋을 덮어씀', () => {
    _setCacheForTest({
      "팀A": {
        shared: {},
        풋살: { preset: "마스터FC풋살", overrides: { ownGoalPoint: -5 } },
      },
    });
    const es = getEffectiveSettings("팀A", "풋살");
    expect(es.ownGoalPoint).toBe(-5);
    expect(es.crovaPoint).toBe(2);
  });

  it('shared가 최상위 (종목 무관 데이터)', () => {
    _setCacheForTest({
      "팀B": {
        shared: { sheetId: "SHEET123", dashboardSheet: "팀B 대시보드" },
        풋살: { preset: "표준풋살", overrides: {} },
      },
    });
    const es = getEffectiveSettings("팀B", "풋살");
    expect(es.sheetId).toBe("SHEET123");
    expect(es.dashboardSheet).toBe("팀B 대시보드");
  });

  it('_meta에 preset/sport/team 포함', () => {
    _setCacheForTest({
      "팀C": { shared: {}, 풋살: { preset: "표준풋살", overrides: {} } },
    });
    const es = getEffectiveSettings("팀C", "풋살");
    expect(es._meta).toEqual({ preset: "표준풋살", sport: "풋살", team: "팀C" });
  });

  it('존재하지 않는 프리셋 이름 → 빈 프리셋 처리', () => {
    _setCacheForTest({
      "팀D": { shared: {}, 풋살: { preset: "없는프리셋", overrides: {} } },
    });
    const es = getEffectiveSettings("팀D", "풋살");
    expect(es.ownGoalPoint).toBe(-1);
  });
});

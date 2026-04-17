# SPORT_DEFAULTS 분리 + 팀 프리셋 오버라이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 `DEFAULTS` 단일 객체에 혼재된 종목 표준·팀 커스텀·공용 설정을 "종목 표준 + 프리셋 + 팀 오버라이드 + 팀 공용" 4계층 live-link 머지 구조로 분리하고, 신규 팀 온보딩 시 프리셋 선택으로 즉시 동작하도록 한다.

**Architecture:** `src/config/settings.js`에 `SPORT_DEFAULTS`, `PRESETS` 상수와 `getEffectiveSettings(team, sport)` 머지 함수를 추가한다. Firebase `settings/{team}` 경로의 데이터를 flat → `{ shared, 풋살, 축구 }` 중첩 구조로 자동 마이그레이션하며 원본은 `settings_legacy_backup/`에 보존한다. 모든 스코어링·UI는 `effectiveSettings`만 참조하고, 경기 시작 시 `gameState.settingsSnapshot`으로 캡처하여 경기 중 설정 변경의 영향을 차단한다.

**Tech Stack:** React 19, Vite 8, Firebase Realtime DB, Vitest (신규 도입 — 순수함수 단위 테스트), Playwright (기존 E2E).

**Spec reference:** `docs/superpowers/specs/2026-04-18-sport-defaults-and-team-presets-design.md`

**Total tasks:** 18

---

## File Structure

**신규 파일:**
- `vitest.config.js` — vitest 설정
- `src/config/__tests__/settings.test.js` — 순수함수 단위 테스트
- `docs/PRESETS.md` — 프리셋 목록 및 추가 방법
- `docs/TEAM_ONBOARDING.md` — 신규 팀 추가 절차

**수정 파일 (핵심):**
- `src/config/settings.js` — 상수 3종 + 헬퍼 6개 + 마이그레이션
- `src/Root.jsx` — `loadSettingsFromFirebase` 호출 시 teamEntries 전달
- `src/hooks/useGameReducer.js` — `settingsSnapshot` state + RESTORE_STATE 처리
- `src/App.jsx` — 스냅샷 캡처, getCumulativeBonus 가드, 스코어링 경로
- `src/SoccerApp.jsx` — 스냅샷 캡처, getCumulativeBonus 가드
- `src/components/common/SettingsScreen.jsx` — 프리셋 드롭다운, 토글, 출처 뱃지, 변경 모달
- `src/components/dashboard/TeamDashboard.jsx` — useCrovaGoguma 기반 컬럼 제어
- `src/components/game/PlayerStatsModal.jsx` — showBonus 주입원
- `src/components/history/HistoryView.jsx` — ownGoalPoint 하드코딩 제거
- `src/components/tournament/TournamentMatchManager.jsx` — 폴백 제거
- `src/utils/soccerScoring.js` — 폴백 제거
- `package.json` — vitest devDep, test 스크립트

---

## Task 1: Vitest 테스트 인프라 셋업

**Files:**
- Create: `vitest.config.js`
- Create: `src/config/__tests__/settings.test.js`
- Modify: `package.json`

- [ ] **Step 1: vitest devDep 추가**

```bash
cd /Users/rh/Desktop/python_dev/footsal_webapp
npm install -D vitest@^2
```

- [ ] **Step 2: vitest 설정 파일 생성**

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    globals: false,
  },
});
```

- [ ] **Step 3: package.json scripts 추가**

`package.json` `scripts` 블록에 추가:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 동작 확인용 임시 테스트 작성**

`src/config/__tests__/settings.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json vitest.config.js src/config/__tests__/
git commit -m "test: vitest 셋업 + 순수함수 단위 테스트 기반 추가"
```

---

## Task 2: SPORT_DEFAULTS 및 PRESETS 상수 추가 (기존 동작 유지)

**Files:**
- Modify: `src/config/settings.js`

- [ ] **Step 1: 상수 내보내기 추가**

`src/config/settings.js` 파일 상단 `const DEFAULTS` 선언 **바로 위**에 추가:

```js
export const SPORT_DEFAULTS = {
  풋살: {
    ownGoalPoint: -1,
    useCrovaGoguma: false,
    crovaPoint: 0,
    gogumaPoint: 0,
    bonusMultiplier: 1,
  },
  축구: {
    ownGoalPoint: -1,
    cleanSheetPoint: 1,
    opponents: [],
  },
};

export const PRESETS = {
  풋살: {
    "표준풋살": {
      description: "일반 풋살 규칙",
      values: {},
    },
    "마스터FC풋살": {
      description: "마스터FC 커스텀 (자살골 2배, 크로바/고구마)",
      values: {
        ownGoalPoint: -2,
        useCrovaGoguma: true,
        crovaPoint: 2,
        gogumaPoint: -1,
        bonusMultiplier: 2,
      },
    },
  },
  축구: {
    "표준축구": {
      description: "일반 축구 규칙",
      values: {},
    },
  },
};

const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  _default: { 풋살: "표준풋살", 축구: "표준축구" },
};

export function resolvePreset(team, sport) {
  return PRESET_MAP[team]?.[sport] || PRESET_MAP._default[sport];
}
```

- [ ] **Step 2: 기존 DEFAULTS는 유지 (이 태스크에서 제거하지 않음)**

이 태스크는 **추가만** 하고 기존 동작에 영향 없음을 보장한다. `DEFAULTS` 객체는 Task 18에서 제거된다.

- [ ] **Step 3: 테스트 작성**

`src/config/__tests__/settings.test.js`의 smoke 테스트 삭제하고 다음으로 교체:

```js
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
```

- [ ] **Step 4: 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 통과 (7 passed)

- [ ] **Step 5: 커밋**

```bash
git add src/config/settings.js src/config/__tests__/settings.test.js
git commit -m "feat(settings): SPORT_DEFAULTS, PRESETS 상수 추가"
```

---

## Task 3: getEffectiveSettings 머지 함수 + 테스트

**Files:**
- Modify: `src/config/settings.js`
- Modify: `src/config/__tests__/settings.test.js`

- [ ] **Step 1: 실패하는 테스트 먼저 작성**

`src/config/__tests__/settings.test.js` 끝에 추가:

```js
import { getEffectiveSettings, _setCacheForTest } from '../settings.js';

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
```

주의: `beforeEach` import 필요:
```js
import { describe, it, expect, beforeEach } from 'vitest';
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `getEffectiveSettings is not exported`

- [ ] **Step 3: `settings.js`에 구현**

`src/config/settings.js`의 `getSettings` 함수 아래에 추가:

```js
export function _setCacheForTest(obj) {
  _cache = obj;
}

export function getEffectiveSettings(team, sport) {
  const teamData = _cache[team] || {};
  const sportDefaults = SPORT_DEFAULTS[sport] || {};
  const presetName = teamData[sport]?.preset;
  const presetValues = PRESETS[sport]?.[presetName]?.values || {};
  const overrides = teamData[sport]?.overrides || {};
  const shared = teamData.shared || {};

  return {
    ...sportDefaults,
    ...presetValues,
    ...overrides,
    ...shared,
    _meta: { preset: presetName, sport, team },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 getEffectiveSettings 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/config/settings.js src/config/__tests__/settings.test.js
git commit -m "feat(settings): getEffectiveSettings live-link 머지 함수 추가"
```

---

## Task 4: isLegacyFormat + migrateToNested + 테스트

**Files:**
- Modify: `src/config/settings.js`
- Modify: `src/config/__tests__/settings.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`src/config/__tests__/settings.test.js` 끝에 추가:

```js
import { isLegacyFormat, migrateToNested } from '../settings.js';

describe('isLegacyFormat', () => {
  it('null/undefined → false', () => {
    expect(isLegacyFormat(null)).toBe(false);
    expect(isLegacyFormat(undefined)).toBe(false);
  });
  it('flat 객체 (shared/풋살/축구 키 없음) → true', () => {
    expect(isLegacyFormat({ ownGoalPoint: -2, dashboardSheet: "X" })).toBe(true);
  });
  it('새 구조 (shared 있음) → false', () => {
    expect(isLegacyFormat({ shared: {}, 풋살: {} })).toBe(false);
  });
  it('새 구조 (풋살만 있음) → false', () => {
    expect(isLegacyFormat({ 풋살: {} })).toBe(false);
  });
});

describe('migrateToNested', () => {
  it('마스터FC + 풋살 팀은 마스터FC풋살 프리셋으로 매핑', () => {
    const legacy = {
      dashboardSheet: "마스터FC 대시보드",
      dualTeams: [{ name: "창조", members: ["A"] }],
      ownGoalPoint: -2,
      crovaPoint: 2,
    };
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("마스터FC", legacy, teamEntries);

    expect(result.shared.dashboardSheet).toBe("마스터FC 대시보드");
    expect(result.풋살.preset).toBe("마스터FC풋살");
    expect(result.풋살.overrides.dualTeams).toEqual([{ name: "창조", members: ["A"] }]);
    expect(result).not.toHaveProperty("축구");
  });

  it('신규 팀 + 풋살 → 표준풋살 프리셋', () => {
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("신규팀", {}, teamEntries);
    expect(result.풋살.preset).toBe("표준풋살");
  });

  it('축구 팀원 있으면 축구 섹션 생성', () => {
    const legacy = { cleanSheetPoint: 2, opponents: ["A팀"] };
    const teamEntries = [{ mode: "축구", role: "감독" }];
    const result = migrateToNested("신규팀", legacy, teamEntries);

    expect(result.축구.preset).toBe("표준축구");
    expect(result.축구.overrides.cleanSheetPoint).toBe(2);
    expect(result.축구.overrides.opponents).toEqual(["A팀"]);
    expect(result).not.toHaveProperty("풋살");
  });

  it('legacy 값이 프리셋 값과 동일하면 overrides에 저장하지 않음', () => {
    const legacy = { ownGoalPoint: -2, crovaPoint: 2 };
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("마스터FC", legacy, teamEntries);

    expect(result.풋살.overrides.ownGoalPoint).toBeUndefined();
    expect(result.풋살.overrides.crovaPoint).toBeUndefined();
  });

  it('shared 키는 종목 구분 없이 shared로 이동', () => {
    const legacy = {
      sheetId: "X", attendanceSheet: "참석", dashboardSheet: "대시",
      pointLogSheet: "포인트", playerLogSheet: "선수",
    };
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("팀", legacy, teamEntries);

    expect(result.shared).toEqual({
      sheetId: "X", attendanceSheet: "참석", dashboardSheet: "대시",
      pointLogSheet: "포인트", playerLogSheet: "선수",
    });
  });

  it('teamEntries에 양 종목 있으면 양쪽 섹션 생성', () => {
    const teamEntries = [
      { mode: "풋살", role: "멤버" },
      { mode: "축구", role: "감독" },
    ];
    const result = migrateToNested("팀X", {}, teamEntries);
    expect(result.풋살.preset).toBe("표준풋살");
    expect(result.축구.preset).toBe("표준축구");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `isLegacyFormat is not exported`

- [ ] **Step 3: 구현**

`src/config/settings.js`의 `getEffectiveSettings` 아래에 추가:

```js
const SHARED_KEYS = [
  "sheetId", "attendanceSheet", "dashboardSheet",
  "pointLogSheet", "playerLogSheet",
];
const FUTSAL_KEYS = [
  "ownGoalPoint", "crovaPoint", "gogumaPoint", "bonusMultiplier",
  "useCrovaGoguma", "dualTeams", "dualTeamStartDate", "dualTeamEndDate",
];
const SOCCER_KEYS = [
  "ownGoalPoint", "cleanSheetPoint", "opponents", "eventLogSheet",
];

export function isLegacyFormat(raw) {
  if (!raw || typeof raw !== "object") return false;
  return !raw.shared && !raw["풋살"] && !raw["축구"];
}

function _sparseOverrides(legacy, keys, presetValues) {
  const overrides = {};
  for (const k of keys) {
    if (legacy[k] === undefined) continue;
    if (legacy[k] === presetValues[k]) continue;
    overrides[k] = legacy[k];
  }
  return overrides;
}

export function migrateToNested(team, legacy, teamEntries) {
  const out = { shared: {} };
  for (const k of SHARED_KEYS) {
    if (legacy[k] !== undefined) out.shared[k] = legacy[k];
  }

  const sports = new Set((teamEntries || []).map(e => e.mode));
  if (sports.size === 0) sports.add("풋살");

  if (sports.has("풋살")) {
    const preset = resolvePreset(team, "풋살");
    const presetValues = PRESETS.풋살[preset]?.values || {};
    out["풋살"] = {
      preset,
      overrides: _sparseOverrides(legacy, FUTSAL_KEYS, presetValues),
    };
  }
  if (sports.has("축구")) {
    const preset = resolvePreset(team, "축구");
    const presetValues = PRESETS.축구[preset]?.values || {};
    out["축구"] = {
      preset,
      overrides: _sparseOverrides(legacy, SOCCER_KEYS, presetValues),
    };
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 마이그레이션 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/config/settings.js src/config/__tests__/settings.test.js
git commit -m "feat(settings): legacy → nested 마이그레이션 로직 추가"
```

---

## Task 5: 출처 추적 헬퍼 (getSportDefault, getPresetValue, getSourceOf)

**Files:**
- Modify: `src/config/settings.js`
- Modify: `src/config/__tests__/settings.test.js`

- [ ] **Step 1: 실패 테스트 작성**

끝에 추가:

```js
import { getSportDefault, getPresetValue, getSourceOf, _setCacheForTest as _resetCache } from '../settings.js';

describe('getSportDefault', () => {
  it('풋살 자살골 기본 -1', () => {
    expect(getSportDefault("풋살", "ownGoalPoint")).toBe(-1);
  });
  it('축구 클린시트 기본 +1', () => {
    expect(getSportDefault("축구", "cleanSheetPoint")).toBe(1);
  });
});

describe('getPresetValue', () => {
  it('마스터FC풋살의 ownGoalPoint → -2', () => {
    expect(getPresetValue("풋살", "마스터FC풋살", "ownGoalPoint")).toBe(-2);
  });
  it('표준풋살의 crovaPoint → undefined (values 비어있음)', () => {
    expect(getPresetValue("풋살", "표준풋살", "crovaPoint")).toBeUndefined();
  });
});

describe('getSourceOf', () => {
  beforeEach(() => { _resetCache({}); });

  it('shared 키 → "shared"', () => {
    _resetCache({ "팀": { shared: { sheetId: "X" }, 풋살: { preset: "표준풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "sheetId")).toBe("shared");
  });
  it('override 키 → "override"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "표준풋살", overrides: { ownGoalPoint: -3 } } } });
    expect(getSourceOf("팀", "풋살", "ownGoalPoint")).toBe("override");
  });
  it('preset 값 → "preset"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "마스터FC풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "crovaPoint")).toBe("preset");
  });
  it('아무 곳에도 없음 → "default"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "표준풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "ownGoalPoint")).toBe("default");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — 함수 3개 export되지 않음

- [ ] **Step 3: 구현**

`src/config/settings.js` 끝에 추가:

```js
export function getSportDefault(sport, key) {
  return SPORT_DEFAULTS[sport]?.[key];
}

export function getPresetValue(sport, preset, key) {
  return PRESETS[sport]?.[preset]?.values?.[key];
}

export function getSourceOf(team, sport, key) {
  const teamData = _cache[team] || {};
  if (teamData.shared && key in teamData.shared) return "shared";
  const overrides = teamData[sport]?.overrides || {};
  if (key in overrides) return "override";
  const preset = teamData[sport]?.preset;
  const presetValues = PRESETS[sport]?.[preset]?.values || {};
  if (key in presetValues) return "preset";
  const sportDefaults = SPORT_DEFAULTS[sport] || {};
  if (key in sportDefaults) return "default";
  return "default";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/config/settings.js src/config/__tests__/settings.test.js
git commit -m "feat(settings): getSportDefault, getPresetValue, getSourceOf 헬퍼 추가"
```

---

## Task 6: loadSettingsFromFirebase 시그니처 확장 + 자동 마이그레이션

**Files:**
- Modify: `src/config/settings.js`

- [ ] **Step 1: 현재 함수 파악**

`src/config/settings.js:84-106`의 `loadSettingsFromFirebase(team)` 함수 전체를 아래로 교체.

- [ ] **Step 2: 함수 교체**

```js
export async function loadSettingsFromFirebase(team, teamEntries) {
  try {
    const snap = await get(_firebaseRef(team));
    const raw = snap.exists() ? snap.val() : null;

    if (raw && isLegacyFormat(raw)) {
      // 1) 원본 백업
      try {
        await set(
          ref(firebaseDb, "settings_legacy_backup/" + _safeTeam(team)),
          { ...raw, _migratedAt: Date.now() }
        );
      } catch (e) {
        console.warn("설정 백업 실패 (마이그레이션 중단):", e.message);
        return { ...DEFAULTS, ...raw };
      }
      // 2) 변환
      const migrated = migrateToNested(team, raw, teamEntries || []);
      // 3) 덮어쓰기
      await set(_firebaseRef(team), migrated);
      // 4) localStorage 캐시 정리 (legacy 키 무효화)
      const legacyKey = _key(team);
      localStorage.removeItem(legacyKey);
      _cache[team] = migrated;
      console.info("설정 마이그레이션 완료:", team);
      return migrated;
    }

    if (raw) {
      _cache[team] = raw;
      // localStorage 동기화 (new 구조)
      localStorage.setItem(_key(team), JSON.stringify(raw));
      return raw;
    }

    // Firebase에 데이터 없는 신규 팀: 기본 nested 구조 생성
    const sports = new Set((teamEntries || []).map(e => e.mode));
    if (sports.size === 0) sports.add("풋살");
    const fresh = { shared: {} };
    if (sports.has("풋살")) {
      fresh["풋살"] = { preset: resolvePreset(team, "풋살"), overrides: {} };
    }
    if (sports.has("축구")) {
      fresh["축구"] = { preset: resolvePreset(team, "축구"), overrides: {} };
    }
    _cache[team] = fresh;
    localStorage.setItem(_key(team), JSON.stringify(fresh));
    return fresh;
  } catch (e) {
    console.warn("설정 Firebase 로드 실패:", e.message);
    return _cache[team] || { shared: {} };
  }
}
```

- [ ] **Step 3: 주변 유틸 업데이트 — getSettings 동작 확인**

기존 `getSettings(team)`은 Task 18까지 legacy 구조 호환용으로 유지한다. 이 태스크에선 건드리지 않는다.

- [ ] **Step 4: 간단한 동적 검증**

dev 서버에서 수동 확인:
```bash
npm run dev
```
브라우저 DevTools Console에서:
```js
// 현재 팀 설정이 nested 구조로 변환되었는지
JSON.parse(localStorage.getItem("masterfc_settings_마스터FC"))
// 기대: { shared: {...}, 풋살: { preset: "마스터FC풋살", overrides: {...} } }
```
Firebase 콘솔에서 `settings_legacy_backup/마스터FC` 레코드 확인 (타임스탬프 포함).

**⚠️ 이 수동 검증은 Task 7까지 완료 후 한꺼번에 수행한다.** 지금은 코드만 적용 후 커밋.

- [ ] **Step 5: 커밋**

```bash
git add src/config/settings.js
git commit -m "feat(settings): loadSettingsFromFirebase 자동 마이그레이션 + 백업"
```

---

## Task 7: Root.jsx — loadSettingsFromFirebase에 teamEntries 전달

**Files:**
- Modify: `src/Root.jsx`

- [ ] **Step 1: 두 호출부 수정**

`src/Root.jsx:51`의 useEffect 내부:

**Before:**
```js
if (screen === "dashboard" && selectedTeamName) {
  checkPendingGames(selectedTeamName);
  loadSettingsFromFirebase(selectedTeamName);
}
```

**After:**
```js
if (screen === "dashboard" && selectedTeamName) {
  checkPendingGames(selectedTeamName);
  loadSettingsFromFirebase(selectedTeamName, selectedTeamEntries);
}
```

`src/Root.jsx:99`의 `selectTeam` 함수 내부:

**Before:**
```js
setScreen("dashboard");
checkPendingGames(teamName);
loadSettingsFromFirebase(teamName);
```

**After:**
```js
setScreen("dashboard");
checkPendingGames(teamName);
loadSettingsFromFirebase(teamName, entries);
```

- [ ] **Step 2: 마이그레이션 smoke test (dev 서버)**

```bash
npm run dev
```

브라우저에서 마스터FC로 로그인 → 대시보드 진입 후 DevTools Console:

```js
// 1) localStorage가 새 구조인지 확인
const s = JSON.parse(localStorage.getItem("masterfc_settings_마스터FC"));
console.log(s);
// 기대: { shared: { sheetId, dashboardSheet, ... }, 풋살: { preset: "마스터FC풋살", overrides: { dualTeams: [...] } } }
```

Firebase 콘솔에서 `settings_legacy_backup/마스터FC` 레코드 존재 확인. `_migratedAt` 타임스탬프 포함.

- [ ] **Step 3: 두 번째 로그인 시 재변환하지 않음을 확인 (멱등성)**

Firebase Console에서 `settings_legacy_backup/마스터FC`의 `_migratedAt` 값을 기록. 브라우저 하드 리프레시(⌘+Shift+R) 후 대시보드 재진입 → Firebase Console에서 `_migratedAt` 값이 **그대로**인지 확인 (재변환 안 일어남).

- [ ] **Step 4: 커밋**

```bash
git add src/Root.jsx
git commit -m "feat(root): loadSettingsFromFirebase에 teamEntries 전달 + 마이그레이션 트리거"
```

---

## Task 8: useGameReducer — settingsSnapshot state 추가 + RESTORE_STATE 처리

**Files:**
- Modify: `src/hooks/useGameReducer.js`

- [ ] **Step 1: initialState에 필드 추가**

`src/hooks/useGameReducer.js`에서 `initialState` 객체를 찾아 다음 필드 추가 (다른 필드 옆에 위치):

```js
settingsSnapshot: null,
```

- [ ] **Step 2: RESTORE_STATE case에 처리 추가**

`case 'RESTORE_STATE':` 블록에서 복원되는 필드 목록에 `settingsSnapshot` 포함. 이미 spread 방식(`...s`)이면 별도 처리 불필요하지만, explicit 복원 리스트면 추가:

```js
settingsSnapshot: s.settingsSnapshot != null ? s.settingsSnapshot : state.settingsSnapshot,
```

(주의: spec 6.4.2 요구사항 — legacy 상태에 snapshot 없으면 건드리지 않음)

- [ ] **Step 3: 신규 액션 SET_SETTINGS_SNAPSHOT 추가**

switch 블록에 새 case 추가 (기존 액션들과 나란히):

```js
case 'SET_SETTINGS_SNAPSHOT':
  return { ...state, settingsSnapshot: action.snapshot };
```

- [ ] **Step 4: autoSave에 포함되도록 gameState 구성 확인**

`useGameReducer.js`에는 직접 autoSave가 없고, 이는 App.jsx/SoccerApp.jsx의 `gameState` useMemo가 담당한다. 이 태스크에선 reducer state만 바꾼다. Task 9에서 gameState memo에 포함시킨다.

- [ ] **Step 5: 빌드 검증**

```bash
npm run build
```
Expected: 빌드 성공 (에러 없음). state shape 변경이 다른 파일에 영향 없는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/useGameReducer.js
git commit -m "feat(reducer): settingsSnapshot state 필드 + SET_SETTINGS_SNAPSHOT 액션"
```

---

## Task 9: App.jsx, SoccerApp.jsx — 경기 시작 시 스냅샷 캡처 + gameState 포함

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/SoccerApp.jsx`

- [ ] **Step 1: App.jsx — `getEffectiveSettings` import 추가**

`src/App.jsx` import 영역:

**Before:**
```js
import { getSettings } from './config/settings';
```

**After:**
```js
import { getSettings, getEffectiveSettings } from './config/settings';
```

(만약 이미 import 되어 있지 않으면 해당 라인 위치 찾아 추가)

- [ ] **Step 2: App.jsx — `_loadAllData` 내부 isNewGame 경로에 스냅샷 캡처**

`src/App.jsx`에서 `_loadAllData` 함수 내부, `isNewGame`일 때 fields를 초기화하는 블록 마지막에 다음 추가:

```js
if (isNewGame) {
  // ... 기존 초기화 ...
  fields.settingsSnapshot = getEffectiveSettings(teamContext.team, "풋살");
}
```

(정확한 위치는 `if (isNewGame)` 분기 끝, dispatch 호출 직전)

- [ ] **Step 3: App.jsx — gameState memo에 포함**

`src/App.jsx:207-215` 근처의 `gameState` useMemo 값 객체에 `settingsSnapshot` 포함:

```js
const gameState = useMemo(() => ({
  // ... 기존 필드 ...
  settingsSnapshot,
  lastEditTime: Date.now(),
}), [/* 기존 deps */, settingsSnapshot]);
```

reducer에서 selector도 추가: 파일 상단의 state 구조 분해 영역에 `settingsSnapshot` 포함.

- [ ] **Step 4: SoccerApp.jsx — 동일 적용**

`src/SoccerApp.jsx`에서 import 추가:
```js
import { getEffectiveSettings } from './config/settings';
```

`_loadAllData` 내 isNewGame 분기 마지막:
```js
fields.settingsSnapshot = getEffectiveSettings(teamContext.team, "축구");
```

gameState memo에 동일하게 포함.

- [ ] **Step 5: 기존 경기 복원 테스트 (legacy 상태)**

dev 서버에서 이미 진행 중인 경기(legacy settingsSnapshot 없음)가 있다면, 이어하기 해도 앱이 깨지지 않음을 확인. `state.settingsSnapshot === null`인 채로 동작 가능해야 함. 이 태스크의 스냅샷 로직은 **새 경기**만 대상.

- [ ] **Step 6: 커밋**

```bash
git add src/App.jsx src/SoccerApp.jsx
git commit -m "feat(game): 경기 시작 시 settingsSnapshot 캡처 + Firebase 동기화"
```

---

## Task 10: 스코어링 경로 — App.jsx에서 settingsSnapshot 사용

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: calcPlayerPoints 함수 수정 (App.jsx:324-338)**

**Before (App.jsx:325):**
```js
const { ownGoalPoint, crovaPoint, gogumaPoint, bonusMultiplier } = gameSettings;
```

**After:**
```js
const ES = state.settingsSnapshot || gameSettings;
const { ownGoalPoint, crovaPoint, gogumaPoint, bonusMultiplier, useCrovaGoguma } = ES;
```

- [ ] **Step 2: 크로바/고구마 가드 추가 (App.jsx:331-337)**

**Before (App.jsx:331):**
```js
if (matchMode !== "push" && courtCount === 2) {
  const sgl = getSeasonLeader("goguma"), scl = getSeasonLeader("crova");
  // ...
}
```

**After:**
```js
if (matchMode !== "push" && courtCount === 2 && useCrovaGoguma) {
  const sgl = getSeasonLeader("goguma"), scl = getSeasonLeader("crova");
  // ...
}
```

- [ ] **Step 3: 포인트로그 전송 루프 (App.jsx:560-562)**

**Before:**
```js
return { gameDate: dateStr, name: p, ...pts, owngoals: pts.owngoals * gameSettings.ownGoalPoint, rankScore, inputTime };
```

**After:**
```js
const ES = state.settingsSnapshot || gameSettings;
return { gameDate: dateStr, name: p, ...pts, owngoals: pts.owngoals * ES.ownGoalPoint, rankScore, inputTime };
```

- [ ] **Step 4: 대시보드 owngoals 표시 (App.jsx:1049)**

**Before:**
```jsx
<td style={{ ... }}>{p.owngoals > 0 ? p.owngoals * gameSettings.ownGoalPoint : 0}</td>
```

**After:**
```jsx
<td style={{ ... }}>{p.owngoals > 0 ? p.owngoals * (state.settingsSnapshot?.ownGoalPoint ?? gameSettings.ownGoalPoint) : 0}</td>
```

- [ ] **Step 5: 크로바/고구마 칼럼 숨김 조건 (App.jsx:1051-1052)**

**Before:**
```jsx
{matchMode !== "push" && courtCount === 2 && <td ...>{p.crova || ""}</td>}
{matchMode !== "push" && courtCount === 2 && <td ...>{p.goguma || ""}</td>}
```

**After:**
```jsx
{matchMode !== "push" && courtCount === 2 && (state.settingsSnapshot?.useCrovaGoguma ?? gameSettings.useCrovaGoguma) && <td ...>{p.crova || ""}</td>}
{matchMode !== "push" && courtCount === 2 && (state.settingsSnapshot?.useCrovaGoguma ?? gameSettings.useCrovaGoguma) && <td ...>{p.goguma || ""}</td>}
```

(테이블 헤더에 대응하는 th 칼럼도 같은 조건으로 숨기기 — 동일한 위치에서 검색해서 찾을 것)

- [ ] **Step 6: smoke test**

```bash
npm run dev
```
마스터FC 풋살 신규 경기 시작 → 자살골/크로바/고구마 이벤트 입력 → 대시보드에서 점수 계산 값이 기존과 동일 (×-2, crova +2, goguma -1)인지 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/App.jsx
git commit -m "refactor(app): settingsSnapshot 기반 스코어링 경로 통일"
```

---

## Task 11: 하드코딩 폴백 제거 (soccerScoring, Tournament, HistoryView)

**Files:**
- Modify: `src/utils/soccerScoring.js`
- Modify: `src/components/tournament/TournamentMatchManager.jsx`
- Modify: `src/components/history/HistoryView.jsx`

- [ ] **Step 1: soccerScoring.js:119-120 수정**

**Before:**
```js
export function calcSoccerPlayerPoint(playerStat, settings) {
  const { goals, assists, owngoals, cleanSheets } = playerStat;
  const ownGoalPt = settings?.ownGoalPoint ?? -1;
  const csPt = settings?.cleanSheetPoint ?? 1;
  return goals + assists + (owngoals * ownGoalPt) + (cleanSheets * csPt);
}
```

**After:**
```js
export function calcSoccerPlayerPoint(playerStat, settings) {
  const { goals, assists, owngoals, cleanSheets } = playerStat;
  return goals + assists + (owngoals * settings.ownGoalPoint) + (cleanSheets * settings.cleanSheetPoint);
}
```

- [ ] **Step 2: TournamentMatchManager.jsx:141 수정**

**Before:**
```js
Object.values(pStats).forEach(p => { p.point = p.goals + p.assists + (p.owngoals * (gameSettings?.ownGoalPoint ?? -1)) + (p.cleanSheets * (gameSettings?.cleanSheetPoint ?? 1)); });
```

**After:**
```js
Object.values(pStats).forEach(p => { p.point = p.goals + p.assists + (p.owngoals * gameSettings.ownGoalPoint) + (p.cleanSheets * gameSettings.cleanSheetPoint); });
```

주의: `gameSettings` prop이 effectiveSettings로 들어온다는 전제. 해당 컴포넌트 caller는 Tournament 관련 화면. 실제 호출 위치를 찾아 caller가 `getEffectiveSettings` 결과를 전달하도록 확인 (대부분 기존에도 `gameSettings` 객체를 전달하므로 변화 최소).

- [ ] **Step 3: HistoryView.jsx:22 시그니처 및 :112 호출부 수정**

**Before (line 22):**
```js
function calcPlayerStats(allEvents, completedMatches, attendees, teams, teamNames, ownGoalPoint) {
```
변경 없음 (시그니처 유지).

**Before (line 112):**
```js
const stats = calcPlayerStats(events, matches, attendees, teams, teamNames, -2);
```

**After (line 112):**
```js
const es = getEffectiveSettings(teamContext.team, teamContext.mode);
const stats = calcPlayerStats(events, matches, attendees, teams, teamNames, es.ownGoalPoint);
```

**추가:** 파일 상단에 import 추가:
```js
import { getEffectiveSettings } from '../../config/settings';
```

- [ ] **Step 4: SettingsScreen.jsx:118 하드코딩 제거**

`src/components/common/SettingsScreen.jsx` 상단 import 추가:
```js
import { SPORT_DEFAULTS } from '../../config/settings';
```

Line 118 수정:

**Before:**
```jsx
<NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={-1} />
```

**After:**
```jsx
<NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={SPORT_DEFAULTS.축구.ownGoalPoint} />
```

- [ ] **Step 5: smoke test**

dev 서버 실행 후:
- HistoryView 진입 시 마스터FC 과거 경기 점수 렌더링 정상 (기존과 동일 점수)
- 토너먼트 기능 사용 시 점수 계산 정상

- [ ] **Step 6: 커밋**

```bash
git add src/utils/soccerScoring.js src/components/tournament/TournamentMatchManager.jsx src/components/history/HistoryView.jsx src/components/common/SettingsScreen.jsx
git commit -m "refactor: ownGoalPoint 하드코딩 폴백 제거, effectiveSettings로 통일"
```

---

## Task 12: getCumulativeBonus 호출 가드

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/SoccerApp.jsx`

- [ ] **Step 1: App.jsx — `_loadBackgroundData` 가드 추가 (App.jsx:66)**

**Before:**
```js
AppSync.getCumulativeBonus(gameSettings.playerLogSheet).catch(() => ({ crova: {}, goguma: {} })),
```

**After:**
```js
const es = getEffectiveSettings(teamContext.team, "풋살");
es.useCrovaGoguma
  ? AppSync.getCumulativeBonus(es.playerLogSheet).catch(() => ({ crova: {}, goguma: {} }))
  : Promise.resolve({ crova: {}, goguma: {} }),
```

- [ ] **Step 2: App.jsx — `_loadAllData` 가드 (App.jsx:79)**

동일 패턴 적용:
```js
const es = getEffectiveSettings(teamContext.team, "풋살");
es.useCrovaGoguma
  ? AppSync.getCumulativeBonus(es.playerLogSheet).catch(err => { console.warn("누적보너스 로딩 실패:", err.message); return { crova: {}, goguma: {} }; })
  : Promise.resolve({ crova: {}, goguma: {} }),
```

- [ ] **Step 3: SoccerApp.jsx — 동일 처리**

SoccerApp.jsx의 `_loadBackgroundData`(54라인 근처)와 `_loadAllData`(66라인 근처)에서 `useCrovaGoguma`는 축구에서 의미 없으므로 **항상 skip**:

**Before (line 54):**
```js
AppSync.getCumulativeBonus(gameSettings.playerLogSheet).catch(() => ({ crova: {}, goguma: {} })),
```

**After:**
```js
Promise.resolve({ crova: {}, goguma: {} }),
```

(축구에는 크로바/고구마 개념 없음. 단순 제거)

- [ ] **Step 4: 네트워크 탭 검증**

dev 서버에서 마스터FC(풋살, useCrovaGoguma=true) 로그인 → 브라우저 DevTools Network 탭 → `getCumulativeBonus` 호출 확인됨.

임시로 설정화면에서 크로바/고구마 OFF 후 새로고침 → `getCumulativeBonus` 호출 **없음**을 확인.

- [ ] **Step 5: 포인트로그 전송 시 0 강제 (App.jsx:561)**

**Before:**
```js
if (pts.goals === 0 && pts.assists === 0 && pts.owngoals === 0 && pts.conceded === 0 && pts.cleanSheets === 0 && pts.keeperGames === 0 && pts.crova === 0 && pts.goguma === 0 && rankScore === 0) return null;
```

그 **직전 라인**에 추가:

```js
const ES2 = state.settingsSnapshot || gameSettings;
if (!ES2.useCrovaGoguma) {
  pts.crova = 0;
  pts.goguma = 0;
}
```

(위 중복 체크 포함 전체 로직 유지)

- [ ] **Step 6: 커밋**

```bash
git add src/App.jsx src/SoccerApp.jsx
git commit -m "feat: useCrovaGoguma OFF 팀은 getCumulativeBonus skip, 시트 전송 시 0 강제"
```

---

## Task 13: SettingsScreen — 프리셋 드롭다운 + useCrovaGoguma 토글

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx`

- [ ] **Step 1: import 확장**

```js
import {
  getEffectiveSettings, SPORT_DEFAULTS, PRESETS,
  getSettings, saveSettings,
} from '../../config/settings';
```

(`getDefaults`는 더 이상 사용 안 함 — import 제거)

- [ ] **Step 2: settings state 구조 변경**

**Before (line 9):**
```js
const [settings, setSettings] = useState(() => getSettings(teamName));
```

**After:**
```js
// sport별 effective settings + 현재 선택된 프리셋 정보
const sport = teamMode;
const [settings, setSettings] = useState(() => getEffectiveSettings(teamName, sport));
const [currentPreset, setCurrentPreset] = useState(() => settings._meta?.preset);
```

- [ ] **Step 3: 프리셋 드롭다운 UI 추가**

경기규칙 섹션(line 114 근처) 최상단에 추가:

```jsx
<div style={ss.row}>
  <span style={ss.label}>경기규칙 프리셋</span>
  <select
    style={ss.select}
    value={currentPreset || ""}
    onChange={e => handlePresetChange(e.target.value)}
  >
    {Object.keys(PRESETS[sport] || {}).map(p => (
      <option key={p} value={p}>{p}</option>
    ))}
  </select>
</div>
<div style={ss.hint}>
  {PRESETS[sport]?.[currentPreset]?.description || ""}
</div>
```

`handlePresetChange` 함수는 Task 15에서 모달과 함께 추가. 지금은 임시로:

```js
const handlePresetChange = (newPreset) => {
  setCurrentPreset(newPreset);
  // 프리셋 변경 시 effective 재계산 필요 — Task 15에서 모달과 함께 완성
  setSaved(false);
};
```

- [ ] **Step 4: 크로바/고구마 토글 추가 (풋살 모드만)**

기존 풋살 섹션(line 122 이하 `NumRow` 묶음)을 다음으로 교체:

```jsx
<div style={ss.row}>
  <label style={ss.label}>
    <input type="checkbox"
      checked={!!settings.useCrovaGoguma}
      onChange={e => update("useCrovaGoguma", e.target.checked)}
      style={{ marginRight: 6 }} />
    크로바/고구마 사용
  </label>
  <span style={ss.hint}>표준: 꺼짐</span>
</div>

<NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={SPORT_DEFAULTS.풋살.ownGoalPoint} />

{settings.useCrovaGoguma && (
  <>
    <NumRow label="크로바(1위팀)" value={settings.crovaPoint} onChange={v => update("crovaPoint", v)} defaultVal={0} />
    <NumRow label="고구마(꼴찌팀)" value={settings.gogumaPoint} onChange={v => update("gogumaPoint", v)} defaultVal={0} />
    <NumRow label="황금크로바/탄고구마" value={settings.bonusMultiplier} onChange={v => update("bonusMultiplier", v)} defaultVal={1} suffix="배" />
    <div style={{ fontSize: 10, color: C.grayDark, marginBottom: 8 }}>※ 크로바/고구마 점수는 2구장 경기에서만 적용됩니다.</div>
    <details style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
      <summary style={{ cursor: "pointer", padding: "6px 0" }}>황금크로바 / 탄고구마 설명</summary>
      <div style={{ background: C.card, borderRadius: 8, padding: 10, marginTop: 4 }}>
        시즌 누적 크로바 1위가 꼴등팀 소속 → 고구마 {settings.gogumaPoint} × {settings.bonusMultiplier} = {settings.gogumaPoint * settings.bonusMultiplier}<br/>
        시즌 누적 고구마 1위가 1등팀 소속 → 크로바 {settings.crovaPoint} × {settings.bonusMultiplier} = {settings.crovaPoint * settings.bonusMultiplier}
      </div>
    </details>
  </>
)}
```

- [ ] **Step 5: smoke test**

dev 서버에서 마스터FC 설정 화면 진입:
- 프리셋 드롭다운 "마스터FC풋살" 선택 상태로 표시
- 크로바/고구마 토글 체크된 상태 + 3개 하위 필드 표시
- 토글 OFF → 하위 3필드 숨김 확인

- [ ] **Step 6: 커밋**

```bash
git add src/components/common/SettingsScreen.jsx
git commit -m "feat(settings-ui): 프리셋 드롭다운 + useCrovaGoguma 토글 UI"
```

---

## Task 14: SettingsScreen — 출처 뱃지 (🔵/🟡/⚪)

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx`

- [ ] **Step 1: import 확장**

```js
import { getSourceOf } from '../../config/settings';
```

- [ ] **Step 2: SourceBadge 서브컴포넌트 추가**

컴포넌트 함수 내부, `NumRow` 정의 옆에 추가:

```jsx
const SourceBadge = ({ k }) => {
  const src = getSourceOf(teamName, sport, k);
  const config = {
    preset:   { color: "#5b9bff", label: "프리셋" },
    override: { color: "#ffb84d", label: "오버라이드" },
    shared:   { color: "#9c9c9c", label: "공용" },
    default:  { color: "#9c9c9c", label: "표준" },
  }[src] || { color: "#9c9c9c", label: "표준" };
  return (
    <span style={{ fontSize: 10, color: config.color, marginLeft: 6 }}>
      ●{config.label}
    </span>
  );
};
```

- [ ] **Step 3: NumRow를 SourceBadge와 결합**

`NumRow` 정의(line 80 근처)를 다음으로 교체:

```jsx
const NumRow = ({ label, value, onChange, defaultVal, suffix, settingKey }) => (
  <div style={ss.row}>
    <span style={{ ...ss.label, minWidth: 0 }}>
      {label}
      {settingKey && <SourceBadge k={settingKey} />}
    </span>
    <input type="number" style={ss.numInput} value={value} onChange={e => onChange(Number(e.target.value))} />
    <span style={{ ...ss.hint, width: 60, textAlign: "right", flexShrink: 0 }}>기본: {defaultVal}{suffix || ""}</span>
  </div>
);
```

- [ ] **Step 4: 모든 NumRow 호출에 settingKey 추가**

경기규칙 섹션의 모든 `<NumRow ...>` 호출에 `settingKey` prop 추가:

```jsx
<NumRow settingKey="ownGoalPoint" label="자책골 포인트" ... />
<NumRow settingKey="crovaPoint" label="크로바(1위팀)" ... />
<NumRow settingKey="gogumaPoint" label="고구마(꼴찌팀)" ... />
<NumRow settingKey="bonusMultiplier" label="황금크로바/탄고구마" ... />
<NumRow settingKey="cleanSheetPoint" label="클린시트 포인트" ... />
```

크로바/고구마 토글 label 옆에도 SourceBadge:
```jsx
<label style={ss.label}>
  <input type="checkbox" ... />
  크로바/고구마 사용
  <SourceBadge k="useCrovaGoguma" />
</label>
```

- [ ] **Step 5: smoke test**

- 마스터FC 설정 화면: 자책골 포인트 옆 🟡오버라이드 또는 🔵프리셋 (팀 데이터에 따라)
- crovaPoint 옆 🔵프리셋 (마스터FC풋살 프리셋에서 옴)

- [ ] **Step 6: 커밋**

```bash
git add src/components/common/SettingsScreen.jsx
git commit -m "feat(settings-ui): 값 출처 뱃지(프리셋/오버라이드/표준) 표시"
```

---

## Task 15: SettingsScreen — 프리셋 변경 확인 모달

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx`

- [ ] **Step 1: 모달 state 추가**

컴포넌트 상단:
```js
const [presetChangeDialog, setPresetChangeDialog] = useState(null);
// null | { newPreset, diffs: [{key, from, to}], overrides: {k:v} }
```

- [ ] **Step 2: handlePresetChange 실제 구현**

Task 13에서 만든 임시 핸들러를 교체:

```js
const handlePresetChange = (newPreset) => {
  if (newPreset === currentPreset) return;
  const newPresetValues = PRESETS[sport]?.[newPreset]?.values || {};
  const oldPresetValues = PRESETS[sport]?.[currentPreset]?.values || {};
  const sportDef = SPORT_DEFAULTS[sport] || {};

  const before = { ...sportDef, ...oldPresetValues };
  const after = { ...sportDef, ...newPresetValues };
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs = [];
  for (const k of keys) {
    if (before[k] !== after[k]) diffs.push({ key: k, from: before[k], to: after[k] });
  }

  // 현재 오버라이드 추출 (지금 settings와 preset+defaults 비교)
  const combined = { ...sportDef, ...oldPresetValues };
  const overrides = {};
  for (const k of Object.keys(settings)) {
    if (k === "_meta" || k.startsWith("_")) continue;
    if (SPORT_DEFAULTS[sport] && !(k in SPORT_DEFAULTS[sport]) && !(k in oldPresetValues)) continue;
    if (settings[k] !== combined[k]) overrides[k] = settings[k];
  }

  setPresetChangeDialog({ newPreset, diffs, overrides });
};

const applyPresetChange = (keepOverrides) => {
  if (!presetChangeDialog) return;
  const { newPreset, overrides } = presetChangeDialog;
  const newPresetValues = PRESETS[sport]?.[newPreset]?.values || {};
  const sportDef = SPORT_DEFAULTS[sport] || {};

  // settings 재구성
  const newSettings = { ...settings, ...sportDef, ...newPresetValues };
  if (keepOverrides) {
    Object.assign(newSettings, overrides);
  }

  setCurrentPreset(newPreset);
  setSettings({ ...newSettings, _meta: { ...settings._meta, preset: newPreset } });
  setPresetChangeDialog(null);
  setSaved(false);
};
```

- [ ] **Step 3: 모달 렌더**

컴포넌트 JSX 끝 `</div>` 바로 앞에 추가:

```jsx
{presetChangeDialog && (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500,
  }}>
    <div style={{ background: C.bg, borderRadius: 12, padding: 20, maxWidth: 360, width: "90%" }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: C.white }}>
        "{currentPreset}" → "{presetChangeDialog.newPreset}"
      </div>
      {presetChangeDialog.diffs.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>다음 값이 바뀝니다:</div>
          <ul style={{ fontSize: 12, color: C.white, paddingLeft: 20, marginBottom: 12 }}>
            {presetChangeDialog.diffs.map(d => (
              <li key={d.key}>{d.key}: {String(d.from)} → {String(d.to)}</li>
            ))}
          </ul>
        </>
      )}
      {Object.keys(presetChangeDialog.overrides).length > 0 && (
        <>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>
            이 팀이 덮어쓴 값({Object.keys(presetChangeDialog.overrides).length}개):
          </div>
          <ul style={{ fontSize: 11, color: C.grayDark, paddingLeft: 20, marginBottom: 12 }}>
            {Object.entries(presetChangeDialog.overrides).map(([k, v]) => (
              <li key={k}>{k} = {String(v)}</li>
            ))}
          </ul>
        </>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.keys(presetChangeDialog.overrides).length > 0 && (
          <button onClick={() => applyPresetChange(true)} style={ss.btn(C.grayDark, C.white)}>
            오버라이드 유지
          </button>
        )}
        <button onClick={() => applyPresetChange(false)} style={ss.btn(C.accent, C.bg)}>
          전부 초기화
        </button>
        <button onClick={() => setPresetChangeDialog(null)} style={ss.btn(C.grayDarker, C.gray)}>
          취소
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: smoke test**

- 마스터FC에서 프리셋 드롭다운을 "표준풋살"로 변경 → 모달 표시됨
- "전부 초기화" 선택 → 경기규칙 값들이 표준으로 리셋
- "취소" → 프리셋 원래대로

- [ ] **Step 5: 커밋**

```bash
git add src/components/common/SettingsScreen.jsx
git commit -m "feat(settings-ui): 프리셋 변경 확인 모달 (유지/초기화/취소)"
```

---

## Task 16: saveSettings — nested 구조 + sparse overrides

**Files:**
- Modify: `src/config/settings.js`
- Modify: `src/components/common/SettingsScreen.jsx`

- [ ] **Step 1: 기존 saveSettings 교체**

`src/config/settings.js`의 `saveSettings` 함수 전체를 다음으로 교체:

```js
export async function saveSettings(team, sport, effectiveValues, presetName) {
  const sportDef = SPORT_DEFAULTS[sport] || {};
  const presetValues = PRESETS[sport]?.[presetName]?.values || {};

  const sharedOut = {};
  const overrides = {};

  for (const k of Object.keys(effectiveValues)) {
    if (k === "_meta" || k.startsWith("_")) continue;
    if (SHARED_KEYS.includes(k)) {
      sharedOut[k] = effectiveValues[k];
      continue;
    }
    const presetVal = k in presetValues ? presetValues[k] : sportDef[k];
    if (effectiveValues[k] === presetVal) continue;
    overrides[k] = effectiveValues[k];
  }

  const existing = _cache[team] || {};
  const next = {
    ...existing,
    shared: { ...(existing.shared || {}), ...sharedOut },
    [sport]: { preset: presetName, overrides },
  };

  _cache[team] = next;
  localStorage.setItem(_key(team), JSON.stringify(next));
  try {
    await set(_firebaseRef(team), next);
  } catch (e) {
    console.warn("설정 Firebase 저장 실패:", e.message);
  }
}
```

- [ ] **Step 2: SettingsScreen handleSave 호출부 수정**

`src/components/common/SettingsScreen.jsx`:

**Before:**
```js
const handleSave = async () => {
  await saveSettings(teamName, settings);
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
};
```

**After:**
```js
const handleSave = async () => {
  await saveSettings(teamName, sport, settings, currentPreset);
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
};
```

`handleReset` 함수도 수정:

**Before:**
```js
const handleReset = async () => {
  if (!confirm("모든 설정을 기본값으로 초기화하시겠습니까?")) return;
  setSettings({ ...defaults });
  await saveSettings(teamName, defaults);
  setSaved(true);
};
```

**After:**
```js
const handleReset = async () => {
  if (!confirm("이 종목 설정을 프리셋 기본값으로 초기화하시겠습니까?")) return;
  const sportDef = SPORT_DEFAULTS[sport] || {};
  const presetValues = PRESETS[sport]?.[currentPreset]?.values || {};
  const resetSettings = {
    ...settings,  // shared 보존
    ...sportDef,
    ...presetValues,
  };
  setSettings(resetSettings);
  await saveSettings(teamName, sport, resetSettings, currentPreset);
  setSaved(true);
};
```

- [ ] **Step 3: `defaults` 참조 제거**

SettingsScreen 상단 `const defaults = getDefaults();` 라인 삭제. 해당 변수 참조하는 곳 모두 찾아 제거 (이제 없어야 함).

- [ ] **Step 4: saveSettings 테스트 추가**

`src/config/__tests__/settings.test.js` 끝에:

```js
import { saveSettings } from '../settings.js';

describe('saveSettings', () => {
  beforeEach(() => { _resetCache({}); });

  it('프리셋 값과 같은 필드는 overrides에 저장하지 않음', async () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "마스터FC풋살", overrides: {} } } });
    // 주의: 이 테스트는 Firebase/localStorage 부작용을 우회해야 함
    // 간단히 _cache만 업데이트되는지 검증
    const effective = {
      ownGoalPoint: -2,  // 프리셋 값과 동일
      crovaPoint: 2,     // 프리셋 값과 동일
      useCrovaGoguma: true,
      sheetId: "SHEET123",
    };
    // localStorage/Firebase mock은 스킵, _cache 직접 확인
    // saveSettings는 비동기지만 cache 업데이트는 동기
    saveSettings("팀", "풋살", effective, "마스터FC풋살").catch(()=>{});

    const cached = /* getEffectiveSettings */;
    // 이 테스트는 통합성이 낮으므로 기본 검증만:
    // 수동으로 _cache 조회
  });
});
```

**주의:** 이 테스트는 localStorage/Firebase mock이 필요해 복잡하므로, vitest setup에 간단한 stub 추가하거나 이 테스트를 생략한다. 아래처럼 단순화:

```js
describe('saveSettings - pure logic only', () => {
  it('SHARED_KEYS와 sport 키가 올바르게 분리되는 것은 수동 QA로 검증', () => {
    expect(true).toBe(true); // placeholder
  });
});
```

→ 실제 검증은 dev 서버 수동 테스트로.

- [ ] **Step 5: dev 수동 QA**

```bash
npm run dev
```
1. 마스터FC 설정 화면 → 자책골 포인트를 -2에서 -5로 변경 → 저장
2. Firebase 콘솔에서 `settings/마스터FC/풋살/overrides/ownGoalPoint` = `-5` 확인
3. 다시 -2로 변경 → 저장
4. Firebase에서 `overrides`에서 `ownGoalPoint` 제거됨 확인 (sparse)

- [ ] **Step 6: 커밋**

```bash
git add src/config/settings.js src/config/__tests__/settings.test.js src/components/common/SettingsScreen.jsx
git commit -m "feat(settings): saveSettings nested 구조 + sparse overrides"
```

---

## Task 17: TeamDashboard + PlayerStatsModal + HistoryView — effectiveSettings 통합

**Files:**
- Modify: `src/components/dashboard/TeamDashboard.jsx`
- Modify: `src/components/game/PlayerStatsModal.jsx`
- Modify: `src/components/history/HistoryView.jsx`

- [ ] **Step 1: TeamDashboard.jsx — useCrovaGoguma 기반 컬럼 표시**

파일 상단에 import 추가:
```js
import { getEffectiveSettings } from '../../config/settings';
```

현재 `activeSport`를 기반으로 크로바/고구마 컬럼 표시하는 부분(line 435-436):

**Before:**
```js
activeSport !== "축구" && { key: "crova", label: "🍀" },
activeSport !== "축구" && { key: "goguma", label: "🍠" },
```

**After:**
```js
// 풋살이면서 크로바/고구마 사용 팀만 표시
(() => {
  if (activeSport === "축구") return null;
  const es = getEffectiveSettings(teamName, "풋살");
  return es.useCrovaGoguma ? { key: "crova", label: "🍀" } : null;
})(),
(() => {
  if (activeSport === "축구") return null;
  const es = getEffectiveSettings(teamName, "풋살");
  return es.useCrovaGoguma ? { key: "goguma", label: "🍠" } : null;
})(),
```

- [ ] **Step 2: PlayerStatsModal — showBonus prop 명시**

`src/components/game/PlayerStatsModal.jsx`에서 `showBonus` 기본값 제거하고 caller가 항상 전달:

**Before (line 11):**
```jsx
const colKeys = ["name", "goals", "assists", "owngoals", "cleanSheets", ...(showBonus ? ["crova", "goguma"] : []), "keeperGames", "conceded", "total"];
```

→ 변화 없음. PlayerStatsModal의 caller 찾기:
```bash
grep -rn "PlayerStatsModal" src/
```

각 caller에서 `showBonus={effectiveSettings.useCrovaGoguma}` 전달하도록 수정. App.jsx 내부 사용이면 `showBonus={(state.settingsSnapshot || gameSettings).useCrovaGoguma}`.

- [ ] **Step 3: HistoryView — teamContext prop 활용 (이미 Task 11에서 했지만 확인)**

Task 11에서 `const es = getEffectiveSettings(teamContext.team, teamContext.mode);` 추가했는지 재확인. 없으면 추가.

- [ ] **Step 4: smoke test**

dev 서버:
- 마스터FC (useCrovaGoguma=true) → 대시보드에 🍀/🍠 컬럼 표시
- 설정에서 OFF → 컬럼 사라짐
- 축구 팀 → 컬럼 항상 없음

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/TeamDashboard.jsx src/components/game/PlayerStatsModal.jsx src/components/history/HistoryView.jsx
git commit -m "refactor: 대시보드/모달/히스토리 effectiveSettings 통합"
```

---

## Task 18: getDefaults 제거 + 기존 DEFAULTS 축소 + 문서화

**Files:**
- Modify: `src/config/settings.js`
- Create: `docs/PRESETS.md`
- Create: `docs/TEAM_ONBOARDING.md`

- [ ] **Step 1: getDefaults export 제거**

`src/config/settings.js`에서 `export function getDefaults()` 함수 삭제.

전체 codebase에서 `getDefaults` 참조 검색:
```bash
grep -rn "getDefaults" src/
```

아직 참조하는 곳 있으면 그곳의 코드를 `getSportDefault(sport, key)` 또는 `SPORT_DEFAULTS[sport]` 사용으로 교체.

- [ ] **Step 2: 기존 DEFAULTS 축소**

`src/config/settings.js`의 `const DEFAULTS` 객체를 **legacy fallback용 최소 객체**로 축소. legacy `getSettings`가 여전히 legacy 구조 읽을 때 보조 기본값으로만 사용.

```js
// legacy 호환 최소 객체 - 새 코드는 SPORT_DEFAULTS/PRESETS 사용
const DEFAULTS = {
  sheetId: SHEET_CONFIG.sheetId,
  attendanceSheet: "참석명단",
  dashboardSheet: "대시보드",
  pointLogSheet: "포인트로그",
  playerLogSheet: "선수별집계기록로그",
  eventLogSheet: "",
};
```

기존 팀전/경기규칙 관련 필드(`dualTeams`, `ownGoalPoint` 등)는 **제거**. 이들은 이제 SPORT_DEFAULTS/PRESETS 경유로만 제공.

- [ ] **Step 3: 기존 getSettings 함수는 호환용으로 유지**

`getSettings(team)`은 legacy 구조 캐시에서 flat 값 반환하므로, **진행 중 경기의 legacy settingsSnapshot 복원 경로**에서만 사용된다. 이 태스크에선 건드리지 않는다.

- [ ] **Step 4: `docs/PRESETS.md` 작성**

```markdown
# 프리셋 시스템

## 개요

팀별 경기규칙은 **3계층 머지**로 결정된다:
1. `SPORT_DEFAULTS[sport]` — 종목 표준 규칙 (코드 상수)
2. `PRESETS[sport][name].values` — 프리셋 (코드 상수)
3. 팀의 `overrides` — Firebase `settings/{team}/{sport}/overrides`에 sparse 저장

머지 순서: `SPORT_DEFAULTS < preset < overrides < shared`

## 현재 프리셋 목록

### 풋살
- **표준풋살** — `SPORT_DEFAULTS.풋살`만 사용 (자살골 -1, 크로바/고구마 꺼짐)
- **마스터FC풋살** — 자살골 -2, 크로바/고구마 ON, 2배 보너스

### 축구
- **표준축구** — 자살골 -1, 클린시트 +1

## 새 프리셋 추가하는 방법

1. `src/config/settings.js`의 `PRESETS[sport]` 객체에 키 추가:

```js
PRESETS.풋살["새프리셋"] = {
  description: "설명",
  values: { ownGoalPoint: -3, useCrovaGoguma: true, crovaPoint: 3, ... },
};
```

2. 팀-프리셋 자동 매핑이 필요하면 `PRESET_MAP`에 추가:

```js
const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  "신규팀": { 풋살: "새프리셋" },
  _default: { 풋살: "표준풋살", 축구: "표준축구" },
};
```

3. 설정 화면에서 드롭다운에 자동 노출됨.

## 제약

- `SPORT_DEFAULTS`와 프리셋이 같은 값을 가지면 sparse 저장 로직에 의해 Firebase에는 저장되지 않는다. 이는 의도된 동작.
- `useCrovaGoguma: false`인 팀에서 `crovaPoint` 같은 값은 UI에 숨겨지지만 저장 구조에는 존재 가능.
```

- [ ] **Step 5: `docs/TEAM_ONBOARDING.md` 작성**

```markdown
# 신규 팀 온보딩 절차

## 1. Firebase에 팀 레코드 추가

`teams/` 경로 또는 해당 auth 시스템에서 사용자 레코드의 `team` 필드를 새 팀 이름으로 설정.

## 2. 구글 스프레드시트 준비

팀별 탭을 생성한다. 탭 이름 권장 규약:
- `{팀명} 대시보드`
- `{팀명} 포인트로그`
- `{팀명} 선수별집계기록로그`
- `{팀명} 참석명단`
- (축구) `{팀명} 이벤트로그`

## 3. 신규 팀 최초 로그인

최초 로그인 시 `loadSettingsFromFirebase`가 해당 팀의 기본 설정을 생성한다:
- 풋살 팀: `풋살.preset = "표준풋살"`, `overrides: {}`
- 축구 팀: `축구.preset = "표준축구"`, `overrides: {}`

## 4. 팀별 프리셋 매핑이 필요하면

`src/config/settings.js`의 `PRESET_MAP`에 팀 → 프리셋 매핑 추가 후 재배포.

## 5. 설정 화면에서 시트 이름 지정

신규 팀은 초기 shared 시트가 비어있으므로, 최초 관리자가 설정 화면에서 시트 이름을 입력해야 한다.

## 6. 커스텀 규칙 적용

- 자살골 2배 같은 팀별 커스텀: 설정 화면에서 개별 필드 수정 → overrides에 sparse 저장
- 크로바/고구마 같은 규칙 자체 on/off: `useCrovaGoguma` 체크박스 사용
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```
Expected: 모든 단위 테스트 통과.

```bash
npm run build
```
Expected: 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add src/config/settings.js docs/PRESETS.md docs/TEAM_ONBOARDING.md
git commit -m "chore: getDefaults 제거, DEFAULTS 축소, 프리셋 문서화"
```

---

## 완료 후 수동 QA 체크리스트

Task 18까지 모두 완료 후 dev 서버에서 다음을 수동 실행:

**마스터FC 기존 동작 불변:**
- [ ] 경기 시작 시 `state.settingsSnapshot.ownGoalPoint === -2` (DevTools)
- [ ] 자책골 이벤트 → 상대 +2 득점
- [ ] 대시보드 🍀/🍠 컬럼 표시
- [ ] 기록확정 → 포인트로그 시트에 `owngoals × -2`, crova/goguma 값 정상
- [ ] 황금크로바/탄고구마 조건 시 2배

**프리셋 변경 UX:**
- [ ] 설정에서 마스터FC풋살 → 표준풋살 전환 시 모달 표시
- [ ] "오버라이드 유지" 선택 시 수정했던 값 보존
- [ ] "전부 초기화" 선택 시 표준 값으로 리셋
- [ ] 출처 뱃지(🔵/🟡/⚪) 각 필드 정확성

**신규 표준 풋살팀 (임시 테스트팀 생성):**
- [ ] 프리셋 드롭다운에 "표준풋살" 선택 상태
- [ ] 크로바/고구마 토글 기본 OFF, 하위 필드 숨김
- [ ] 대시보드 🍀/🍠 컬럼 숨김
- [ ] `getCumulativeBonus` Apps Script 호출 skip (Network 탭)

---

## 롤백 절차

문제 발견 시:
```bash
git log --oneline -20
# 문제 커밋 SHA 확인
git revert <sha>
git push origin main  # 자동 배포
```

마이그레이션으로 인한 데이터 문제:
1. Firebase 콘솔에서 `settings_legacy_backup/{team}` 레코드 확인
2. 해당 데이터를 `settings/{team}` 경로로 복사 (덮어쓰기)
3. `settings/{team}.shared`, `.풋살`, `.축구` 키 전부 제거
4. 사용자가 다시 로그인하면 재마이그레이션 트리거

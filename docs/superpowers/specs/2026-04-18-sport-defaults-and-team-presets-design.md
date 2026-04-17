# SPORT_DEFAULTS 분리 + 팀 프리셋 오버라이드 설계

**작성일:** 2026-04-18
**상태:** 설계 승인 대기 → 승인 후 implementation plan 착수

## 배경

현재 `src/config/settings.js`의 `DEFAULTS` 단일 객체에 다음이 모두 섞여 있다:

- 종목 무관 항목 (sheetId, 참석명단 시트 등)
- 풋살 전용 (`crovaPoint`, `gogumaPoint`, `bonusMultiplier`, `dualTeams`)
- 축구 전용 (`eventLogSheet`, `cleanSheetPoint`, `opponents`)
- **마스터FC 전용 커스텀값** (`ownGoalPoint: -2`, `crovaPoint: 2`, ...)

즉 "풋살의 표준"처럼 보이는 값이 실제로는 마스터FC만의 커스텀이다. 다른 풋살팀이 추가되면 기본값부터 왜곡된 상태에서 시작한다.

또한 스코어링 폴백이 불일치한다:
- `settings.js:25` → `ownGoalPoint: -2`
- `soccerScoring.js:119` → `?? -1`
- `SettingsScreen.jsx:118` → `defaultVal={-1}` 하드코딩
- `TournamentMatchManager.jsx:141` → `?? -1`

`HistoryView.jsx:112`는 아예 `-2`를 하드코딩하여 팀 설정을 무시한다.

## 목표

1. 종목의 **표준 규칙**과 팀의 **커스텀 규칙**을 명시적으로 분리
2. 팀 설정을 **프리셋 참조 + sparse 오버라이드** 구조로 저장 (Live-link 머지)
3. 한 팀이 여러 종목을 가질 수 있도록 종목별 네임스페이스 분리
4. "크로바/고구마 같은 팀 고유 규칙"의 **사용 여부 자체**를 토글로 관리 (값 0 트릭 금지)
5. 기존 마스터FC 동작을 1:1 유지한 채 마이그레이션 (점수 계산 결과 불변)
6. 신규 팀 온보딩 시 "프리셋 선택" UX 제공 → 개발자 개입 없이 새 팀 추가 가능

## 설계 결정 요약

| 결정 항목 | 선택 | 대안과의 차이 |
|---|---|---|
| 범위 | C: 데이터 구조 + UI 개편 + 프리셋 시스템 | 스토리지 prefix 정리(`masterfc_*`)는 별 Phase |
| 프리셋 의미 | Live-link (런타임 머지) | 초기값 템플릿(one-shot), 하이브리드 제외 |
| 종목×팀 관계 | 중첩 객체 구조 (`settings/{team} = { shared, 풋살, 축구 }`) | 경로 분리·단일 플랫 제외 |
| 프리셋 라인업 | 코드 built-in: `표준풋살`, `마스터FC풋살`, `표준축구` | 사용자 정의 커스텀 프리셋 생성 UI는 별 Phase |
| 크로바/고구마 on/off | 명시 토글 `useCrovaGoguma: boolean` | 값 0 트릭·규칙 모듈 제외 |
| 마이그레이션 | 자동 인플레이스 (로드 시 자동 변환 + 백업) | 수동 스크립트·읽기 전용 호환 제외 |
| 설정 스냅샷 | 경기 시작 시 `gameState.settingsSnapshot` 캡처 | 경기 중 설정 변경 시 진행 중 경기 영향 없음 |

---

## 1. 데이터 구조

### 1.1 코드 내장 상수 (`src/config/settings.js`)

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
```

### 1.2 Firebase 저장 구조 (팀별)

```js
settings/{team} = {
  shared: {
    sheetId, attendanceSheet, dashboardSheet,
    pointLogSheet, playerLogSheet,
  },
  풋살: {
    preset: "마스터FC풋살",
    overrides: {
      dualTeams: [...], dualTeamStartDate, dualTeamEndDate,
    },
  },
  축구: {
    preset: "표준축구",
    overrides: {
      opponents: ["팀A", "팀B"],
      eventLogSheet: "마스터FC 이벤트로그",
    },
  },
}
```

**키 네임스페이스 분류:**
- `shared` (종목 무관): `sheetId`, `attendanceSheet`, `dashboardSheet`, `pointLogSheet`, `playerLogSheet`
- `풋살` 전용: `ownGoalPoint`, `useCrovaGoguma`, `crovaPoint`, `gogumaPoint`, `bonusMultiplier`, `dualTeams`, `dualTeamStartDate`, `dualTeamEndDate`
- `축구` 전용: `ownGoalPoint`, `cleanSheetPoint`, `opponents`, `eventLogSheet`

부연:
- `{sport}.preset`: `PRESETS[sport]`의 키 이름 (string)
- `{sport}.overrides`: 프리셋과 **다른** 값만 sparse 저장
- 특정 종목 키가 없으면 해당 팀이 그 종목을 하지 않음을 의미 (`teamEntries`로 판단)
- `ownGoalPoint`는 양 종목에 존재하는 이름이지만 네임스페이스가 분리되어 독립적으로 오버라이드 가능

### 1.3 런타임 머지 (`getEffectiveSettings`)

```js
function getEffectiveSettings(team, sport) {
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

**머지 우선순위 (낮음 → 높음):**
`종목 표준` < `프리셋` < `팀 오버라이드` < `팀 공용(shared)`

`shared`가 최상위인 이유: 시트 ID·상대팀 같은 팀 고유 데이터는 룰과 독립이므로 오버라이드보다도 팀별 값으로 확정.

`_meta`는 설정 UI의 "값 출처 뱃지" 표시에 사용.

---

## 2. 설정 화면 UI

### 2.1 프리셋 선택 영역 (신규 추가, 경기규칙 섹션 최상단)

```
경기규칙 프리셋
  [마스터FC풋살 ▼]
    · 표준풋살
    · 마스터FC풋살 (현재)
  ℹ️ 마스터FC 커스텀 (자살골 2배, 크로바/고구마)
```

현재 `teamMode` 종목의 프리셋 목록만 표시. 설명은 `PRESETS[sport][preset].description`에서 로드.

### 2.2 개별 설정 항목 — 출처 뱃지

```
자살골 포인트  [-2]  🟡오버라이드  (표준: -1)  [초기화]
크로바(1위팀)  [ 2]  🔵프리셋       (표준: 0)
클린시트 포인트[ 1]  ⚪표준
```

- 🔵 **프리셋**: 프리셋 값 그대로
- 🟡 **오버라이드**: 팀이 프리셋과 다르게 덮어쓴 값 → 옆 `[초기화]`로 프리셋 값 복원
- ⚪ **표준**: SPORT_DEFAULTS 값 (프리셋·오버라이드 없음)

### 2.3 크로바/고구마 토글

```
☑ 크로바/고구마 사용  🟡오버라이드  (표준: 꺼짐)
  ├─ 크로바 점수: [ 2]  🔵프리셋
  ├─ 고구마 점수: [-1]  🔵프리셋
  └─ 황금/탄 배수: [ 2]배  🔵프리셋
```

`useCrovaGoguma === false` 시 하위 3개 필드 숨김, 대시보드 칼럼 숨김, 점수 계산 skip, 시트 전송 값 0 고정.

### 2.4 프리셋 변경 확인 모달

사용자가 드롭다운으로 프리셋을 바꾸면, effective 값이 실제로 변하는 항목을 미리 보여줌:

```
프리셋 변경 확인
  "마스터FC풋살" → "표준풋살"

  다음 값이 바뀝니다:
    · 자살골 포인트:      -2  →  -1
    · 크로바/고구마 사용:  켜짐 →  꺼짐

  이 팀이 덮어쓴 값(2개)이 있습니다 — 유지하시겠습니까?
    · crovaPoint = 3 (오버라이드)
    · ownGoalPoint = -5 (오버라이드)

  [오버라이드 유지]  → 프리셋만 교체, 팀 오버라이드는 유지 (위 2개 살아남음)
  [전부 초기화]      → 오버라이드 제거, 새 프리셋 값으로 깨끗이 시작
  [취소]
```

**동작 규칙:**
- 상단 "다음 값이 바뀝니다": 구 effective vs 신 effective 비교 (프리셋 교체로 인한 변화분만)
- 하단 "덮어쓴 값": 팀의 `overrides` 객체가 비어있지 않을 때만 표시
- `overrides`가 빈 상태라면 하단 섹션 생략 후 단순 "변경하시겠습니까? [확인/취소]"로 단순화
- 기본 강조: 일반 사용자는 "전부 초기화" (깨끗한 프리셋 전환), 파워 유저는 "오버라이드 유지"
- "오버라이드 유지" 선택 시: `preset` 필드만 교체, `overrides`는 그대로 보존
- "전부 초기화" 선택 시: `preset` 교체 + `overrides: {}`

### 2.5 저장 로직

`saveSettings(team, sport, newValues)`:

1. `newValues`의 각 필드에 대해 `SPORT_DEFAULTS` + `PRESETS[sport][preset]`와 비교
2. 다른 값만 `{sport}.overrides`에 기록
3. 같은 값은 제거 (sparse)
4. `shared` 필드는 종목 무관이라 별도 저장

---

## 3. 스코어링 & 계산 로직 통합

### 3.1 단일 진입점

**새 규칙: 모든 스코어링 함수는 `effectiveSettings`만 받는다. 내부 폴백 금지.**

### 3.2 수정 대상

| 파일:라인 | 현재 | 변경 후 |
|---|---|---|
| `soccerScoring.js:119` | `settings?.ownGoalPoint ?? -1` | `settings.ownGoalPoint` |
| `soccerScoring.js:120` | `settings?.cleanSheetPoint ?? 1` | `settings.cleanSheetPoint` |
| `TournamentMatchManager.jsx:141` | `?? -1`, `?? 1` 폴백 | `effectiveSettings.ownGoalPoint`, `effectiveSettings.cleanSheetPoint` |
| `HistoryView.jsx:112` | `calcPlayerStats(..., -2)` | `calcPlayerStats(..., effectiveSettings.ownGoalPoint)` — 프롭으로 주입 |
| `SettingsScreen.jsx:118` | `defaultVal={-1}` | `defaultVal={SPORT_DEFAULTS.축구.ownGoalPoint}` |
| `App.jsx:325-337` | `useCrovaGoguma` 미고려 | `if (!useCrovaGoguma) skip` |
| `App.jsx:1051-1052` | 대시보드 크로바/고구마 칼럼 | `useCrovaGoguma === false`면 칼럼 숨김 |
| `PlayerStatsModal.jsx:11` | `showBonus` prop | caller가 `effectiveSettings.useCrovaGoguma`로 전달 |
| `TeamDashboard.jsx:435` | `activeSport !== "축구"` | `effectiveSettings.useCrovaGoguma` |

### 3.3 설정 로드 시점

- `Root.jsx` 팀 선택/복귀 시: `await loadSettingsFromFirebase(teamName)` — shared + 모든 종목 한 번에 캐시
- 각 앱: `getEffectiveSettings(team, sport)`로 자기 종목 설정 조회

### 3.4 `getDefaults()` 제거

기존 `getDefaults()`는 팀 커스텀값을 "기본값"으로 노출하는 원인. **제거하고 다음으로 대체:**

```js
export function getSportDefault(sport, key)
export function getPresetValue(sport, preset, key)
export function getSourceOf(team, sport, key) // "shared" | "override" | "preset" | "default"
```

`getSourceOf`는 2.2의 출처 뱃지(🟡/🔵/⚪)에 사용.

### 3.5 경기 중 설정 스냅샷

**원칙:** 경기 시작 시점의 `effectiveSettings`를 `gameState.settingsSnapshot`으로 저장하여 경기 도중 설정 변경의 영향을 받지 않게 한다.

- 현재도 암묵적으로 `gameSettings` useState로 스냅샷 동작 중
- 명시적으로 state에 저장하여 Firebase 동기화·기록확정 시 일관성 보장
- `RESTORE_STATE` 시 `settingsSnapshot`이 있으면 그 값을 사용, 없으면 (legacy 저장) 현재 effective 사용

---

## 4. 마이그레이션 전략

### 4.1 변환 규칙 (legacy flat → nested)

**키 분류:** (섹션 1.2 네임스페이스 규칙과 동일)
- `shared`: `sheetId`, `attendanceSheet`, `dashboardSheet`, `pointLogSheet`, `playerLogSheet`
- `풋살`: `ownGoalPoint`, `crovaPoint`, `gogumaPoint`, `bonusMultiplier`, `useCrovaGoguma`, `dualTeams`, `dualTeamStartDate`, `dualTeamEndDate`
- `축구`: `ownGoalPoint`, `cleanSheetPoint`, `opponents`, `eventLogSheet`

**프리셋 자동 매핑 (하드코딩):**
```js
const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  _default: { 풋살: "표준풋살", 축구: "표준축구" },
};
```

**축구 섹션 생성 조건:** 팀의 `teamEntries`에 `mode: "축구"`가 있을 때만.

### 4.2 실행 시점 — 자동 인플레이스

```js
// 시그니처 변경: teamEntries를 받아 축구/풋살 섹션 생성 여부 결정
export async function loadSettingsFromFirebase(team, teamEntries) {
  const raw = (await get(ref)).val();

  if (isLegacyFormat(raw)) {
    await set(ref(firebaseDb, `settings_legacy_backup/${team}`), {
      ...raw,
      _migratedAt: Date.now(),
    });
    const migrated = migrateToNested(team, raw, teamEntries);
    await set(ref, migrated);
    _cache[team] = migrated;
    return migrated;
  }

  _cache[team] = raw;
  return raw;
}

function isLegacyFormat(raw) {
  if (!raw) return false;
  return !raw.shared && !raw.풋살 && !raw.축구;
}
```

**호출부 변경:**
- `Root.jsx:51` `loadSettingsFromFirebase(selectedTeamName)` → `loadSettingsFromFirebase(selectedTeamName, selectedTeamEntries)`
- `Root.jsx:99` `loadSettingsFromFirebase(teamName)` → `loadSettingsFromFirebase(teamName, entries)`
- 두 호출 시점 모두 `selectedTeamEntries` 또는 `entries`가 이미 set 상태라 안전

### 4.3 안전 장치

1. **백업 먼저**: `settings_legacy_backup/{team}` 경로에 원본 보존
2. **멱등성**: `isLegacyFormat`이 new 구조에 false → 반복 호출해도 재변환 없음
3. **실패 시 fallback**: 변환 중 예외 → `console.warn` + 원본 raw를 그대로 캐시 → 앱은 동작, 다음 로드 재시도
4. **로그**: `console.info("마이그레이션 완료:", team)`

### 4.4 localStorage 캐시 마이그레이션

`masterfc_settings_{team}` 캐시도 legacy 구조일 수 있음. 같은 `isLegacyFormat` 검사로 캐시 무효화 후 Firebase 재조회.

### 4.5 롤아웃

1. 배포 직후 첫 로그인 사용자가 마이그레이션 유발 → Firebase 덮어씀
2. 이후 사용자는 new 구조 읽음
3. 문제 발생 시 `settings_legacy_backup/`에서 수동 복구

팀 수 현재 1개(마스터FC) → 리스크 낮음. 신규 팀 추가 전 완료 필수.

---

## 5. 구글시트 반영 (Apps Script 불변)

### 5.1 원칙

Apps Script는 수동 배포이므로 **클라이언트에서만 값 계산**. Apps Script 코드·스프레드시트 컬럼 구조는 변경 없음.

### 5.2 기록 전송 값 계산

```js
// App.jsx:560-562 예시
const ES = gameState.settingsSnapshot;
{ gameDate, name, ...pts,
  owngoals: pts.owngoals * ES.ownGoalPoint, ... }
```

- 마스터FC: `ES.ownGoalPoint = -2` → 기존과 동일
- 신규 표준 풋살팀: `ES.ownGoalPoint = -1`

### 5.3 크로바/고구마 비활성 팀 전송 정책

```js
if (!ES.useCrovaGoguma) {
  pts.crova = 0;
  pts.goguma = 0;
}
```

시트 컬럼 구조 유지 (0 전송). `parseNum(빈칸)=0`과 호환.

### 5.4 `getCumulativeBonus` 호출 가드

```js
if (ES.useCrovaGoguma) {
  AppSync.getCumulativeBonus(...).catch(...);
} else {
  fields.seasonCrova = {};
  fields.seasonGoguma = {};
}
```

불필요한 Apps Script 호출 제거.

### 5.5 Apps Script 호환성

| 함수 | 변경 | 조치 |
|---|---|---|
| `appendPointLog` | 값만 (0 가능) | 없음 |
| `appendPlayerLog` | 동일 | 없음 |
| `appendEventLog` | 변경 없음 | 없음 |
| `getCumulativeBonus` | 마스터FC만 호출 | 클라이언트 가드 |
| `finalizeState` | 변경 없음 | 없음 |

**Apps Script 코드 수정 없음, 수동 반영 단계 불필요.**

---

## 6. 롤아웃 · 검증 · 엣지 케이스

### 6.1 수동 QA 체크리스트

**마스터FC 마이그레이션 후 (기존 동작 불변):**
- [ ] 경기 시작 → `settingsSnapshot.ownGoalPoint: -2`, `useCrovaGoguma: true`
- [ ] 자책골 이벤트 기록 → 상대팀 득점 +2
- [ ] 대시보드 크로바/고구마 칼럼 표시
- [ ] 기록확정 → 포인트로그에 `owngoals × -2`, 크로바/고구마 정상
- [ ] 황금크로바/탄고구마 조건 시 2배 반영

**신규 표준 풋살팀 (임시 테스트팀):**
- [ ] 프리셋 드롭다운에 "표준풋살" 선택 가능
- [ ] `useCrovaGoguma` 기본 OFF → 관련 필드·칼럼 숨김
- [ ] 기록확정 시 `owngoals × -1`, 크로바/고구마 컬럼 0 전송
- [ ] `getCumulativeBonus` Apps Script 호출 skip (네트워크 탭 확인)

**프리셋 변경 UX:**
- [ ] 전환 시 모달 정상 표시
- [ ] "오버라이드 유지" → overrides 보존
- [ ] "전부 초기화" → `overrides: {}`
- [ ] 출처 뱃지 정확 (🔵/🟡/⚪)

### 6.2 롤아웃 단계

1. **Phase A: 배포 + 마이그레이션**
   - 브랜치 구현 → main merge → GitHub Actions 자동 배포
   - 첫 접속 사용자가 자동 마이그레이션 유발
   - Firebase 콘솔에서 `settings_legacy_backup/마스터FC` 확인

2. **Phase B: 마스터FC smoke test (실제 경기 1회)**
   - 6.1 첫 번째 체크리스트
   - 포인트 계산·시트 기록 값이 이전과 1:1 일치

3. **Phase C: 신규 팀 온보딩 가능 선언**
   - 설정 화면 "프리셋 선택" UX 검증 후
   - 이 시점부터 다른 팀 초대 가능

### 6.3 롤백 계획

| 문제 | 복구 |
|---|---|
| 마이그레이션 실패 | `settings_legacy_backup/{team}` Firebase 콘솔에서 수동 복구 |
| 스코어링 버그 | 이전 커밋 revert → 자동 재배포 (수 분) |
| 특정 팀 데이터 손상 | 해당 팀만 backup에서 복구 |

### 6.4 엣지 케이스

1. **경기 진행 중 프리셋 변경** — `settingsSnapshot` 사용으로 진행 경기 불변, 다음 경기부터 반영
2. **진행 중 경기의 legacy settings** — `settingsSnapshot` 없으면 legacy 간주, 현재 effective로 override하지 않음
3. **존재하지 않는 프리셋 이름** — `PRESETS[sport][name]` 없으면 빈 객체 + `console.warn`, 설정 화면에 "알 수 없는 프리셋" 경고 + "표준으로 재설정" 버튼
4. **한 팀 두 종목** — `loadSettingsFromFirebase`가 shared + 양 종목 캐시, App/SoccerApp이 각자 effective 조회
5. **Firebase 읽기 실패** — localStorage 캐시 fallback, 캐시도 없으면 `{ shared: {}, 풋살: { preset: "표준풋살", overrides: {} } }` 기본

### 6.5 문서화

- `docs/PRESETS.md`: 프리셋 목록·의미·추가 방법
- `docs/TEAM_ONBOARDING.md`: 신규 팀 추가 절차

### 6.6 Out of Scope (별 Phase)

- localStorage prefix `masterfc_*` 정리
- `useGameReducer` 종목 분리
- `App.jsx` ↔ `SoccerApp.jsx` 중복 제거 (`useGameSession` 훅 추출)
- `fallbackData.js` 팀 독립화
- `HistoryView.jsx` 축구 모드 렌더 신규 추가 (이번에는 `ownGoalPoint` 하드코딩 제거만)
- 사용자 정의 커스텀 프리셋 생성 UI
- `calcMatchScore`의 `owngoal ? 2 : 1` (자살골 득실 규칙) — 현재 하드코딩 유지, 팀별 커스터마이즈 불요

---

## 변경 영향 요약

**신규 파일 0개 (예상)** — 모두 기존 파일 수정
**수정 파일:**
- `src/config/settings.js` (SPORT_DEFAULTS, PRESETS, getEffectiveSettings, migrate, isLegacyFormat, getSourceOf, getSportDefault)
- `src/components/common/SettingsScreen.jsx` (프리셋 선택 + 출처 뱃지 + 토글 + 변경 모달)
- `src/utils/soccerScoring.js` (폴백 제거)
- `src/components/tournament/TournamentMatchManager.jsx` (폴백 제거)
- `src/components/history/HistoryView.jsx` (하드코딩 -2 제거, effectiveSettings prop)
- `src/App.jsx` (useCrovaGoguma 가드, settingsSnapshot 캡처, getCumulativeBonus 가드, 대시보드 칼럼 숨김)
- `src/SoccerApp.jsx` (settingsSnapshot 캡처, getCumulativeBonus 가드)
- `src/components/dashboard/TeamDashboard.jsx` (useCrovaGoguma 기반 칼럼 제어)
- `src/components/game/PlayerStatsModal.jsx` (showBonus 주입원 변경)
- `src/hooks/useGameReducer.js` (settingsSnapshot state 필드 + RESTORE_STATE 처리)
- `src/Root.jsx` (loadSettingsFromFirebase로 양 종목 한 번에 로드)

**신규 문서:**
- `docs/PRESETS.md`
- `docs/TEAM_ONBOARDING.md`

# 프리셋 시스템

## 개요

팀별 경기규칙은 **4계층 머지**로 결정된다:
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

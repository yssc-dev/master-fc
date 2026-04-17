# 크로바/고구마 2구장 전용화 설계 문서

## 개요

풋살 모드의 크로바(1위팀 보너스)/고구마(꼴찌팀 감점) 점수를 **2구장 경기에서만** 부여하도록 제한한다. 1구장 경기(3팀 1코트, 또는 4~6팀 1코트)에서는 계산·UI 모두 비활성화한다.

### 배경
- 크로바/고구마는 "1위팀 vs 꼴찌팀" 보상 메커니즘으로, 경기 수가 충분한 2구장 편성에서만 의미 있는 차이를 만든다.
- 1구장 경기는 라운드 수가 적어 팀 순위가 우연에 크게 좌우되므로 이 보너스를 적용하면 왜곡이 커진다.
- 2026-04-16 경기(1구장)에서 무의미하게 크로바/고구마가 계산될 뻔한 사례가 계기.

### 범위
- 풋살 모드만 해당 (축구 모드는 이미 크로바/고구마 미사용).
- "밀어내기" 모드는 기존에도 제외되어 있음.

---

## 1. 계산 로직 — `src/App.jsx`

`calcPlayerPoints` (라인 322~339)의 조건에 `courtCount === 2`를 추가한다.

**현재:**
```js
if (matchMode !== "push" && (allRoundsComplete || earlyFinish) && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
```

**변경:**
```js
if (courtCount === 2 && matchMode !== "push" && (allRoundsComplete || earlyFinish) && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
```

### 부수 효과
- 1구장 경기에서는 `crova=0, goguma=0`으로 계산되어 시트에도 0으로 저장.
- 시즌 누적(`seasonCrova`, `seasonGoguma`)은 2구장 경기 기록으로만 쌓임 → 현재 누적 데이터에 영향 없음.
- useCallback deps에 `courtCount` 추가 필요.

---

## 2. 경기 중 통계 모달 — `src/components/game/PlayerStatsModal.jsx`

`courtCount` prop을 받아 🍀(크로바) / 🍠(고구마) 컬럼을 조건부 렌더링한다.

### 변경
- 호출부(App.jsx)에서 `courtCount={courtCount}` 전달.
- `cols`, `colKeys`를 고정 배열에서 조건부 구성으로 변경:
  ```js
  const showBonus = courtCount === 2;
  const cols = ["선수", "골", "어시", "자책", "클린",
                ...(showBonus ? ["🍀", "🍠"] : []),
                "키퍼", "실점", "합계"];
  ```
- `<td>` 렌더 시 `showBonus && (...)`로 감쌈.

---

## 3. 설정 화면 — `src/components/common/SettingsScreen.jsx`

크로바/고구마 설정 섹션(라인 124~126)에 "2구장 경기에서만 적용" 안내 문구 한 줄을 추가한다. **설정 값 자체는 유지** — 팀 전체 설정이고 사용자가 경기별로 courtCount를 바꿀 수 있기 때문.

### 변경
라인 126(`황금크로바/탄고구마`) 아래, 기존 `<details>` 바로 위에:
```jsx
<div style={{ fontSize: 10, color: C.grayDark, marginTop: -4, marginBottom: 8 }}>
  ※ 크로바/고구마 점수는 2구장 경기에서만 적용됩니다.
</div>
```

---

## 4. 유지 (변경 없음)

| 파일 | 이유 |
|------|------|
| `TeamDashboard.jsx` | 시즌 전체 누적 표시. 1구장 경기는 0으로 쌓이므로 자동 반영 |
| `PlayerAnalytics.jsx` | 과거 기록 기반 분석. 원시 데이터 0 → 분석 결과 자동 반영 |
| `sheetService.js` / `appSync.js` | 스키마/필드 구조 유지. 값만 0 |

---

## 5. 마이그레이션

- 과거 기록 중 **1구장에서 크로바/고구마가 부여된 경기**가 있다면 수동 정리 필요 여부는 사용자 판단. 이 스펙에서는 다루지 않음.
- 2026-04-16 진행 중 경기(1구장, R12까지 완료)는 아직 `allRoundsComplete=false`라서 크로바/고구마가 아직 계산되지 않았음. 이번 수정 배포 후 경기 종료 시 자연히 0 처리됨.

---

## 6. 테스트 시나리오

1. **3팀 1코트 경기**: 전 라운드 완료 → 크로바/고구마 모두 0, 통계 모달에 해당 컬럼 없음.
2. **4팀 2구장 경기**: 전 라운드 완료 → 크로바/고구마 정상 부여, 컬럼 표시.
3. **4팀 1구장 경기**: 전 라운드 완료 → 크로바/고구마 모두 0, 컬럼 없음.
4. **설정 화면**: 풋살 모드에서 크로바/고구마 입력란 아래 안내 문구 노출.
5. **시즌 누적**: 1구장 경기 종료 후에도 기존 시즌 누적 수치 변하지 않음(0 가산).

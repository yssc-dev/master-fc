# 크로바/고구마 2구장 전용화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 풋살 모드의 크로바(1위팀)/고구마(꼴찌팀) 점수를 2구장 경기에서만 계산·표시하도록 제한한다.

**Architecture:** 3개 파일의 소규모 조건 추가. `App.jsx`의 `calcPlayerPoints`에 `courtCount === 2` 가드 추가, `PlayerStatsModal`에 `courtCount` prop을 내려 컬럼 조건부 렌더, `SettingsScreen`에 안내 문구 한 줄 추가.

**Tech Stack:** React + Vite, Firebase Realtime DB(로직에 영향 없음), Google Sheets(저장 값은 기존대로 0 가산으로 자동 반영).

**Spec:** `docs/superpowers/specs/2026-04-17-crova-goguma-2courts-only-design.md`

---

## Task 1: 계산 로직에 `courtCount === 2` 가드 추가

**Files:**
- Modify: `src/App.jsx:322-339` (`calcPlayerPoints`)

- [ ] **Step 1: 현재 조건 확인**

Run:
```
grep -n 'matchMode !== "push" && (allRoundsComplete' src/App.jsx
```
Expected: 라인 328 매칭 1건.

- [ ] **Step 2: 조건 수정**

`src/App.jsx:328`을 아래와 같이 변경:

**Before:**
```jsx
    if (matchMode !== "push" && (allRoundsComplete || earlyFinish) && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
```

**After:**
```jsx
    if (courtCount === 2 && matchMode !== "push" && (allRoundsComplete || earlyFinish) && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
```

- [ ] **Step 3: useCallback deps에 `courtCount` 추가**

`src/App.jsx:339`의 deps 배열:

**Before:**
```jsx
  }, [playerMatchStats, finalStandings, completedMatches, getPlayerTeamName, getSeasonLeader, allRoundsComplete, earlyFinish, gameSettings]);
```

**After:**
```jsx
  }, [playerMatchStats, finalStandings, completedMatches, getPlayerTeamName, getSeasonLeader, allRoundsComplete, earlyFinish, gameSettings, courtCount]);
```

- [ ] **Step 4: 빌드 성공 확인**

Run: `npm run build`
Expected: `dist/` 생성, 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/App.jsx
git commit -m "fix: 크로바/고구마 점수 2구장 경기에서만 계산"
```

---

## Task 2: PlayerStatsModal에 courtCount prop 전달 및 컬럼 조건부 렌더

**Files:**
- Modify: `src/components/game/PlayerStatsModal.jsx` (전체)
- Modify: `src/App.jsx:872` (PlayerStatsModal 호출부)

- [ ] **Step 1: App.jsx에서 courtCount 전달**

`src/App.jsx:872` 수정:

**Before:**
```jsx
        {matchModal === "playerStats" && <PlayerStatsModal attendees={attendees} calcPlayerPoints={calcPlayerPoints} onClose={() => set('matchModal', null)} styles={s} />}
```

**After:**
```jsx
        {matchModal === "playerStats" && <PlayerStatsModal attendees={attendees} calcPlayerPoints={calcPlayerPoints} courtCount={courtCount} onClose={() => set('matchModal', null)} styles={s} />}
```

- [ ] **Step 2: PlayerStatsModal 시그니처/컬럼 정의 수정**

`src/components/game/PlayerStatsModal.jsx` 전체 교체:

```jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

export default function PlayerStatsModal({ attendees, calcPlayerPoints, courtCount, onClose, styles: s }) {
  const { C } = useTheme();
  const [sortKey, setSortKey] = useState("total");

  const showBonus = courtCount === 2;
  const cols = ["선수", "골", "어시", "자책", "클린", ...(showBonus ? ["🍀", "🍠"] : []), "키퍼", "실점", "합계"];
  const colKeys = ["name", "goals", "assists", "owngoals", "cleanSheets", ...(showBonus ? ["crova", "goguma"] : []), "keeperGames", "conceded", "total"];

  const rows = attendees.map(p => {
    const pts = calcPlayerPoints(p);
    return { name: p, ...pts };
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
    const diff = (b[sortKey] || 0) - (a[sortKey] || 0);
    if (diff !== 0) return diff;
    const goalDiff = (b.goals || 0) - (a.goals || 0);
    if (goalDiff !== 0) return goalDiff;
    return (b.assists || 0) - (a.assists || 0);
  });

  return (
    <Modal onClose={onClose} title="오늘의 선수기록" maxWidth={500}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
          <thead><tr>{cols.map((h, ci) => <th key={h} style={{ ...s.th, cursor: "pointer", color: sortKey === colKeys[ci] ? C.accent : C.gray }} onClick={(e) => { e.stopPropagation(); setSortKey(colKeys[ci]); }}>{h}{sortKey === colKeys[ci] ? " ▼" : ""}</th>)}</tr></thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.name}>
                <td style={s.td(true)}>{p.name}</td>
                <td style={s.td(p.goals > 0)}>{p.goals}</td>
                <td style={s.td(p.assists > 0)}>{p.assists}</td>
                <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals > 0 ? `-${p.owngoals * 2}` : 0}</td>
                <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                {showBonus && <td style={{ ...s.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>}
                {showBonus && <td style={{ ...s.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>}
                <td style={s.td(p.keeperGames > 0)}>{p.keeperGames}</td>
                <td style={s.td(p.conceded > 0)}>{p.conceded}</td>
                <td style={{ ...s.td(true), fontSize: 13, fontWeight: 800, color: p.total > 0 ? C.green : p.total < 0 ? C.red : C.white }}>{p.total > 0 ? `+${p.total}` : p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: 빌드 성공 확인**

Run: `npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/App.jsx src/components/game/PlayerStatsModal.jsx
git commit -m "feat: 1구장 경기 통계 모달에서 크로바/고구마 컬럼 숨김"
```

---

## Task 3: SettingsScreen에 안내 문구 추가

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx:126-127` (풋살 경기규칙 섹션)

- [ ] **Step 1: `<details>` 앞에 안내 문구 삽입**

`src/components/common/SettingsScreen.jsx` 126번 라인 뒤(`<details ...>` 바로 위)에 아래 요소 추가:

**Before (라인 126~127):**
```jsx
            <NumRow label="황금크로바/탄고구마" value={settings.bonusMultiplier} onChange={v => update("bonusMultiplier", v)} defaultVal={defaults.bonusMultiplier} suffix="배" />
            <details style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
```

**After:**
```jsx
            <NumRow label="황금크로바/탄고구마" value={settings.bonusMultiplier} onChange={v => update("bonusMultiplier", v)} defaultVal={defaults.bonusMultiplier} suffix="배" />
            <div style={{ fontSize: 10, color: C.grayDark, marginBottom: 8 }}>※ 크로바/고구마 점수는 2구장 경기에서만 적용됩니다.</div>
            <details style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
```

- [ ] **Step 2: 빌드 성공 확인**

Run: `npm run build`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/components/common/SettingsScreen.jsx
git commit -m "docs: 설정 화면에 크로바/고구마 2구장 적용 안내 추가"
```

---

## Task 4: 수동 검증 (브라우저)

**Files:**
- None (verification only)

- [ ] **Step 1: 개발 서버 기동**

Run: `npm run dev`
Expected: `Local: http://localhost:5173` 출력.

- [ ] **Step 2: 1구장 경기 시나리오 검증**

브라우저에서:
1. 팀 선택 후 **3팀 1코트** 또는 **4팀 1코트**로 새 경기 시작
2. 대진표 진행하여 전 라운드 완료
3. "오늘의 선수기록" 모달 열기

Expected:
- 모달 헤더에 `🍀`, `🍠` 컬럼이 **없음** (8개 컬럼만 표시: 선수/골/어시/자책/클린/키퍼/실점/합계)
- 선수별 `total` 점수에 크로바/고구마 보너스가 포함되지 않음

- [ ] **Step 3: 2구장 경기 시나리오 검증**

1. **4팀 2코트** 또는 **5팀 2코트**로 새 경기 시작
2. 전 라운드 완료
3. "오늘의 선수기록" 모달 열기

Expected:
- `🍀`, `🍠` 컬럼이 **표시됨** (10개 컬럼)
- 1위팀 선수는 `🍀` 컬럼에 +값, 꼴찌팀 선수는 `🍠` 컬럼에 -값

- [ ] **Step 4: 설정 화면 검증**

1. 풋살 팀 선택 → 설정
2. "경기규칙 설정" 섹션 확인

Expected:
- "황금크로바/탄고구마" 행 아래에 "※ 크로바/고구마 점수는 2구장 경기에서만 적용됩니다." 회색 작은 글씨로 표시됨
- 축구 팀 설정 화면에는 해당 문구가 나타나지 않음 (축구 모드엔 크로바/고구마 자체가 없으므로)

- [ ] **Step 5: 이어하기 검증 (기존 경기)**

어제 1구장 경기(마스터FC, gameId `g_1776338137903`)를 "이어하기"로 열기 → 전 라운드 완료까지 진행 → 통계 모달 확인.

Expected: 🍀🍠 컬럼 없음, 합계에 크로바/고구마 누락 없음(0).

- [ ] **Step 6: 최종 git status 확인**

Run: `git status`
Expected: clean (모든 변경 커밋 완료).

---

## 완료 기준

- [x] `App.jsx`에서 `courtCount === 2` 가드가 `calcPlayerPoints`에 적용됨
- [x] `PlayerStatsModal`이 `courtCount` prop을 받아 컬럼을 조건부 렌더
- [x] `SettingsScreen` 풋살 경기규칙 섹션에 안내 문구 표시
- [x] 빌드 성공 및 수동 검증 4가지 시나리오 모두 통과
- [x] 3개 커밋이 main 브랜치에 기록됨

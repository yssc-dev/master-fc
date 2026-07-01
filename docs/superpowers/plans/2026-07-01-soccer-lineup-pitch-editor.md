# 축구 라인업 피치 편집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `🔁 라인업 변경`을 버튼 리스트 모달(`LineupCorrectionModal`) 대신 포메이션 피치 편집기로 바꿔, 피치에서 출전끼리 자리 교대 / 출전↔미출전 정정을 직접 하게 한다.

**Architecture:** 피치 렌더 `FormationPitch` + 순수 헬퍼 `swapFormationSlots`를 재사용해 신규 `LineupEditView`(편집 UI)를 만든다. 두 편집은 리듀서 op 하나에 1:1 매핑 — 자리 교대=신규 `SWAP_SOCCER_LINEUP_POSITIONS`, 후보 정정=기존 `CORRECT_SOCCER_LINEUP` 재사용. 역할 변경 시 `defenders`를 `positionMap`에서 재계산하는 단일 헬퍼를 도입해 신규 SWAP·라이브 `handleSwap` 양쪽에 적용.

**Tech Stack:** React 18(uncontrolled FormationRecorder), Vite, Vitest + jsdom, `react-dom/server` SSR 스모크(RTL 없음), Firebase RTDB 자식노드 diff 동기화.

**스펙:** `docs/superpowers/specs/2026-07-01-soccer-lineup-pitch-editor-design.md`

## Global Constraints

- **경기 독립성:** 리듀서 op는 **논리 matchIdx**(`m.matchIdx === matchIdx`)로 매칭 — 타 경기 events/lineup/score 무변경.
- **로그 정합:** 골 이벤트 dedupe 금지. GK 집계(keeperGames/클린시트) 정합 — 매치 총실점 0이면 뛴 GK 전원, 1점이라도 있으면 전원 제외. `gkChange`는 집계 배경 전용(타임라인/시트 미표시).
- **defenders 정합:** `getCleanSheetPlayers`가 `match.defenders`를 직접 사용(soccerScoring.js:92) — 역할이 바뀌는 연산 뒤 반드시 재계산.
- **풋살 무영향:** 모든 변경은 축구 전용 경로.
- **기존 테스트 전량 통과**(현재 477). 커밋은 태스크 끝에서.
- **레거시 경기**(`formation/assignments/positionMap` null)는 편집기 진입 시 modern 승격 후 편집(SWAP no-op 방지).

---

### Task 1: `defendersFromPositionMap` 헬퍼

**Files:**
- Modify: `src/utils/formations.js` (파일 끝에 export 함수 추가)
- Test: `src/utils/__tests__/formations.defenders.test.js` (신규)

**Interfaces:**
- Produces: `defendersFromPositionMap(positionMap: Record<name,role>): string[]` — role이 `"DF"`인 이름 배열. null/빈 입력 → `[]`.

- [ ] **Step 1: 실패 테스트 작성**

`src/utils/__tests__/formations.defenders.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { defendersFromPositionMap } from '../formations';

describe('defendersFromPositionMap', () => {
  it('DF role인 선수만 추출', () => {
    expect(defendersFromPositionMap({ GK1: 'GK', D1: 'DF', D2: 'DF', M1: 'MF' }).sort())
      .toEqual(['D1', 'D2']);
  });
  it('null/빈 입력 → 빈 배열', () => {
    expect(defendersFromPositionMap(null)).toEqual([]);
    expect(defendersFromPositionMap({})).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/formations.defenders.test.js`
Expected: FAIL — `defendersFromPositionMap is not a function` / not exported.

- [ ] **Step 3: 헬퍼 구현**

`src/utils/formations.js` 파일 끝에 추가:
```js
// positionMap(name→role)에서 DF인 선수 목록. 위치교대/정정 등 role이 바뀌는 연산 뒤
// match.defenders 재계산의 단일 소스(getCleanSheetPlayers가 defenders를 직접 사용).
export function defendersFromPositionMap(positionMap) {
  return Object.entries(positionMap || {}).filter(([, r]) => r === "DF").map(([n]) => n);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/formations.defenders.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/formations.js src/utils/__tests__/formations.defenders.test.js
git commit -m "feat(soccer): defendersFromPositionMap 헬퍼 — role→defenders 단일 소스"
```

---

### Task 2: `SWAP_SOCCER_LINEUP_POSITIONS` 리듀서

**Files:**
- Modify: `src/hooks/useGameReducer.js` (상단 import 추가 + `CORRECT_SOCCER_LINEUP` case 뒤에 신규 case)
- Test: `src/hooks/__tests__/useGameReducer.swapLineup.test.js` (신규)

**Interfaces:**
- Consumes: `swapFormationSlots`, `defendersFromPositionMap`(Task 1), `FORMATIONS` (formations.js); `generateEventId` (idGenerator.js).
- Produces: 액션 `{ type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx, aIdx, bIdx }` → 해당 경기의 두 슬롯 위치 교대, `defenders` 재계산, GK 변경 시 `gkChange` 이벤트 1건 추가.

- [ ] **Step 1: 실패 테스트 작성**

`src/hooks/__tests__/useGameReducer.swapLineup.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const withState = (o) => ({ ...initialState, ...o });

// 4-4-2 슬롯: idx0=GK, 1-4=DF, 5-8=MF, 9-10=FW
const base = () => withState({ soccerMatches: [
  { matchIdx: 0, opponent: 'X', status: 'finished', formation: '4-4-2',
    lineup: ['GK1','D1','D2','D3','D4','M1','M2','M3','M4','F1','F2'],
    defenders: ['D1','D2','D3','D4'], gk: 'GK1',
    assignments: { 0:'GK1',1:'D1',2:'D2',3:'D3',4:'D4',5:'M1',6:'M2',7:'M3',8:'M4',9:'F1',10:'F2' },
    positionMap: { GK1:'GK',D1:'DF',D2:'DF',D3:'DF',D4:'DF',M1:'MF',M2:'MF',M3:'MF',M4:'MF',F1:'FW',F2:'FW' },
    subs: ['BN1'], events: [] },
  { matchIdx: 1, opponent: 'Y', status: 'finished', formation: '4-4-2',
    lineup: ['P1'], defenders: [], gk: '', assignments: {0:'P1'}, positionMap: {P1:'FW'}, subs: [], events: [] },
] });

describe('gameReducer — SWAP_SOCCER_LINEUP_POSITIONS', () => {
  it('두 필드 슬롯 위치 교대(assignments/positionMap 반영)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 5 });
    const m = next.soccerMatches[0];
    expect(m.assignments[1]).toBe('M1');
    expect(m.assignments[5]).toBe('D1');
    expect(m.positionMap['M1']).toBe('DF');
    expect(m.positionMap['D1']).toBe('MF');
  });
  it('DF↔MF 교대 시 defenders 재계산(D1 빠지고 M1 추가)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 5 });
    expect(next.soccerMatches[0].defenders.sort()).toEqual(['D2','D3','D4','M1'].sort());
  });
  it('GK 슬롯 교대 시 gk 갱신 + gkChange 1건', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 0, bIdx: 1 });
    const m = next.soccerMatches[0];
    expect(m.gk).toBe('D1');
    const gkc = m.events.filter(e => e.type === 'gkChange');
    expect(gkc).toHaveLength(1);
    expect(gkc[0].playerOut).toBe('GK1');
    expect(gkc[0].playerIn).toBe('D1');
  });
  it('非GK 교대 → gkChange 미추가(events 불변)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 2 });
    expect(next.soccerMatches[0].events).toHaveLength(0);
  });
  it('타 경기 무변경(격리)', () => {
    const s = base();
    const next = gameReducer(s, { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 5 });
    expect(next.soccerMatches[1]).toEqual(s.soccerMatches[1]);
  });
  it('동일 슬롯(aIdx===bIdx) → 안전(무변경)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 3, bIdx: 3 });
    expect(next.soccerMatches[0].assignments[3]).toBe('D3');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.swapLineup.test.js`
Expected: FAIL — 액션 미처리(default), assignments 무변경으로 assertion 실패.

- [ ] **Step 3: import 추가**

`src/hooks/useGameReducer.js` 상단 import 블록(현재 idGenerator/formations import 없음)에 추가:
```js
import { FORMATIONS, swapFormationSlots, defendersFromPositionMap } from '../utils/formations';
import { generateEventId } from '../utils/idGenerator';
```

- [ ] **Step 4: 리듀서 case 구현**

`src/hooks/useGameReducer.js`의 `case 'CORRECT_SOCCER_LINEUP': { ... }` 블록 **바로 뒤**에 추가:
```js
    // 위치 교대(라인업 변경 편집기): 두 출전 슬롯의 위치만 교대. 논리 matchIdx 매칭(격리).
    // role이 바뀌면 defenders 재계산(클린시트 정합), GK가 바뀌면 gkChange 배경 이벤트 추가
    // (라이브 handleSwap과 동일 — 무실점 경기 두 GK 집계). 전제: 편집기 진입 시 레거시는 승격됨.
    case 'SWAP_SOCCER_LINEUP_POSITIONS': {
      const { matchIdx, aIdx, bIdx } = action;
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx) return m;
        const positions = FORMATIONS[m.formation]?.positions;
        const res = swapFormationSlots(
          { assignments: m.assignments, positionMap: m.positionMap, gk: m.gk, positions },
          aIdx, bIdx
        );
        const defenders = defendersFromPositionMap(res.positionMap);
        const next = { ...m, assignments: res.assignments, positionMap: res.positionMap, gk: res.gk, defenders };
        if (res.gk !== m.gk) {
          next.events = [
            ...(m.events || []),
            { type: 'gkChange', playerOut: m.gk, playerIn: res.gk, id: generateEventId(), timestamp: Date.now() },
          ];
        }
        return next;
      });
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.swapLineup.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.swapLineup.test.js
git commit -m "feat(soccer): SWAP_SOCCER_LINEUP_POSITIONS 리듀서 — 위치교대+defenders재계산+gkChange"
```

---

### Task 3: `UPDATE_SOCCER_MATCH_FORMATION` 화이트리스트에 `defenders` 추가

**Files:**
- Modify: `src/hooks/useGameReducer.js:913` (화이트리스트 배열)
- Test: `src/hooks/__tests__/useGameReducer.updateFormation.test.js` (신규)

**Interfaces:**
- Produces: `UPDATE_SOCCER_MATCH_FORMATION`의 patch가 `defenders`를 포함하면 반영, 없으면 기존 유지(기존 호출부 무영향).

- [ ] **Step 1: 실패 테스트 작성**

`src/hooks/__tests__/useGameReducer.updateFormation.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
const withState = (o) => ({ ...initialState, ...o });

const base = () => withState({ soccerMatches: [
  { matchIdx: 0, opponent: 'X', status: 'playing', formation: '4-4-2',
    lineup: ['A','B'], defenders: ['A'], gk: '', assignments: {0:'A',1:'B'},
    positionMap: {A:'DF',B:'MF'}, subs: [], events: [] },
] });

describe('gameReducer — UPDATE_SOCCER_MATCH_FORMATION defenders 화이트리스트', () => {
  it('patch에 defenders 있으면 반영', () => {
    const next = gameReducer(base(), { type: 'UPDATE_SOCCER_MATCH_FORMATION', matchIdx: 0, patch: { defenders: ['B'] } });
    expect(next.soccerMatches[0].defenders).toEqual(['B']);
  });
  it('patch에 defenders 없으면 기존 유지(기존 호출부 무영향)', () => {
    const next = gameReducer(base(), { type: 'UPDATE_SOCCER_MATCH_FORMATION', matchIdx: 0, patch: { gk: 'A' } });
    expect(next.soccerMatches[0].defenders).toEqual(['A']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.updateFormation.test.js`
Expected: FAIL — 첫 테스트에서 `defenders`가 `['A']` 유지(화이트리스트에 없어 무시됨).

- [ ] **Step 3: 화이트리스트 수정**

`src/hooks/useGameReducer.js`의 `UPDATE_SOCCER_MATCH_FORMATION` case에서:
```js
      for (const k of ["formation", "assignments", "positionMap", "gk", "subs"]) {
```
를 아래로 변경(`"defenders"` 추가):
```js
      for (const k of ["formation", "assignments", "positionMap", "gk", "subs", "defenders"]) {
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.updateFormation.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.updateFormation.test.js
git commit -m "feat(soccer): UPDATE_SOCCER_MATCH_FORMATION defenders 화이트리스트(라이브 교대 정합 준비)"
```

---

### Task 4: 라이브 `handleSwap`이 `defenders` 재계산해 전파

**Files:**
- Modify: `src/components/game/FormationRecorder.jsx` (import 1줄 + `handleSwap`:135-154)
- Test: `src/components/game/__tests__/FormationRecorder.smoke.test.jsx` (신규 — 렌더 크래시 방지)

**Interfaces:**
- Consumes: `defendersFromPositionMap`(Task 1), `UPDATE_SOCCER_MATCH_FORMATION` defenders 화이트리스트(Task 3).

> **Note:** `handleSwap`의 payload는 uncontrolled 컴포넌트라 SSR로 직접 검증 불가 — defenders 계산 로직은 Task 1 헬퍼 테스트가 커버하고, 여기선 렌더 스모크 + 수동 QA로 확인.

- [ ] **Step 1: 실패(부재) 스모크 테스트 작성**

`src/components/game/__tests__/FormationRecorder.smoke.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationRecorder from '../FormationRecorder';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(FormationRecorder, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, positionMap: { GK1: 'GK', D1: 'DF' },
    subs: ['BN1'], gk: 'GK1', opponent: '상대', startedAt: 1, events: [],
    onAddEvent(){}, onDeleteEvent(){}, onFinishMatch(){}, onStateChange(){}, onFlowActiveChange(){}, ...props,
  })));

describe('FormationRecorder 렌더 스모크', () => {
  it('크래시 없이 렌더', () => {
    const html = render({});
    expect(html).toContain('D1');
    expect(html).not.toContain('NaN');
  });
});
```

- [ ] **Step 2: 실행(현재 통과해야 정상 — 기존 컴포넌트 렌더 확인)**

Run: `npx vitest run src/components/game/__tests__/FormationRecorder.smoke.test.jsx`
Expected: PASS (스모크는 회귀 가드용 — Step 4 수정 후에도 통과해야 함)

- [ ] **Step 3: `handleSwap` 수정**

`src/components/game/FormationRecorder.jsx` 상단 formations import에 `defendersFromPositionMap` 추가:
```js
import { FORMATIONS, FORMATION_KEYS, swapFormationSlots, defendersFromPositionMap } from '../../utils/formations';
```
`handleSwap`의 마지막 `onStateChange?.(...)` 줄을 아래로 변경(defenders 계산·전달 추가):
```js
    // formation도 함께 전송 — 교대는 이벤트가 없어, 레거시(formation 미저장) 매치면 remount 시
    // reconstructFormation이 이벤트 재생 경로로 빠져 교대가 유실된다. formation을 실어 매치를
    // '모던'으로 승격해 저장된 assignments/gk가 복원되게 한다.
    // defenders도 재계산해 전송 — DF↔MF/GK 교대로 role이 바뀌면 클린시트 정합 유지.
    const defenders = defendersFromPositionMap(res.positionMap);
    onStateChange?.({ formation, assignments: res.assignments, positionMap: res.positionMap, gk: res.gk, defenders });
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/game/__tests__/FormationRecorder.smoke.test.jsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/game/FormationRecorder.jsx src/components/game/__tests__/FormationRecorder.smoke.test.jsx
git commit -m "fix(soccer): 라이브 위치교대(handleSwap)가 defenders 재계산해 전파 — 클린시트 정합"
```

---

### Task 5: `SoccerApp` — 디스패처 + prop 배선

**Files:**
- Modify: `src/SoccerApp.jsx` (`correctSoccerLineup` 옆에 디스패처 추가 + SoccerMatchView props에 전달)

**Interfaces:**
- Consumes: `SWAP_SOCCER_LINEUP_POSITIONS`(Task 2).
- Produces: `SoccerMatchView`에 `onSwapLineupPositions(matchIdx, aIdx, bIdx)` prop 전달.

> **Note:** 순수 배선(기존 `correctSoccerLineup`과 동일 패턴, 전용 유닛테스트 없음). 검증: 빌드 + 전체 스위트 통과 + Task 7 통합.

- [ ] **Step 1: 디스패처 추가**

`src/SoccerApp.jsx`의 `correctSoccerLineup` 정의 바로 뒤에 추가:
```js
  const swapSoccerLineupPositions = (matchIdx, aIdx, bIdx) => {
    dispatch({ type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx, aIdx, bIdx });
  };
```

- [ ] **Step 2: prop 전달**

`src/SoccerApp.jsx`의 `<SoccerMatchView ...>` props에서:
```js
            onCorrectLineup={correctSoccerLineup}
```
바로 뒤에 추가:
```js
            onSwapLineupPositions={swapSoccerLineupPositions}
```

- [ ] **Step 3: 빌드/스위트 확인**

Run: `npx vitest run && npm run build`
Expected: 전체 통과 + 빌드 성공(아직 SoccerMatchView가 prop을 안 써도 무해).

- [ ] **Step 4: 커밋**

```bash
git add src/SoccerApp.jsx
git commit -m "feat(soccer): swapSoccerLineupPositions 디스패처 + onSwapLineupPositions 배선"
```

---

### Task 6: `LineupEditView` 컴포넌트(신규)

**Files:**
- Create: `src/components/game/LineupEditView.jsx`
- Test: `src/components/game/__tests__/LineupEditView.test.jsx` (신규 SSR 스모크)

**Interfaces:**
- Consumes: `FormationPitch`(기존, `onPlayerTap(idx,name)`/`highlightIdx`), `FORMATIONS`.
- Produces: `<LineupEditView formation assignments bench onSwapPositions onCorrect onBack title />`.
  - `onSwapPositions(aIdx, bIdx)` — 출전 A→출전 B 탭 시.
  - `onCorrect(outName, inName)` — 출전 A→미출전 C 탭 시(**confirm은 부모가 담당**).
  - 로컬 상태 `anchor = {idx,name}|null`.

- [ ] **Step 1: 실패(부재) 테스트 작성**

`src/components/game/__tests__/LineupEditView.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import LineupEditView from '../LineupEditView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(LineupEditView, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, bench: ['BN1'],
    onSwapPositions(){}, onCorrect(){}, onBack(){}, ...props,
  })));

describe('LineupEditView', () => {
  it('피치 배치 + 후보 칩 렌더, 크래시 없음', () => {
    const html = render({});
    expect(html).toContain('D1');
    expect(html).toContain('BN1');
    expect(html).not.toContain('NaN');
  });
  it('빈 bench도 안전', () => {
    expect(() => render({ bench: [] })).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/game/__tests__/LineupEditView.test.jsx`
Expected: FAIL — `LineupEditView` 모듈 없음.

- [ ] **Step 3: 컴포넌트 구현**

`src/components/game/LineupEditView.jsx`:
```jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS } from '../../utils/formations';
import FormationPitch from './FormationPitch';

// 라인업 편집기: 그 경기의 배치를 피치에서 직접 수정(라인업 변경).
//  - 출전 A 탭 → 출전 B 탭   = 위치 교대(onSwapPositions)
//  - 출전 A 탭 → 미출전 C 탭 = 정정(onCorrect; 기록 이관 confirm은 부모가 담당)
// 빈 슬롯(레드카드 등)은 탭 무시 — FormationPitch가 onEmptyTap을 안 받으면 라우팅 안 됨.
export default function LineupEditView({ formation, assignments = {}, bench = [], onSwapPositions, onCorrect, onBack, title }) {
  const { C } = useTheme();
  const [anchor, setAnchor] = useState(null); // 선택된 출전 슬롯 { idx, name }
  const positions = (FORMATIONS[formation] || FORMATIONS["4-4-2"]).positions;
  const sortedBench = [...bench].sort((a, b) => a.localeCompare(b, "ko"));

  const handlePlayerTap = (idx, name) => {
    if (!anchor) { setAnchor({ idx, name }); return; }
    if (anchor.idx === idx) { setAnchor(null); return; }   // 같은 선수 재탭 → 해제
    onSwapPositions?.(anchor.idx, idx);                     // 다른 출전 → 위치 교대
    setAnchor(null);
  };
  const handleBenchTap = (name) => {
    if (!anchor) return;                                    // 먼저 출전 선수 선택 필요
    onCorrect?.(anchor.name, name);                         // 정정(부모 confirm)
    setAnchor(null);
  };

  const benchHint = !anchor
    ? "바꿀 출전 선수를 먼저 탭하세요"
    : sortedBench.length === 0
      ? "미출전 선수 없음 — 자리 교대만 가능"
      : `${anchor.name} 자리에 넣을 미출전 선수를 탭 = 정정(기록 이관)`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 완료</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title || "라인업 편집"}</div>
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        출전끼리 탭 = <b style={{ color: C.white }}>자리 교대</b> · 출전→미출전 탭 = <b style={{ color: C.white }}>정정</b>
      </div>
      <FormationPitch positions={positions} assignments={assignments}
        onPlayerTap={handlePlayerTap} highlightIdx={anchor ? anchor.idx : undefined} />
      <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${C.grayDark}` }}>
        <div style={{ fontSize: 12, color: C.gray, fontWeight: 700, marginBottom: 8 }}>
          미출전 ({sortedBench.length}) — {benchHint}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {sortedBench.map(name => (
            <button key={name} onClick={() => handleBenchTap(name)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: anchor ? C.grayDarker : C.grayDark, color: anchor ? C.white : C.gray, opacity: anchor ? 1 : 0.6 }}>
              {name}
            </button>
          ))}
          {sortedBench.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>미출전 선수 없음</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/game/__tests__/LineupEditView.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/game/LineupEditView.jsx src/components/game/__tests__/LineupEditView.test.jsx
git commit -m "feat(soccer): LineupEditView — 피치 기반 라인업 편집기(자리교대/정정)"
```

---

### Task 7: `SoccerMatchView` 통합 + `LineupCorrectionModal` 폐기

**Files:**
- Modify: `src/components/game/SoccerMatchView.jsx`
- Delete: `src/components/game/LineupCorrectionModal.jsx`, `src/components/game/__tests__/LineupCorrectionModal.test.jsx`

**Interfaces:**
- Consumes: `LineupEditView`(Task 6), `onSwapLineupPositions`(Task 5), 기존 `onCorrectLineup`/`onUpdateMatchFormation`/`reconstructFormation`/`navLocked`/`defendersFromPositionMap`.

> **Note:** SoccerMatchView는 prop이 많아 SSR 유닛테스트가 비현실적 — 검증은 **전체 스위트 + 빌드 통과 + 수동 QA**. 편집기 FSM/네비 잠금/confirm은 수동 QA 항목.

- [ ] **Step 1: import 교체**

`src/components/game/SoccerMatchView.jsx`에서
```js
import LineupCorrectionModal from './LineupCorrectionModal';
```
를 삭제하고, `FormationSetup` import 근처에 추가:
```js
import LineupEditView from './LineupEditView';
```
(formations import 변경은 Step 7에서 다룸.)

- [ ] **Step 2: prop 시그니처 + 상태 교체**

props 구조분해에 `onSwapLineupPositions` 추가(`onCorrectLineup,` 뒤):
```js
  onSetMatchOpponent, onCorrectLineup, onSwapLineupPositions, gameFinalized,
```
상태에서 `lineupModalIdx` → `lineupEditIdx`로 변경하고 `correctionSeq` **제거**:
```js
  const [opponentModalIdx, setOpponentModalIdx] = useState(null); // 상대팀 변경 모달 대상 matchIdx
  const [lineupEditIdx, setLineupEditIdx] = useState(null);       // 라인업 편집기 대상 matchIdx
```
(기존 `const [lineupModalIdx, setLineupModalIdx] = useState(null);`와 `const [correctionSeq, setCorrectionSeq] = useState(0);` 두 줄을 위 한 줄로 대체.)

- [ ] **Step 3: `openLineupModal` → `openLineupEditor` (navLocked + 레거시 승격)**

기존:
```js
  const openLineupModal = () => {
    if (!node) return;
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n라인업을 정정하면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    setLineupModalIdx(node.matchIdx);
  };
```
를 아래로 교체:
```js
  const openLineupEditor = () => {
    if (!node) return;
    if (navLocked) return; // 득점 입력(goalFlow) 중엔 레코더 언마운트=골 유실 → 진입 차단
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n라인업을 바꾸면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    // 레거시 경기(formation 미저장)는 SWAP이 raw assignments(null)로 no-op 되므로 modern 승격 후 편집
    if (!(node.formation && node.assignments && node.positionMap)) {
      onUpdateMatchFormation?.(node.matchIdx, reconstructFormation(node));
    }
    setLineupEditIdx(node.matchIdx);
  };
```

- [ ] **Step 4: 라인업 변경 버튼 — 핸들러/disabled 교체**

`🔁 라인업 변경` 버튼:
```js
          <button onClick={openLineupModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🔁 라인업 변경
          </button>
```
를 아래로 교체(핸들러명 + `navLocked` disabled):
```js
          <button onClick={openLineupEditor} disabled={navLocked}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: navLocked ? C.gray : C.white, border: "none", cursor: navLocked ? "not-allowed" : "pointer", opacity: navLocked ? 0.5 : 1 }}>
            🔁 라인업 변경
          </button>
```

- [ ] **Step 5: 전체화면 편집기 조기 반환 추가**

`if (viewState === "editRoster") { ... }` 조기반환 블록 **바로 뒤**(메인 `return (<div>` 이전)에 추가:
```js
  // 라인업 편집기(전체화면) — formation/editRoster 서브플로우와 동일하게 조기 반환.
  if (lineupEditIdx !== null) {
    const m = soccerMatches.find(x => x.matchIdx === lineupEditIdx);
    if (!m) { setLineupEditIdx(null); return null; }
    const fm = reconstructFormation(m);
    const played = [...new Set([
      ...(m.lineup || []),
      ...(m.events || []).filter(e => e.type === "sub").map(e => e.playerIn),
    ])];
    const bench = (fm.subs || []).filter(n => !played.includes(n)); // 뛴(교체out) 선수 제외 — CORRECT 중복 방지
    return (
      <LineupEditView
        formation={fm.formation} assignments={fm.assignments} bench={bench}
        title={`제${m.matchIdx + 1}경기 vs ${m.opponent} — 라인업 편집`}
        onSwapPositions={(aIdx, bIdx) => onSwapLineupPositions?.(m.matchIdx, aIdx, bIdx)}
        onCorrect={(out, inn) => {
          // A(out)의 이관 대상 기록(goal에 등장/owngoal) 유무로 confirm 문구 분기
          const hasRecords = (m.events || []).some(e =>
            (e.type === "goal" && (e.player === out || e.assist === out)) ||
            (e.type === "owngoal" && e.player === out));
          const msg = hasRecords
            ? `${out} → ${inn} 정정: ${out}의 골·어시 기록이 ${inn}로 이관됩니다. 계속?`
            : `${out} → ${inn} 정정: ${out}를 미출전 처리하고 ${inn}를 출전으로 바꿉니다. 계속?`;
          if (!confirm(msg)) return;
          onCorrectLineup?.(m.matchIdx, out, inn);
        }}
        onBack={() => setLineupEditIdx(null)}
      />
    );
  }
```

- [ ] **Step 6: 라인업 변경 모달 렌더 제거 + FormationRecorder key 단순화**

메인 return 하단의 `{/* 라인업 변경(선발 정정) 모달 */}` 블록 전체(`{lineupModalIdx !== null && (() => { ... })()}`)를 **삭제**.
진행중 노드의 FormationRecorder key에서 `correctionSeq` 제거:
```js
            key={currentMatch.matchIdx + '-' + correctionSeq}
```
를
```js
            key={currentMatch.matchIdx}
```
로 변경.

- [ ] **Step 7: handleFormationConfirm의 인라인 defenders를 헬퍼로 치환(DRY)**

상단 formations import를 변경:
```js
import { FORMATIONS } from '../../utils/formations';
```
를
```js
import { FORMATIONS, defendersFromPositionMap } from '../../utils/formations';
```
로. `handleFormationConfirm` 내부:
```js
    const defenders = Object.entries(positionMap).filter(([, r]) => r === "DF").map(([n]) => n);
```
를
```js
    const defenders = defendersFromPositionMap(positionMap);
```
로 변경.

- [ ] **Step 8: `LineupCorrectionModal` 파일 삭제**

```bash
git rm src/components/game/LineupCorrectionModal.jsx src/components/game/__tests__/LineupCorrectionModal.test.jsx
```

- [ ] **Step 9: 전체 스위트 + 빌드 확인**

Run: `npx vitest run && npm run build`
Expected: 전체 통과(삭제한 모달 테스트 제외) + 빌드 성공. `LineupCorrectionModal` 참조 잔존 없음.
확인: `grep -rn "LineupCorrectionModal\|lineupModalIdx\|correctionSeq\|openLineupModal" src/` → 결과 없음.

- [ ] **Step 10: 커밋**

```bash
git add src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): 라인업 변경을 피치 편집기로 교체 — LineupCorrectionModal 폐기

navLocked 가드(goalFlow 골 유실 방지)+레거시 formation 승격+bench 미출전 필터
+정정 confirm 문구 분기+correctionSeq 제거+handleFormationConfirm DRY."
```

---

## Self-Review

**1. Spec coverage:**
- 피치 편집기(FormationPitch 재사용) → Task 6 ✅
- SWAP_SOCCER_LINEUP_POSITIONS(자리교대, gkChange, defenders 재계산) → Task 1+2 ✅
- CORRECT_SOCCER_LINEUP 재사용(정정) → Task 7 Step 5(기존 리듀서 그대로) ✅
- navLocked 가드 → Task 7 Step 3/4 ✅
- 레거시 승격 → Task 7 Step 3 ✅
- bench 미출전 필터 → Task 7 Step 5 ✅
- correctionSeq 제거 → Task 7 Step 2/6 ✅
- confirm 문구 분기 → Task 7 Step 5 ✅
- 라이브 handleSwap defenders → Task 3+4 ✅
- LineupCorrectionModal 삭제 → Task 7 Step 8 ✅
- gkChange 다운스트림 안전(집계 배경) → 기존 코드(soccerScoring)에서 이미 처리, 신규 이벤트도 동일 형태 → 회귀 없음(적대 리뷰 E 렌즈 clean)

**2. Placeholder scan:** 모든 스텝에 실제 코드/명령/기대출력 포함. TBD/TODO 없음.

**3. Type consistency:**
- `defendersFromPositionMap(positionMap) → string[]` — Task 1 정의, Task 2/4/7에서 동일 시그니처 사용 ✅
- 액션 `{ type:'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx, aIdx, bIdx }` — Task 2(리듀서)/Task 5(디스패처)/Task 7(호출) 일치 ✅
- `onSwapLineupPositions(matchIdx, aIdx, bIdx)` — Task 5 전달/Task 7 소비 일치 ✅
- `LineupEditView` props(formation/assignments/bench/onSwapPositions/onCorrect/onBack/title) — Task 6 정의/Task 7 사용 일치 ✅
- `reconstructFormation` 반환 `.subs`/`.assignments`/`.formation` — Task 7에서 사용, 기존 정의와 일치 ✅

# 축구 기록화면 ◀▶ 연속체 + 상대팀 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 축구 기록화면의 `오늘 경기` 리스트를 제거하고 풋살식 단일 ◀▶ 연속체(진행 중 화면 포함)로 재구성하며, 과거·진행 중 경기의 상대팀을 즉시 변경할 수 있게 한다.

**Architecture:** `SoccerMatchView`가 `navIdx` 단일 인덱스로 [과거 경기…] + [진행중/새 경기] 연속체를 지배한다(노드 결정 권위 = 경기 `status` + `navIdx`, `viewState`는 서브플로우 전용). 상대팀 변경은 신규 리듀서 액션 `SET_SOCCER_MATCH_OPPONENT`(논리 matchIdx 매칭) + `OpponentSelector` 모달 재사용. `FormationRecorder`의 미확정 골 입력(`goalFlow`) 중에는 ◀▶를 잠가 골 유실을 막는다.

**Tech Stack:** React 18 (함수형 컴포넌트, hooks), Vitest(리듀서 유닛테스트), Vite 빌드, Firebase RTDB 자식노드 동기화.

## Global Constraints

- 풋살 모드 코드(`ScheduleMatchView`/`FreeMatchView`/`CourtRecorder`/`useGameReducer`의 풋살 액션) **절대 변경 금지**. 공용 `RoundNav`만 재사용.
- 경기 데이터 독립성(불변식2): 한 경기의 변경이 다른 경기의 events/status/lineup/opponent를 바꾸면 안 됨.
- 로그 무결성(불변식1): 마감 시트에 들어갈 데이터(골/어시/상대팀)가 유실·불일치되면 안 됨.
- 진실 소스 시트(playerLog/pointLog)는 이 작업에서 건드리지 않음. `로그_*` 시트는 마감 시 기존 경로 그대로.
- 경기 식별 불변식: `soccerMatches[i].matchIdx === i` (append-only 생성 + `firebaseSyncDiff.js:334` 복원 재정렬로 유지). 신규 액션은 이에 의존하지 않고 논리 matchIdx로 매칭.
- Apps Script 변경 없음(이 작업은 웹앱 프론트만).

---

## File Structure

| 파일 | 책임 | 변경 |
| --- | --- | --- |
| `src/hooks/useGameReducer.js` | 상태 전이. 신규 `SET_SOCCER_MATCH_OPPONENT` 케이스 | Modify |
| `src/hooks/__tests__/useGameReducer.soccer.test.js` | 리듀서 유닛테스트. 신규 액션 격리 테스트 추가 | Modify |
| `src/SoccerApp.jsx` | 축구 셸/핸들러. `setSoccerMatchOpponent` 추가 + `SoccerMatchView`에 `onSetMatchOpponent`/`gameFinalized` 전달 | Modify |
| `src/components/game/FormationRecorder.jsx` | 진행 중 레코더. `goalFlow` 활성 여부를 `onFlowActiveChange`로 버블 | Modify |
| `src/components/game/SoccerMatchView.jsx` | 기록화면. `navIdx` 연속체 전면 재작성 + 상대팀 변경 UI | Rewrite |

재사용(무변경): `RoundNav.jsx`, `OpponentSelector.jsx`, `common/Modal.jsx`, `ConfirmBar.jsx`, `AttendeeSelector.jsx`, `FormationSetup.jsx`.

---

## Task 1: 리듀서 액션 `SET_SOCCER_MATCH_OPPONENT` (TDD)

**Files:**
- Modify: `src/hooks/useGameReducer.js` (UPDATE_SOCCER_MATCH_FORMATION 케이스 뒤, 약 line 918 이후)
- Test: `src/hooks/__tests__/useGameReducer.soccer.test.js`

**Interfaces:**
- Produces: 액션 `{ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: number, opponent: string }` — `soccerMatches`에서 `m.matchIdx === matchIdx`인 경기의 `opponent`만 교체, 나머지 필드/타 경기 불변.

- [ ] **Step 1: 실패 테스트 작성** — `src/hooks/__tests__/useGameReducer.soccer.test.js` 끝에 append

```js
describe('gameReducer — SET_SOCCER_MATCH_OPPONENT', () => {
  const threeMatches = [
    { matchIdx: 0, opponent: '한울', status: 'finished', events: [{ id: 'e0', type: 'goal', player: 'A', timestamp: 1 }], ourScore: 1, opponentScore: 0, lineup: ['A', 'B'] },
    { matchIdx: 1, opponent: '아이콘', status: 'finished', events: [{ id: 'e1', type: 'opponentGoal', currentGk: 'K', timestamp: 2 }], ourScore: 0, opponentScore: 1, lineup: ['C', 'D'] },
    { matchIdx: 2, opponent: '터틀파크', status: 'playing', events: [], ourScore: 0, opponentScore: 0, lineup: ['E', 'F'] },
  ];

  it('대상 경기의 opponent만 바꾸고 events/score/status/lineup은 보존한다', () => {
    const s = withState({ soccerMatches: threeMatches });
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: 1, opponent: '아이콘B' });
    const m = next.soccerMatches[1];
    expect(m.opponent).toBe('아이콘B');
    expect(m.events).toEqual(threeMatches[1].events);
    expect(m.ourScore).toBe(0);
    expect(m.opponentScore).toBe(1);
    expect(m.status).toBe('finished');
    expect(m.lineup).toEqual(['C', 'D']);
  });

  it('중간 경기 변경이 다른 경기(index 0·2)를 건드리지 않는다 (경기 독립성)', () => {
    const s = withState({ soccerMatches: threeMatches });
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: 1, opponent: 'X' });
    expect(next.soccerMatches[0]).toEqual(threeMatches[0]);
    expect(next.soccerMatches[2]).toEqual(threeMatches[2]);
  });

  it('논리 matchIdx로 매칭한다 (배열 순서가 아니라)', () => {
    // matchIdx가 배열 index와 다른 (이론상) 배열에서도 논리 matchIdx 기준으로 찾는다
    const shuffled = [
      { matchIdx: 5, opponent: 'P', status: 'finished', events: [] },
      { matchIdx: 3, opponent: 'Q', status: 'finished', events: [] },
    ];
    const s = withState({ soccerMatches: shuffled });
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx: 3, opponent: 'Q2' });
    expect(next.soccerMatches.find(m => m.matchIdx === 3).opponent).toBe('Q2');
    expect(next.soccerMatches.find(m => m.matchIdx === 5).opponent).toBe('P');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.soccer.test.js`
Expected: FAIL — `SET_SOCCER_MATCH_OPPONENT` 케이스가 없어 상태가 그대로 반환되어 `expect(m.opponent).toBe('아이콘B')` 실패.

- [ ] **Step 3: 리듀서 케이스 구현** — `useGameReducer.js`의 `UPDATE_SOCCER_MATCH_FORMATION` 케이스(`return { ...state, soccerMatches: matches };`로 끝남, 약 line 917~918) 바로 뒤에 삽입

```js
    // 상대팀만 교체(오기입 정정). 논리 matchIdx로 매칭 — 배열 index 불변식에 의존하지 않아
    // 격리 보장(타 경기 무변경). events/score/status/lineup 등 다른 필드는 스프레드로 보존.
    case 'SET_SOCCER_MATCH_OPPONENT': {
      const { matchIdx, opponent } = action;
      const matches = state.soccerMatches.map(m =>
        m.matchIdx === matchIdx ? { ...m, opponent } : m
      );
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.soccer.test.js`
Expected: PASS (신규 3개 + 기존 2개 모두 green).

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.soccer.test.js
git commit -m "feat(soccer): SET_SOCCER_MATCH_OPPONENT 리듀서 액션(논리 matchIdx 매칭)"
```

---

## Task 2: `SoccerApp` 핸들러 + prop 배선

**Files:**
- Modify: `src/SoccerApp.jsx` (핸들러: `reopenSoccerMatch` 정의 뒤 ~line 186 / prop 전달: `SoccerMatchView` JSX ~line 472)

**Interfaces:**
- Consumes: Task 1의 `SET_SOCCER_MATCH_OPPONENT` 액션.
- Produces: `SoccerMatchView`에 전달되는 prop `onSetMatchOpponent(matchIdx, opponent)` 와 `gameFinalized: boolean`.

- [ ] **Step 1: 핸들러 추가** — `src/SoccerApp.jsx`에서 `const reopenSoccerMatch = (matchIdx) => { dispatch({ type: 'REOPEN_SOCCER_MATCH', matchIdx }); };` 바로 아래(약 line 186)에 삽입

```js
  const setSoccerMatchOpponent = (matchIdx, opponent) => {
    dispatch({ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx, opponent });
  };
```

- [ ] **Step 2: prop 전달** — `SoccerMatchView` JSX 마지막 두 prop 라인을 교체

Find:
```jsx
            savedFormation={state.soccerFormation}
            onFormationChange={(f) => dispatch({ type: 'SET_SOCCER_FORMATION', formation: f })}
          />
```
Replace with:
```jsx
            savedFormation={state.soccerFormation}
            onFormationChange={(f) => dispatch({ type: 'SET_SOCCER_FORMATION', formation: f })}
            onSetMatchOpponent={setSoccerMatchOpponent}
            gameFinalized={state.gameFinalized}
          />
```

- [ ] **Step 3: 빌드 확인** (컴포넌트 테스트 하네스 없음 → 빌드로 검증)

Run: `npm run build`
Expected: 성공(에러 없음). 아직 `SoccerMatchView`는 새 prop을 소비하지 않지만(다음 태스크에서 소비) 무해.

- [ ] **Step 4: 커밋**

```bash
git add src/SoccerApp.jsx
git commit -m "feat(soccer): setSoccerMatchOpponent 핸들러 + onSetMatchOpponent/gameFinalized prop 전달"
```

---

## Task 3: `FormationRecorder` — `goalFlow` 활성 버블(`onFlowActiveChange`)

**Files:**
- Modify: `src/components/game/FormationRecorder.jsx`

**Interfaces:**
- Produces: 신규 prop `onFlowActiveChange?: (active: boolean) => void`. `goalFlow !== null`일 때 `true`, 아니면 `false`를 호출(마운트 시 `false`부터). 상위(`SoccerMatchView`)가 이걸로 ◀▶를 잠근다.

**배경:** `goalFlow`는 2탭 골 입력의 미확정 로컬 state(탭1에서 `onAddEvent` 미호출). 노드 전환으로 remount되면 파괴되어 골이 유실됨 → 진행 중 노드에서 이 상태가 열려 있으면 ◀▶를 막아야 한다.

- [ ] **Step 1: `useEffect` import 추가** — 파일 최상단

Find:
```js
import { useState } from 'react';
```
Replace with:
```js
import { useState, useEffect } from 'react';
```

- [ ] **Step 2: prop 시그니처에 `onFlowActiveChange` 추가** — 컴포넌트 파라미터 구조분해

Find:
```js
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange,
}) {
```
Replace with:
```js
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange, onFlowActiveChange,
}) {
```

- [ ] **Step 3: `goalFlow` 변화 시 상위 통지** — `const events = Array.isArray(initEvents) ? initEvents : [];` 바로 위(약 line 28)에 삽입

```js
  // 미확정 2탭 골 입력이 열려 있으면 상위에 알려 ◀▶ 네비를 잠근다(remount로 인한 골 유실 방지)
  useEffect(() => { onFlowActiveChange?.(goalFlow != null); }, [goalFlow, onFlowActiveChange]);
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 성공. `onFlowActiveChange` 미전달 시(다른 호출부 없음) `?.`로 무해.

- [ ] **Step 5: 커밋**

```bash
git add src/components/game/FormationRecorder.jsx
git commit -m "feat(soccer): FormationRecorder goalFlow 활성 상태를 onFlowActiveChange로 버블"
```

---

## Task 4: `SoccerMatchView` — `navIdx` 연속체 전면 재작성

**Files:**
- Rewrite: `src/components/game/SoccerMatchView.jsx`

**Interfaces:**
- Consumes: Task 2의 `onSetMatchOpponent`/`gameFinalized`, Task 3의 `FormationRecorder onFlowActiveChange`.
- Produces: 최종 UI. 외부 계약(SoccerApp이 넘기는 기존 prop들) 유지.

**변경 요지 (adversarial review 반영):**
- `오늘 경기` 리스트 삭제, `viewingMatchIdx` 제거 → `navIdx` 연속체.
- 노드 결정 권위 = `navIdx` + 경기 `status`. `viewState`는 서브플로우(`formation`/`editRoster`)와 유휴(`selectOpponent`)만. **`viewState:"playing"` 쓰기 전면 제거**(stale 오탭 렌더/크래시 방지).
- `handleReopenMatch`에서 `setViewingMatchIdx`/`saveFormationState({viewState:"playing"})` 제거.
- 상대팀 변경 버튼(RoundNav 아래, opponent 있는 매치 노드) + `OpponentSelector` 모달, `gameFinalized` 가드.
- 진행 중 노드 `goalFlow` 열림 중 ◀▶ 잠금(`navLocked`).
- 미사용 `RosterSelector` import 제거.

- [ ] **Step 1: 전체 파일 교체** — `src/components/game/SoccerMatchView.jsx` 전체를 아래로 대체

```jsx
import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers, soccerResultLabel } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import { FORMATIONS } from '../../utils/formations';
import Modal from '../common/Modal';
import OpponentSelector from './OpponentSelector';
import FormationSetup from './FormationSetup';
import FormationRecorder from './FormationRecorder';
import RoundNav from './RoundNav';
import ConfirmBar from './ConfirmBar';
import AttendeeSelector from './AttendeeSelector';

// 축구 기록화면: 단일 navIdx 연속체로 [과거 경기…] + [진행중/새 경기]를 오간다(풋살 ScheduleMatchView 패턴).
// 노드 본문 결정 권위 = navIdx + 경기 status. viewState는 서브플로우(formation/editRoster)와 유휴만.
export default function SoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onUpdateMatchFormation, onReopenMatch, onCreateRestMatch,
  onAddOpponent, onRemoveOpponent, onRenameOpponent, onGoToSummary, gameSettings, styles: s,
  savedFormation, onFormationChange,
  sortedPlayers, playerSortMode, rosterHandlers,
  onSetMatchOpponent, gameFinalized,
}) {
  const { C } = useTheme();

  // 서브플로우 뷰 상태만 유지: "selectOpponent"(유휴) / "formation" / "editRoster"
  const [viewState, setViewState] = useState(() =>
    (savedFormation?.viewState === "formation" || savedFormation?.viewState === "editRoster")
      ? savedFormation.viewState : "selectOpponent");
  const [selectedOpponent, setSelectedOpponent] = useState(savedFormation?.selectedOpponent || null);
  const [selectedPlayers, setSelectedPlayers] = useState(savedFormation?.selectedPlayers || []);
  const [navLocked, setNavLocked] = useState(false);            // goalFlow 열림 중 ◀▶ 잠금
  const [opponentModalIdx, setOpponentModalIdx] = useState(null); // 상대팀 변경 모달 대상 matchIdx

  // 멀티탭 동기화: 서브플로우 상태만 따라감(playing/selectOpponent는 노드 권위가 아니므로 sync에서 제외).
  useEffect(() => {
    const v = savedFormation?.viewState;
    if (v === "formation" || v === "editRoster") {
      setViewState(local => local === "editRoster" ? local : v);
    }
  }, [savedFormation?.viewState]);
  useEffect(() => { setSelectedOpponent(savedFormation?.selectedOpponent || null); }, [savedFormation?.selectedOpponent]);
  useEffect(() => { setSelectedPlayers(savedFormation?.selectedPlayers || []); }, [savedFormation?.selectedPlayers]);

  const saveFormationState = (updates) => {
    onFormationChange?.({ viewState, selectedOpponent, selectedPlayers, ...updates });
  };

  // ── 연속체 파생 ──
  const orderedMatches = [...soccerMatches].sort((a, b) => a.matchIdx - b.matchIdx);
  const playingPos = orderedMatches.findIndex(m => m.status === "playing");
  const hasPlaying = playingPos >= 0;
  const totalNodes = orderedMatches.length + (hasPlaying ? 0 : 1);
  const editableIdx = hasPlaying ? playingPos : orderedMatches.length; // 진행중 경기 or 트레일링 새 경기

  const [navIdx, setNavIdx] = useState(editableIdx);
  // 구조가 바뀌면(생성/종료/확정취소/휴식) 편집 노드로 자동 포커스(풋살 FreeMatchView 가드 패턴).
  const sig = `${orderedMatches.length}:${playingPos}`;
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); setNavIdx(editableIdx); }

  const safeNavIdx = Math.max(0, Math.min(navIdx, totalNodes - 1));
  const currentMatch = currentMatchIdx >= 0 ? soccerMatches[currentMatchIdx] : null;

  // 경기 객체에서 레코더용 포메이션 복원(저장돼 있으면 그대로, 없으면 lineup/gk/defenders로 4-4-2 재구성)
  const reconstructFormation = (m) => {
    if (m.formation && m.assignments && m.positionMap) {
      return { formation: m.formation, assignments: m.assignments, positionMap: m.positionMap, gk: m.gk || "", subs: m.subs || [] };
    }
    const formation = "4-4-2";
    const positions = FORMATIONS[formation].positions;
    const gk = m.gk || "";
    const defenders = m.defenders || [];
    const lineup = m.lineup || [];
    const others = lineup.filter(n => n !== gk && !defenders.includes(n));
    const assignments = {}; const positionMap = {};
    let di = 0, oi = 0;
    positions.forEach((pos, idx) => {
      let name = null;
      if (pos.role === "GK") name = gk || others[oi++] || null;
      else if (pos.role === "DF") name = defenders[di++] ?? others[oi++] ?? null;
      else name = others[oi++] ?? null;
      if (name) { assignments[idx] = name; positionMap[name] = pos.role; }
    });
    let curGk = gk;
    let curSubs = [...(m.subs || [])];
    const slotOf = (player) => Object.keys(assignments).find(idx => assignments[idx] === player);
    [...(m.events || [])].sort((a, b) => a.timestamp - b.timestamp).forEach(e => {
      if (e.type === "sub") {
        const slot = slotOf(e.playerOut);
        if (slot !== undefined) {
          const role = positions[slot].role;
          assignments[slot] = e.playerIn;
          delete positionMap[e.playerOut];
          positionMap[e.playerIn] = role;
          if (role === "GK") curGk = e.playerIn;
        }
        curSubs = curSubs.filter(n => n !== e.playerIn);
        if (!curSubs.includes(e.playerOut)) curSubs.push(e.playerOut);
      } else if (e.type === "redCard") {
        const slot = slotOf(e.player);
        if (slot !== undefined) { delete assignments[slot]; delete positionMap[e.player]; }
      }
    });
    return { formation, assignments, positionMap, gk: curGk, subs: curSubs };
  };

  // 상대팀 선택 → 포메이션 서브플로우
  const handleOpponentSelect = (name) => {
    setSelectedOpponent(name);
    setSelectedPlayers(attendees);
    setViewState("formation");
    saveFormationState({ viewState: "formation", selectedOpponent: name, selectedPlayers: attendees });
  };

  // 포메이션 확정 → 경기 생성(status playing). viewState는 유휴로 복귀(노드는 status에서 파생).
  const handleFormationConfirm = ({ formation, assignments, gk, positionMap, subs }) => {
    const lineup = Object.values(assignments);
    const defenders = Object.entries(positionMap).filter(([, r]) => r === "DF").map(([n]) => n);
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders, subs, formation, assignments, positionMap });
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent" });
  };

  const handleFormationStateChange = (updates) => {
    onUpdateMatchFormation?.(currentMatchIdx, updates);
  };

  // 끝난 경기 다시 열기(풀편집). viewState/navIdx는 손대지 않음 — 구조 변경으로 navIdx가 자동 리셋된다.
  const handleReopenMatch = (matchIdx) => {
    const m = soccerMatches.find(x => x.matchIdx === matchIdx);
    if (!m) return;
    if (!confirm(`제${matchIdx + 1}경기 (vs ${m.opponent}) 기록을 다시 열어 수정하시겠습니까?`)) return;
    onReopenMatch?.(matchIdx);
    if (!(m.formation && m.assignments && m.positionMap)) {
      onUpdateMatchFormation?.(matchIdx, reconstructFormation(m));
    }
  };

  const handleAddEvent = (event) => {
    onAddEvent(currentMatchIdx, { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() });
  };
  const handleDeleteEvent = (eventId) => { onDeleteEvent(currentMatchIdx, eventId); };

  // 경기 종료. viewState 유휴 유지, navIdx는 구조 변경으로 새 경기 노드로 자동 이동.
  const handleFinishMatch = (finalSnapshot) => {
    if (finalSnapshot && typeof finalSnapshot === "object") onUpdateMatchFormation?.(currentMatchIdx, finalSnapshot);
    onFinishMatch(currentMatchIdx);
    setNavLocked(false);
    setSelectedOpponent(null);
    setSelectedPlayers([]);
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null });
  };

  // ── 서브플로우(전체화면, RoundNav 없음) ──
  if (viewState === "formation" && selectedOpponent) {
    return (
      <FormationSetup selectedPlayers={selectedPlayers} onConfirm={handleFormationConfirm}
        onBack={() => setViewState("selectOpponent")} title={`vs ${selectedOpponent}`} />
    );
  }
  if (viewState === "editRoster") {
    return (
      <div>
        <button onClick={() => setViewState("selectOpponent")} style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 완료</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 4 }}>참석명단 수정</div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>변경은 다음 경기부터 반영됩니다. (진행/종료된 경기는 그대로)</div>
        <AttendeeSelector attendees={attendees} sortedPlayers={sortedPlayers || []} playerSortMode={playerSortMode} {...rosterHandlers} styles={s} />
      </div>
    );
  }

  // ── 연속체 노드 ──
  const atNewNode = safeNavIdx >= orderedMatches.length;      // 트레일링 새 경기 노드
  const node = atNewNode ? null : orderedMatches[safeNavIdx];
  const isRest = !!node && node.opponent === "휴식";
  const isPlayingNode = !!node && node.status === "playing";

  const navLabel = atNewNode ? `제${soccerMatches.length + 1}경기` : `제${node.matchIdx + 1}경기`;
  const navStatusText = atNewNode ? "새 경기" : isRest ? "휴식" : isPlayingNode ? "진행중" : "종료됨";
  const navStatusTone = isPlayingNode ? "orange" : atNewNode ? "gray" : "green";

  const goPrev = () => { if (safeNavIdx > 0 && !navLocked) setNavIdx(safeNavIdx - 1); };
  const goNext = () => { if (safeNavIdx < totalNodes - 1 && !navLocked) setNavIdx(safeNavIdx + 1); };

  const canChangeOpponent = !!node && !atNewNode && !isRest;
  const openOpponentModal = () => {
    if (!node) return;
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n상대팀을 바꾸면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    setOpponentModalIdx(node.matchIdx);
  };

  return (
    <div>
      <RoundNav
        label={navLabel} total={totalNodes}
        statusText={navStatusText} statusTone={navStatusTone}
        canPrev={safeNavIdx > 0 && !navLocked}
        canNext={safeNavIdx < totalNodes - 1 && !navLocked}
        onPrev={goPrev} onNext={goNext}
      />

      {canChangeOpponent && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={openOpponentModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🔁 상대팀 변경
          </button>
        </div>
      )}

      {/* 새 경기 노드 */}
      {atNewNode && (
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>제{soccerMatches.length + 1}경기</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button onClick={() => setViewState("editRoster")}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
              👥 명단 수정 ({attendees.length})
            </button>
          </div>
          <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent}
            onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent} styles={s} />
          <button onClick={() => { if (!confirm("이번 라운드를 휴식으로 처리하시겠습니까?")) return; onCreateRestMatch(); }}
            style={{ marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 10, border: `1px dashed ${C.grayDark}`, background: "transparent", fontSize: 13, color: C.gray, cursor: "pointer" }}>
            😴 휴식 (이번 라운드 스킵)
          </button>
        </div>
      )}

      {/* 진행 중 노드 — FormationRecorder(편집). goalFlow 열림 중 ◀▶ 잠금. */}
      {isPlayingNode && currentMatch && (() => {
        const live = reconstructFormation(currentMatch);
        return (
          <FormationRecorder
            key={currentMatch.matchIdx}
            formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
            subs={live.subs} gk={live.gk} opponent={currentMatch.opponent}
            startedAt={currentMatch.startedAt || Date.now()} events={currentMatch.events || []}
            onAddEvent={handleAddEvent} onDeleteEvent={handleDeleteEvent} onFinishMatch={handleFinishMatch}
            onStateChange={handleFormationStateChange} onFlowActiveChange={setNavLocked}
          />
        );
      })()}

      {/* 과거(종료/휴식) 노드 — 읽기전용 요약 */}
      {node && !atNewNode && !isPlayingNode && (() => {
        const { ourScore, opponentScore } = calcSoccerScore(node.events);
        const csPlayers = getCleanSheetPlayers(node);
        const result = soccerResultLabel(ourScore, opponentScore);
        const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
        return (
          <>
            <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0" }}>
                <span style={{ color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</span>
                <span style={{ color: C.gray }}> : </span>
                <span style={{ color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {node.opponent}{isRest ? "" : <span style={{ color: resultColor }}> — {result}</span>}</div>
              {csPlayers.length > 0 && <div style={{ fontSize: 11, color: C.yellow, marginTop: 6 }}>🛡 클린시트: {csPlayers.join(", ")}</div>}
            </div>
            {[...(node.events || [])].sort((a, b) => a.timestamp - b.timestamp).map(e => (
              <div key={e.id} style={{ padding: "5px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11, color: C.white }}>
                {e.type === "goal" && `⚽ ${e.player}${e.assist ? ` · 🅰️ ${e.assist}` : ""}`}
                {e.type === "owngoal" && `🔴 ${e.player} (자책골)`}
                {e.type === "opponentGoal" && `⚽ 상대골 (GK: ${e.currentGk || ""})`}
                {e.type === "opponentOwnGoal" && `🔴 상대 자책골`}
                {e.type === "sub" && `🔄 ${e.playerOut} → ${e.playerIn} (${e.position})`}
                {e.type === "yellowCard" && `🟨 ${e.player} 옐로카드`}
                {e.type === "redCard" && `🟥 ${e.player} 레드카드`}
              </div>
            ))}
            <div style={{ height: 72 }} />
            <ConfirmBar>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>제{node.matchIdx + 1}경기 {isRest ? "휴식" : "종료됨"}</span>
              {!isRest && (
                <button onClick={() => handleReopenMatch(node.matchIdx)}
                  style={{ padding: "6px 16px", borderRadius: 8, background: C.orange, color: C.bg, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>확정취소</button>
              )}
            </ConfirmBar>
          </>
        );
      })()}

      {/* 상대팀 변경 모달 — 논리 matchIdx로 교체 */}
      {opponentModalIdx !== null && (
        <Modal onClose={() => setOpponentModalIdx(null)} title="상대팀 변경">
          <OpponentSelector
            opponents={opponents}
            onSelect={(name) => { onSetMatchOpponent?.(opponentModalIdx, name); setOpponentModalIdx(null); }}
            onAddOpponent={onAddOpponent} onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent}
            styles={s} />
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공(에러 없음). `onGoToSummary`/`gameSettings`는 구조분해만(무해).

- [ ] **Step 3: 린트 확인**

Run: `npx eslint src/components/game/SoccerMatchView.jsx`
Expected: 에러 없음(미사용 `RosterSelector` import 제거됨).

- [ ] **Step 4: 전체 리듀서 테스트 회귀 확인**

Run: `npx vitest run`
Expected: 전부 PASS(축구/풋살/동기화 무회귀).

- [ ] **Step 5: 수동 QA (dev 서버 `npm run dev`)**

축구 경기 진행 화면에서:
- (a) `오늘 경기` 리스트가 사라지고, 상단 ◀▶로 과거↔진행중↔새 경기 이동됨. 라벨/상태칩(종료됨·진행중·새 경기) 정상.
- (b) 진행 중 경기에서 골 입력 **탭1(골 선수)만 한 상태**(어시 대기)에서 ◀▶가 **비활성**임을 확인 → 어시 선택 완료(또는 어시 없음)해야 이동 가능. 골이 유실되지 않음.
- (c) 진행 중 경기에서 어시까지 확정 후 ◀로 과거 열람 → ▶로 복귀 시 스코어/피치/기록 보존.
- (d) 과거·진행중 노드에서 `🔁 상대팀 변경` → 기존팀 선택/새 팀 추가 → 즉시 반영. `대진표`·`팀순위`·`개인기록` 모달에도 반영.
- (e) 과거 노드 `확정취소` → 그 경기가 편집(진행중)으로 열리고 골/어시/GK/포메이션 수정 가능 → 재종료. 크래시 없음.
- (f) `경기마감`으로 최종집계 진입 → `기록확정(전송)` → `경기로` 복귀 → 상대팀 변경 시도 시 **마감 경고**가 뜨고, 계속하면 변경됨(이후 `수정 후 재전송` 안내).
- (g) 휴식 노드에는 `상대팀 변경`/`확정취소` 버튼이 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): 기록화면 navIdx 연속체 재작성 + 상대팀 변경 UI + goalFlow 네비잠금"
```

---

## Self-Review (작성자 체크)

**스펙 커버리지:**
- 오늘 경기 리스트 제거 → Task 4 Step 1(리스트 블록 없음). ✅
- ◀▶ 연속체(진행중 포함) → Task 4(RoundNav 모든 노드 + isPlayingNode 렌더). ✅
- 과거 편집 = 확정취소 게이트 → Task 4 `handleReopenMatch` + ConfirmBar 확정취소. ✅
- 상대팀 변경(과거·진행중) → Task 1(액션) + Task 2(배선) + Task 4(버튼/모달). ✅
- goalFlow 미확정 골 유실 방지 → Task 3(버블) + Task 4(navLocked/canPrev·canNext). ✅
- 마감 후 가드 → Task 4 `openOpponentModal`의 gameFinalized confirm. ✅
- viewState "playing"/"selectOpponent" 노드권위 은퇴 → Task 4(status/navIdx 파생, viewState:"playing" 미기록). ✅
- handleReopenMatch setViewingMatchIdx 제거 → Task 4(해당 코드 없음). ✅
- 논리 matchIdx 매칭 + 격리 테스트 → Task 1 Step 1·3. ✅

**플레이스홀더 스캔:** 없음(모든 스텝에 실제 코드/명령).

**타입/이름 일관성:** 액션 `SET_SOCCER_MATCH_OPPONENT`(Task1) = 핸들러 `setSoccerMatchOpponent`(Task2) = prop `onSetMatchOpponent`(Task2/4) 일치. `onFlowActiveChange`(Task3 produces) = Task4 `onFlowActiveChange={setNavLocked}` 일치. `gameFinalized` prop(Task2) = Task4 소비 일치.

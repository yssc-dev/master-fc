# 축구 라인업 정정 + 교체삭제 되돌리기 + 카드버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선발 오기입을 교체가 아닌 로스터 정정으로 고치고(이벤트 이관), 교체 이벤트 삭제 시 안전하게 되돌리며, 옐로/레드 카드 버튼을 작게 한다.

**Architecture:** 신규 리듀서 액션 `CORRECT_SOCCER_LINEUP`이 매치 전체에서 `out(b)→in(a)`를 치환(lineup/defenders/assignments/positionMap/gk/subs/events)하고 b를 벤치로. 이벤트 치환은 순수 헬퍼 `remapPlayerInSoccerEvents`로 분리·테스트. `DELETE_SOCCER_EVENT`는 sub의 `posIdx` 슬롯이 안 바뀐 경우만 배치를 되돌린다. UI는 `상대팀 변경` 옆 `라인업 변경` 버튼 + `LineupCorrectionModal`, 진행중 노드는 `correctionSeq`로 강제 remount.

**Tech Stack:** React 18(함수형·hooks), Vitest, Vite, Firebase RTDB 자식노드 동기화.

## Global Constraints

- 풋살 모드(`scoring.js`/CourtRecorder/풋살 액션) **절대 변경 금지**.
- 경기 독립성: 한 경기 정정이 타 경기 데이터를 바꾸면 안 됨.
- 로그 무결성: 정정/삭제-되돌리기로 골/어시/GK 귀속이 유실·불일치되면 안 됨.
- `CORRECT_SOCCER_LINEUP`은 **논리 `m.matchIdx === matchIdx`** 로 매칭(배열 index 아님).
- b→a 치환 대상에 **`defenders` 반드시 포함**(getCleanSheetPlayers·레거시 reconstructFormation이 직접 사용).
- 컴포넌트 렌더 테스트 하네스(RTL) 없음 → 순수 함수/리듀서는 Vitest, 순수 프레젠테이션 컴포넌트는 `react-dom/server` 렌더 스모크, 통합 UI는 build/lint + 수동 QA.
- `lineup`은 이미 RTDB 동기화 대상(추가 배선 불필요).

---

## Task 1: `remapPlayerInSoccerEvents` 순수 헬퍼 (TDD)

**Files:**
- Modify: `src/utils/soccerScoring.js` (파일 끝 export 추가)
- Test: `src/utils/__tests__/soccerScoring.remapPlayer.test.js`

**Interfaces:**
- Produces: `remapPlayerInSoccerEvents(events: Event[], from: string, to: string): Event[]` — 모든 이름 필드에서 `from→to` 치환한 새 배열(입력 불변). from===to면 원본 반환.

- [ ] **Step 1: 실패 테스트 작성**

```js
import { describe, it, expect } from 'vitest';
import { remapPlayerInSoccerEvents } from '../soccerScoring';

describe('remapPlayerInSoccerEvents', () => {
  const events = [
    { id: '1', type: 'goal', player: 'B', assist: 'X', timestamp: 1 },
    { id: '2', type: 'goal', player: 'Y', assist: 'B', timestamp: 2 },
    { id: '3', type: 'opponentGoal', currentGk: 'B', timestamp: 3 },
    { id: '4', type: 'sub', playerOut: 'B', playerIn: 'Z', position: 'DF', timestamp: 4 },
    { id: '5', type: 'yellowCard', player: 'B', timestamp: 5 },
    { id: '6', type: 'gkChange', playerOut: 'B', playerIn: 'W', timestamp: 6 },
    { id: '7', type: 'goal', player: 'X', assist: null, timestamp: 7 },
  ];

  it('모든 이름 필드에서 from→to 치환, 나머지 불변', () => {
    const r = remapPlayerInSoccerEvents(events, 'B', 'A');
    expect(r[0]).toMatchObject({ player: 'A', assist: 'X' });
    expect(r[1]).toMatchObject({ player: 'Y', assist: 'A' });
    expect(r[2]).toMatchObject({ currentGk: 'A' });
    expect(r[3]).toMatchObject({ playerOut: 'A', playerIn: 'Z' });
    expect(r[4]).toMatchObject({ player: 'A' });
    expect(r[5]).toMatchObject({ playerOut: 'A', playerIn: 'W' });
    expect(r[6].assist).toBeNull(); // null 유지
  });

  it('입력을 변형하지 않는다', () => {
    const copy = JSON.parse(JSON.stringify(events));
    remapPlayerInSoccerEvents(events, 'B', 'A');
    expect(events).toEqual(copy);
  });

  it('from===to면 원본 그대로', () => {
    expect(remapPlayerInSoccerEvents(events, 'B', 'B')).toBe(events);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/soccerScoring.remapPlayer.test.js`
Expected: FAIL — `remapPlayerInSoccerEvents is not a function`.

- [ ] **Step 3: 구현** — `src/utils/soccerScoring.js` 끝에 추가

```js
// 한 매치 이벤트에서 선수 이름 from→to를 모든 이름 필드에 걸쳐 치환(라인업 정정 시 b→a 이관).
// 순수 — 입력 불변, 새 배열 반환.
export function remapPlayerInSoccerEvents(events, from, to) {
  if (!Array.isArray(events) || from === to) return events || [];
  const r = (v) => (v === from ? to : v);
  return events.map(e => {
    switch (e.type) {
      case "goal": return { ...e, player: r(e.player), assist: r(e.assist) };
      case "owngoal":
      case "redCard":
      case "yellowCard": return { ...e, player: r(e.player) };
      case "opponentGoal": return { ...e, currentGk: r(e.currentGk) };
      case "sub":
      case "gkChange": return { ...e, playerIn: r(e.playerIn), playerOut: r(e.playerOut) };
      default: return e;
    }
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/soccerScoring.remapPlayer.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/soccerScoring.js src/utils/__tests__/soccerScoring.remapPlayer.test.js
git commit -m "feat(soccer): remapPlayerInSoccerEvents 헬퍼 — 이벤트 선수 이름 치환"
```

---

## Task 2: `CORRECT_SOCCER_LINEUP` 리듀서 액션 (TDD)

**Files:**
- Modify: `src/hooks/useGameReducer.js` (`SET_SOCCER_MATCH_OPPONENT` 케이스 뒤; import에 `remapPlayerInSoccerEvents` 추가)
- Test: `src/hooks/__tests__/useGameReducer.correctLineup.test.js`

**Interfaces:**
- Consumes: `remapPlayerInSoccerEvents` (Task 1).
- Produces: 액션 `{ type: 'CORRECT_SOCCER_LINEUP', matchIdx, out, in }` — `m.matchIdx===matchIdx`인 경기에서 out(b)→in(a) 전체 치환, b를 subs로.

- [ ] **Step 1: 실패 테스트 작성**

```js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const withState = (o) => ({ ...initialState, ...o });

describe('gameReducer — CORRECT_SOCCER_LINEUP', () => {
  // b(장치광)를 DF 선발로 오기입, 실제로는 a(장주성)가 뜀. b는 골도 하나 찍힘.
  const base = () => withState({ soccerMatches: [
    { matchIdx: 0, opponent: '한울', status: 'finished',
      lineup: ['GK1', '장치광', 'M1'], defenders: ['장치광'], gk: 'GK1',
      assignments: { 0: 'GK1', 1: '장치광', 2: 'M1' },
      positionMap: { GK1: 'GK', 장치광: 'DF', M1: 'MF' },
      subs: ['장주성', 'BN1'],
      events: [{ id: 'g', type: 'goal', player: '장치광', assist: null, timestamp: 1 }],
    },
    { matchIdx: 1, opponent: '아이콘', status: 'finished', lineup: ['P1'], defenders: [], gk: '', assignments: {}, positionMap: {}, subs: [], events: [] },
  ] });

  it('b→a 치환: lineup/defenders/assignments/positionMap/gk/이벤트, b는 subs로', () => {
    const next = gameReducer(base(), { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: '장치광', in: '장주성' });
    const m = next.soccerMatches[0];
    expect(m.lineup).toEqual(['GK1', '장주성', 'M1']);
    expect(m.defenders).toEqual(['장주성']);
    expect(m.assignments).toEqual({ 0: 'GK1', 1: '장주성', 2: 'M1' });
    expect(m.positionMap['장주성']).toBe('DF');
    expect(m.positionMap['장치광']).toBeUndefined();
    expect(m.subs).toContain('장치광');       // b는 미출전(벤치)
    expect(m.subs).not.toContain('장주성');    // a는 출전
    expect(m.events[0].player).toBe('장주성'); // 골 이관
  });

  it('타 경기 무변경(경기 독립성)', () => {
    const s = base();
    const next = gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: '장치광', in: '장주성' });
    expect(next.soccerMatches[1]).toEqual(s.soccerMatches[1]);
  });

  it('GK 정정: gk와 currentGk 이관', () => {
    const s = withState({ soccerMatches: [{
      matchIdx: 0, opponent: 'X', status: 'finished',
      lineup: ['badGK', 'D1'], defenders: ['D1'], gk: 'badGK',
      assignments: { 0: 'badGK', 1: 'D1' }, positionMap: { badGK: 'GK', D1: 'DF' },
      subs: ['realGK'],
      events: [{ id: 'og', type: 'opponentGoal', currentGk: 'badGK', timestamp: 1 }],
    }] });
    const next = gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: 'badGK', in: 'realGK' });
    const m = next.soccerMatches[0];
    expect(m.gk).toBe('realGK');
    expect(m.positionMap['realGK']).toBe('GK');
    expect(m.events[0].currentGk).toBe('realGK');
  });

  it('orphan 케이스(positionMap[b] 없음): a의 기존 role 보존', () => {
    // b가 assignments엔 없고 lineup에만, a는 이미 assignments에 role 보유(교체+삭제 흔적)
    const s = withState({ soccerMatches: [{
      matchIdx: 0, opponent: 'X', status: 'finished',
      lineup: ['GK1', 'b'], defenders: [], gk: 'GK1',
      assignments: { 0: 'GK1', 1: 'a' }, positionMap: { GK1: 'GK', a: 'MF' }, // b는 positionMap에 없음
      subs: ['b'], events: [],
    }] });
    const next = gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: 'b', in: 'a' });
    const m = next.soccerMatches[0];
    expect(m.positionMap['a']).toBe('MF'); // undefined로 덮어쓰지 않음
    expect(m.lineup).toEqual(['GK1', 'a']);
  });

  it('out===in 또는 빈 값이면 무변경', () => {
    const s = base();
    expect(gameReducer(s, { type: 'CORRECT_SOCCER_LINEUP', matchIdx: 0, out: 'X', in: 'X' })).toBe(s);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.correctLineup.test.js`
Expected: FAIL — 액션 미처리로 상태 그대로 반환.

- [ ] **Step 3: import 추가** — `useGameReducer.js`에서 `calcSoccerScore`를 import하는 줄에 `remapPlayerInSoccerEvents` 추가

Find (soccerScoring import — 실제 형태 확인 후):
```js
import { calcSoccerScore } from '../utils/soccerScoring';
```
Replace with:
```js
import { calcSoccerScore, remapPlayerInSoccerEvents } from '../utils/soccerScoring';
```
(만약 이미 다른 것들과 함께 import 중이면 목록에 `remapPlayerInSoccerEvents`만 추가.)

- [ ] **Step 4: 리듀서 케이스 구현** — `SET_SOCCER_MATCH_OPPONENT` 케이스의 닫는 `}` 뒤에 삽입

```js
    // 선발 오기입 정정: out(b, 잘못 기록)→in(a, 실제 뜀). 매치 전체 b→a 치환, b는 벤치로.
    // 교체(sub) 아님 → sub 이벤트 생성 안 함. b의 이벤트는 a로 이관. 논리 matchIdx 매칭.
    case 'CORRECT_SOCCER_LINEUP': {
      const { matchIdx, out: b, in: a } = action;
      if (!b || !a || b === a) return state;
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx) return m;
        const lineup = (m.lineup || []).map(n => n === b ? a : n);
        const defenders = (m.defenders || []).map(n => n === b ? a : n);
        const assignments = {};
        for (const [idx, name] of Object.entries(m.assignments || {})) assignments[idx] = name === b ? a : name;
        const positionMap = { ...(m.positionMap || {}) };
        const roleForA = positionMap[b] ?? positionMap[a]; // b role, 없으면 a 기존 role(orphan)
        delete positionMap[b];
        if (roleForA !== undefined) positionMap[a] = roleForA;
        const gk = m.gk === b ? a : m.gk;
        const subs = [...(m.subs || []).filter(n => n !== a)];
        if (!subs.includes(b)) subs.push(b);
        const events = remapPlayerInSoccerEvents(m.events, b, a);
        const { ourScore, opponentScore } = calcSoccerScore(events);
        return { ...m, lineup, defenders, assignments, positionMap, gk, subs, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.correctLineup.test.js`
Expected: PASS (5/5).

- [ ] **Step 6: 전체 회귀 + 커밋**

Run: `npx vitest run`
Expected: 전부 PASS.

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.correctLineup.test.js
git commit -m "feat(soccer): CORRECT_SOCCER_LINEUP 리듀서 — 선발 오기입 정정(b→a 전체 치환+이벤트 이관)"
```

---

## Task 3: `DELETE_SOCCER_EVENT` posIdx 기반 안전 sub 되돌리기 (TDD)

**Files:**
- Modify: `src/hooks/useGameReducer.js` (`DELETE_SOCCER_EVENT` 케이스)
- Test: `src/hooks/__tests__/useGameReducer.subRevert.test.js`

**Interfaces:**
- Consumes: sub 이벤트에 `posIdx` 필드가 있음(Task 4에서 handleSubIn이 저장). posIdx 없으면 되돌리지 않음.
- Produces: sub 삭제 시 `assignments[posIdx]===playerIn`이면 배치/subs/gk 복원, 아니면 이벤트만 삭제.

- [ ] **Step 1: 실패 테스트 작성**

```js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
const withState = (o) => ({ ...initialState, ...o });

describe('gameReducer — DELETE_SOCCER_EVENT sub 되돌리기', () => {
  // p1(DF slot1)이 p2로 교체됨. 슬롯1엔 현재 p2, subs엔 p1.
  const base = () => withState({ soccerMatches: [{
    matchIdx: 0, status: 'finished', opponent: 'X',
    lineup: ['GK', 'p1', 'M'], defenders: ['p1'], gk: 'GK',
    assignments: { 0: 'GK', 1: 'p2', 2: 'M' }, positionMap: { GK: 'GK', p2: 'DF', M: 'MF' },
    subs: ['p1'],
    events: [{ id: 's', type: 'sub', playerOut: 'p1', playerIn: 'p2', position: 'DF', posIdx: 1, timestamp: 1 }],
  }] });

  it('슬롯 미변경 시: 배치/subs/gk 되돌리고 이벤트 삭제', () => {
    const next = gameReducer(base(), { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    const m = next.soccerMatches[0];
    expect(m.events).toHaveLength(0);
    expect(m.assignments[1]).toBe('p1');       // playerOut 복귀
    expect(m.positionMap['p1']).toBe('DF');
    expect(m.positionMap['p2']).toBeUndefined();
    expect(m.subs).toContain('p2');            // playerIn 벤치로
    expect(m.subs).not.toContain('p1');
  });

  it('슬롯이 이후 변경된(chained) 경우: 배치 미변경, 이벤트만 삭제', () => {
    const s = base();
    s.soccerMatches[0].assignments = { 0: 'GK', 1: 'p3', 2: 'M' }; // slot1이 p2가 아님(이후 또 바뀜)
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    const m = next.soccerMatches[0];
    expect(m.events).toHaveLength(0);
    expect(m.assignments[1]).toBe('p3'); // 그대로(오염 방지)
    expect(m.subs).toEqual(['p1']);
  });

  it('posIdx 없는 레거시 sub: 배치 미변경', () => {
    const s = base();
    delete s.soccerMatches[0].events[0].posIdx;
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 's' });
    expect(next.soccerMatches[0].assignments[1]).toBe('p2');
  });

  it('비-sub 이벤트 삭제는 기존대로(배치 무관)', () => {
    const s = withState({ soccerMatches: [{
      matchIdx: 0, status: 'finished', opponent: 'X', assignments: { 0: 'A' }, positionMap: {}, subs: [],
      events: [{ id: 'g', type: 'goal', player: 'A', timestamp: 1 }],
    }] });
    const next = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'g' });
    expect(next.soccerMatches[0].events).toHaveLength(0);
    expect(next.soccerMatches[0].assignments).toEqual({ 0: 'A' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.subRevert.test.js`
Expected: FAIL — 현재 DELETE는 배치를 안 되돌림.

- [ ] **Step 3: 구현** — `DELETE_SOCCER_EVENT` 케이스 전체 교체

```js
    case 'DELETE_SOCCER_EVENT': {
      const { matchIdx, eventId } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const deleted = (m.events || []).find(e => e.id === eventId);
        const events = (m.events || []).filter(e => e.id !== eventId);
        const { ourScore, opponentScore } = calcSoccerScore(events);
        // 교체(sub) 삭제 → 그 교체를 되돌린다. 단 그 슬롯(posIdx)이 이후 안 바뀐 경우만(오염 방지).
        if (deleted && deleted.type === "sub" && deleted.posIdx != null
            && (m.assignments || {})[deleted.posIdx] === deleted.playerIn) {
          const assignments = { ...m.assignments, [deleted.posIdx]: deleted.playerOut };
          const positionMap = { ...(m.positionMap || {}) };
          delete positionMap[deleted.playerIn];
          positionMap[deleted.playerOut] = deleted.position;
          const subs = [...(m.subs || []).filter(n => n !== deleted.playerOut), deleted.playerIn];
          const gk = deleted.position === "GK" ? deleted.playerOut : m.gk;
          return { ...m, events, ourScore, opponentScore, assignments, positionMap, subs, gk };
        }
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 4: 통과 + 전체 회귀**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.subRevert.test.js` → PASS (4/4).
Run: `npx vitest run` → 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.subRevert.test.js
git commit -m "fix(soccer): 교체 이벤트 삭제 시 posIdx 슬롯 안전 되돌리기"
```

---

## Task 4: `FormationRecorder` — sub 이벤트에 posIdx + 삭제 confirm

**Files:**
- Modify: `src/components/game/FormationRecorder.jsx` (handleSubIn, 이벤트 목록 삭제 버튼)

**Interfaces:**
- Produces: sub 이벤트에 `posIdx`(교체 슬롯) 포함 → Task 3의 되돌리기가 사용.

- [ ] **Step 1: handleSubIn이 posIdx 저장** — `onAddEvent({ type: "sub", ... })` 라인 교체

Find:
```js
    onAddEvent({ type: "sub", playerOut: subOut.name, playerIn: subName, position: role, id: generateEventId(), timestamp: Date.now() });
```
Replace with:
```js
    onAddEvent({ type: "sub", playerOut: subOut.name, playerIn: subName, position: role, posIdx: subOut.posIdx, id: generateEventId(), timestamp: Date.now() });
```

- [ ] **Step 2: 이벤트 목록 ✕ 삭제에 sub confirm** — 삭제 버튼 onClick 교체

Find:
```js
              <button onClick={() => onDeleteEvent(e.id)} style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 9, padding: "2px 5px", cursor: "pointer" }}>✕</button>
```
Replace with:
```js
              <button onClick={() => {
                if (e.type === "sub" && !confirm("이 교체를 삭제하면 그 교체가 되돌려집니다(배치 복원). 계속하시겠습니까?")) return;
                onDeleteEvent(e.id);
              }} style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 9, padding: "2px 5px", cursor: "pointer" }}>✕</button>
```

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/components/game/FormationRecorder.jsx
git commit -m "feat(soccer): 교체 이벤트에 posIdx 저장 + 삭제 시 되돌리기 confirm"
```

---

## Task 5: `SoccerApp` — correctSoccerLineup 핸들러 + prop

**Files:**
- Modify: `src/SoccerApp.jsx` (`setSoccerMatchOpponent` 정의 뒤 ~line 190; `SoccerMatchView` props ~line 479)

**Interfaces:**
- Consumes: Task 2의 `CORRECT_SOCCER_LINEUP`.
- Produces: `SoccerMatchView` prop `onCorrectLineup(matchIdx, out, in)`.

- [ ] **Step 1: 핸들러 추가** — `setSoccerMatchOpponent` 정의 바로 뒤에

Find:
```js
  const setSoccerMatchOpponent = (matchIdx, opponent) => {
    dispatch({ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx, opponent });
  };
```
Replace with:
```js
  const setSoccerMatchOpponent = (matchIdx, opponent) => {
    dispatch({ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx, opponent });
  };
  const correctSoccerLineup = (matchIdx, out, inn) => {
    dispatch({ type: 'CORRECT_SOCCER_LINEUP', matchIdx, out, in: inn });
  };
```

- [ ] **Step 2: prop 전달** — `SoccerMatchView`의 `gameFinalized={state.gameFinalized}` 뒤에

Find:
```js
            onSetMatchOpponent={setSoccerMatchOpponent}
            gameFinalized={state.gameFinalized}
```
Replace with:
```js
            onSetMatchOpponent={setSoccerMatchOpponent}
            onCorrectLineup={correctSoccerLineup}
            gameFinalized={state.gameFinalized}
```

- [ ] **Step 3: 빌드 + 커밋**

Run: `npm run build` → 성공.
```bash
git add src/SoccerApp.jsx
git commit -m "feat(soccer): correctSoccerLineup 핸들러 + onCorrectLineup prop"
```

---

## Task 6: `LineupCorrectionModal` 신규 컴포넌트 (렌더 스모크)

**Files:**
- Create: `src/components/game/LineupCorrectionModal.jsx`
- Test: `src/components/game/__tests__/LineupCorrectionModal.test.jsx`

**Interfaces:**
- Produces: `<LineupCorrectionModal played={string[]} bench={string[]} onCorrect={(out,in)=>void} onClose={()=>void} />`.

- [ ] **Step 1: 컴포넌트 생성**

```jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

// 라인업 정정: 잘못 기록된 출전(b) → 실제로 뛴 미출전(a) 선택 → onCorrect(b, a).
// 교체 아님(로스터 정정, sub 이벤트 없음, b의 이벤트는 a로 이관됨 — 리듀서에서).
export default function LineupCorrectionModal({ played, bench, onCorrect, onClose }) {
  const { C } = useTheme();
  const [outPlayer, setOutPlayer] = useState(null);
  const btn = { padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.cardLight, color: C.white };
  return (
    <Modal onClose={onClose} title="라인업 변경 (선발 정정)" maxWidth={380}>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 12 }}>
        잘못 기록된 <b>출전</b> 선수를 실제로 뛴 <b>미출전</b> 선수로 정정합니다. 교체가 아니라 기록을 바로잡는 것이며, 그 선수의 골·어시 기록도 함께 이관됩니다.
      </div>
      {!outPlayer ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>① 잘못 기록된 출전 선수</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {played.map(n => <button key={n} onClick={() => setOutPlayer(n)} style={btn}>{n}</button>)}
            {played.length === 0 && <span style={{ color: C.gray, fontSize: 12 }}>출전 선수 없음</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>
            ② <span style={{ color: C.white }}>{outPlayer}</span> 대신 실제로 뛴 선수
            <button onClick={() => setOutPlayer(null)} style={{ marginLeft: 8, fontSize: 10, background: "none", border: "none", color: C.accent, cursor: "pointer" }}>← 다시</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {bench.map(n => (
              <button key={n} onClick={() => {
                if (confirm(`${outPlayer} → ${n} 으로 정정할까요?\n(${outPlayer}=미출전, ${n}=출전, 기록 이관)`)) { onCorrect(outPlayer, n); onClose(); }
              }} style={btn}>{n}</button>
            ))}
            {bench.length === 0 && <span style={{ color: C.gray, fontSize: 12 }}>미출전 선수 없음</span>}
          </div>
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: 렌더 스모크 테스트**

```jsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import LineupCorrectionModal from '../LineupCorrectionModal';

const render = (props) => renderToStaticMarkup(
  createElement(ThemeProvider, null, createElement(LineupCorrectionModal, { onCorrect: () => {}, onClose: () => {}, ...props }))
);

describe('LineupCorrectionModal', () => {
  it('출전/미출전 선수를 렌더하고 크래시하지 않는다', () => {
    const html = render({ played: ['장치광', 'GK1'], bench: ['장주성', 'BN1'] });
    expect(html).toContain('장치광');
    expect(html).toContain('선발 정정');
    expect(html).not.toContain('NaN');
  });
  it('빈 목록도 안전', () => {
    expect(render({ played: [], bench: [] })).toContain('출전 선수 없음');
  });
});
```

- [ ] **Step 3: 통과 + 빌드**

Run: `npx vitest run src/components/game/__tests__/LineupCorrectionModal.test.jsx` → PASS.
Run: `npm run build` → 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/components/game/LineupCorrectionModal.jsx src/components/game/__tests__/LineupCorrectionModal.test.jsx
git commit -m "feat(soccer): LineupCorrectionModal — 선발 정정 UI"
```

---

## Task 7: `SoccerMatchView` — 라인업 변경 버튼 + 모달 + remount + 마감가드

**Files:**
- Modify: `src/components/game/SoccerMatchView.jsx`

**Interfaces:**
- Consumes: `onCorrectLineup` prop(Task 5), `LineupCorrectionModal`(Task 6).

- [ ] **Step 1: import + prop + state 추가**

Find:
```js
import FormationPitch from './FormationPitch';
```
Replace with:
```js
import FormationPitch from './FormationPitch';
import LineupCorrectionModal from './LineupCorrectionModal';
```

Find:
```js
  onSetMatchOpponent, gameFinalized,
```
Replace with:
```js
  onSetMatchOpponent, onCorrectLineup, gameFinalized,
```

Find:
```js
  const [opponentModalIdx, setOpponentModalIdx] = useState(null); // 상대팀 변경 모달 대상 matchIdx
```
Replace with:
```js
  const [opponentModalIdx, setOpponentModalIdx] = useState(null); // 상대팀 변경 모달 대상 matchIdx
  const [lineupModalIdx, setLineupModalIdx] = useState(null);     // 라인업 변경 모달 대상 matchIdx
  const [correctionSeq, setCorrectionSeq] = useState(0);          // 정정 후 진행중 레코더 강제 remount
```

- [ ] **Step 2: openLineupModal 핸들러** — `openOpponentModal` 정의 뒤에

Find:
```js
    setOpponentModalIdx(node.matchIdx);
  };
```
Replace with:
```js
    setOpponentModalIdx(node.matchIdx);
  };
  const openLineupModal = () => {
    if (!node) return;
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n라인업을 정정하면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    setLineupModalIdx(node.matchIdx);
  };
```

- [ ] **Step 3: 라인업 변경 버튼** — 상대팀 변경 버튼 블록 교체

Find:
```js
      {canChangeOpponent && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={openOpponentModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🔁 상대팀 변경
          </button>
        </div>
      )}
```
Replace with:
```js
      {canChangeOpponent && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
          <button onClick={openLineupModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🔁 라인업 변경
          </button>
          <button onClick={openOpponentModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🔁 상대팀 변경
          </button>
        </div>
      )}
```

- [ ] **Step 4: 진행중 노드 key에 correctionSeq** — FormationRecorder key 교체

Find:
```js
            key={currentMatch.matchIdx}
```
Replace with:
```js
            key={currentMatch.matchIdx + '-' + correctionSeq}
```

- [ ] **Step 5: 모달 렌더 추가** — 상대팀 변경 모달 블록 뒤에

Find:
```js
            onAddOpponent={onAddOpponent} onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent}
            styles={s} />
        </Modal>
      )}
    </div>
  );
```
Replace with:
```js
            onAddOpponent={onAddOpponent} onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent}
            styles={s} />
        </Modal>
      )}

      {/* 라인업 변경(선발 정정) 모달 */}
      {lineupModalIdx !== null && (() => {
        const m = soccerMatches.find(x => x.matchIdx === lineupModalIdx);
        if (!m) return null;
        // 출전 = 선발(lineup) ∪ 교체투입(sub playerIn). 미출전 = 스쿼드(lineup∪subs) − 출전.
        const subIn = (m.events || []).filter(e => e.type === "sub").map(e => e.playerIn);
        const played = [...new Set([...(m.lineup || []), ...subIn])];
        const roster = [...new Set([...(m.lineup || []), ...(m.subs || [])])];
        const bench = roster.filter(n => !played.includes(n));
        return (
          <LineupCorrectionModal
            played={played} bench={bench}
            onCorrect={(out, inn) => { onCorrectLineup?.(m.matchIdx, out, inn); setCorrectionSeq(sq => sq + 1); }}
            onClose={() => setLineupModalIdx(null)} />
        );
      })()}
    </div>
  );
```

- [ ] **Step 6: 빌드 + 린트 + 전체 테스트**

Run: `npm run build` → 성공.
Run: `npx eslint src/components/game/SoccerMatchView.jsx` → 0 errors.
Run: `npx vitest run` → 전부 PASS.

- [ ] **Step 7: 수동 QA (`npm run dev`)**
- (a) 과거 경기에서 `🔁 라인업 변경` → 출전에서 b 선택 → 미출전에서 a 선택 → confirm → 출전에 a, 미출전에 b, b의 골이 a로 이관. 개인기록에 반영.
- (b) 진행중 경기에서 라인업 변경 시 피치 즉시 반영(remount).
- (c) 마감 후 라인업 변경 시 경고 노출.
- (d) 장주성 케이스: `out=장치광, in=장주성` → 출전(11)에 장주성, 미출전에 장치광.

- [ ] **Step 8: 커밋**

```bash
git add src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): 라인업 변경 버튼+모달 연결, 정정 후 진행중 레코더 remount, 마감 가드"
```

---

## Task 8: `PlayerActionMenu` — 옐로/레드 작은 버튼

**Files:**
- Modify: `src/components/game/PlayerActionMenu.jsx`

- [ ] **Step 1: 레이아웃 교체** — 6버튼 그리드를 큰 4버튼 그리드 + 작은 2버튼 행으로

Find:
```jsx
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={() => onGoal(player)} style={btn(`${C.green}25`, C.green)}>⚽ 골</button>
        <button onClick={() => onAssist(player)} style={btn(`${C.accent}25`, C.accent)}>🅰️ 어시</button>
        <button onClick={() => onOwnGoal(player)} style={btn(`${C.red}25`, C.red)}>🔴 자책</button>
        {onSub && <button onClick={() => onSub(player)} style={btn(`${C.accent}20`, C.accent)}>🔄 교체</button>}
        <button onClick={() => onYellowCard(player)} style={btn("#eab30825", "#eab308")}>🟨 옐로</button>
        <button onClick={() => onRedCard(player)} style={btn("#ef444425", "#ef4444")}>🟥 레드</button>
      </div>
```
Replace with:
```jsx
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={() => onGoal(player)} style={btn(`${C.green}25`, C.green)}>⚽ 골</button>
        <button onClick={() => onAssist(player)} style={btn(`${C.accent}25`, C.accent)}>🅰️ 어시</button>
        <button onClick={() => onOwnGoal(player)} style={btn(`${C.red}25`, C.red)}>🔴 자책</button>
        {onSub && <button onClick={() => onSub(player)} style={btn(`${C.accent}20`, C.accent)}>🔄 교체</button>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
        <button onClick={() => onYellowCard(player)} style={smallBtn("#eab30820", "#eab308")}>🟨 옐로</button>
        <button onClick={() => onRedCard(player)} style={smallBtn("#ef444420", "#ef4444")}>🟥 레드</button>
      </div>
```

- [ ] **Step 2: smallBtn 스타일 추가** — `btn` 정의 뒤에

Find:
```jsx
  const btn = (bg, color) => ({
    padding: "12px 0", borderRadius: 10, border: "none",
    fontSize: 14, fontWeight: 700, cursor: "pointer", background: bg, color,
  });
```
Replace with:
```jsx
  const btn = (bg, color) => ({
    padding: "12px 0", borderRadius: 10, border: "none",
    fontSize: 14, fontWeight: 700, cursor: "pointer", background: bg, color,
  });
  const smallBtn = (bg, color) => ({
    padding: "5px 14px", borderRadius: 8, border: "none",
    fontSize: 11, fontWeight: 600, cursor: "pointer", background: bg, color,
  });
```

- [ ] **Step 3: 빌드 + 커밋**

Run: `npm run build` → 성공.
```bash
git add src/components/game/PlayerActionMenu.jsx
git commit -m "feat(soccer): 옐로/레드 카드 버튼 별도 행 작은 버튼으로"
```

---

## Self-Review (작성자 체크)

**스펙 커버리지:**
- 라인업 정정(G2) → Task 1(헬퍼)+2(리듀서)+5(핸들러)+6(모달)+7(버튼/remount/가드). ✅
- 교체 삭제 되돌리기(G1) → Task 3(리듀서 posIdx 복원)+4(posIdx 저장+confirm). ✅
- 카드 축소(G3) → Task 8. ✅
- defenders 치환 → Task 2 Step 4. ✅ / positionMap 가드 → Task 2. ✅ / 논리 matchIdx → Task 2. ✅
- 진행중 remount(correctionSeq) → Task 7. ✅ / 마감 가드 → Task 7. ✅ / remap 헬퍼 분리 → Task 1. ✅
- posIdx 안전복원(chained 미변경) → Task 3. ✅

**플레이스홀더 스캔:** 없음(모든 스텝 실제 코드/명령).

**타입/이름 일관성:** `CORRECT_SOCCER_LINEUP`(T2) = 핸들러 `correctSoccerLineup`(T5) = prop `onCorrectLineup`(T5/T7). `remapPlayerInSoccerEvents`(T1) = T2 사용. sub `posIdx`(T4 저장) = T3 소비. `LineupCorrectionModal` props `played/bench/onCorrect/onClose`(T6) = T7 사용 일치.

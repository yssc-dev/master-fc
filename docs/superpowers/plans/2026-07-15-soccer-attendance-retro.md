# 축구 당일 참석 명단 사후 변경 — 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기 생성 시점에 동결된 벤치 스냅샷 때문에 지각 참석자를 이미 만들어진 경기에 넣을 수 없던 문제를 없애고, 출전 기록이 있는 선수의 참석 해제를 차단한다.

**Architecture:** 벤치를 "저장된 `m.subs` 스냅샷"이 아니라 "현재 참석자에서 파생"으로 바꾼다. 파생 규칙은 두 가지다 — 표시·정정 후보는 `참석자 − 출전자`, 진행중 경기의 교체 후보는 `참석자 − 피치위 − 퇴장자`(교체아웃 선수는 재투입 가능해야 하므로 `− 출전자`를 못 씀). 두 규칙을 `soccerScoring.js`의 순수 헬퍼로 뽑아 유닛 테스트로 덮고, UI는 그걸 호출만 한다. 참석명단 편집은 경기 축에서 떼어내 상단 탭바 모달(일 축)로 옮긴다.

**Tech Stack:** React 18 (hooks, useReducer), Vite, Vitest, Firebase RTDB 동기화

**설계 문서:** `docs/superpowers/specs/2026-07-15-soccer-attendance-retro-design.md` (커밋 3940b28)

## Global Constraints

- **풋살 무손상.** 리듀서 액션 `TOGGLE_ATTENDEE`/`SET_ATTENDEES`는 풋살과 공용이므로 **변경 금지**. 풋살 `App.jsx` 변경 금지. 축구 전용 배선(`SoccerApp.jsx`의 `rosterHandlers`)에서만 가드한다.
- **리듀서 액션 신설/변경 없음.** 기존 `CORRECT_SOCCER_LINEUP`/`TOGGLE_ATTENDEE`/`SET_ATTENDEES`/`UPDATE_SOCCER_MATCH_FORMATION` 재사용.
- **시트 전송 포맷 변경 없음.** `our_members_json`은 `subs`를 안 읽으므로(`matchRowBuilder.js:88-97`) 이 작업은 통계에 영향이 없다.
- **`m.subs` 저장 필드 유지.** 의미적 소비처 2곳이 계속 읽는다: `CORRECT_SOCCER_LINEUP`(`useGameReducer.js:945`), 리듀서 revert(`:1013`).
- **`reconstructFormation`(`SoccerMatchView.jsx:73-114`) 변경 금지.** `:148`·`:240`의 레거시 승격이 그 반환값을 `m.subs`에 영속시키므로, 여기에 `attendees` 의존을 넣으면 파생값이 저장 데이터로 샌다.
- **선언 순서 육안 확인 필수.** 이 저장소는 RTL 하네스가 얕아 `build`/`vitest`가 렌더 크래시(TDZ 등)를 못 잡는다. JSX/컴포넌트 본문 편집 시 `const` 선언이 사용보다 앞서는지 눈으로 확인할 것.
- **D3는 D2의 전제.** D2 파생식의 정합성은 `출전자 ⊆ 참석자`에 의존한다(교체아웃 선수가 참석에서 빠지면 벤치에서 사라져 재투입 불가). **Task 3(D3)을 Task 5(D2)보다 먼저** 넣는다.
- 테스트: `npx vitest run`. 빌드: `npm run build`.
- 브랜치: `feat/soccer-attendance-retro`.

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/utils/soccerScoring.js` | 순수 도메인 계산. 벤치 파생 규칙 2종의 단일 소스 | 수정 (헬퍼 2개 추가) |
| `src/utils/__tests__/soccerScoring.benchCandidates.test.js` | 위 두 헬퍼의 유닛 테스트 | 생성 |
| `src/components/game/SoccerMatchView.jsx` | 경기 축 UI(라운드 네비·노드 본문). 일 축(참석) 책임을 여기서 **덜어낸다** | 수정 |
| `src/components/game/AttendeeSelector.jsx` | 참석 선택 UI(축구 전용). 표시만 담당, 정책은 호출부 | 수정 (`lockedNames` prop) |
| `src/components/game/FormationRecorder.jsx` | 진행중 경기 기록. `subs` 로컬 state를 파생으로 교체 | 수정 |
| `src/SoccerApp.jsx` | 축구 셸. 일 축(참석명단 모달) + 잠금 정책 배선 | 수정 |

---

## Task 1: 벤치 파생 규칙 순수 헬퍼 2종

두 규칙을 `soccerScoring.js`에 넣고 유닛 테스트로 완전히 덮는다. UI는 손대지 않으므로 이 태스크만으로 앱 동작은 그대로다.

**왜 헬퍼 2개인가:** 규칙이 다르다. 요약·정정 후보는 `참석자 − 출전자`(이미 뛴 사람은 정정 후보가 될 수 없음 — 중복 방지). 진행중 교체 후보는 `참석자 − 피치위 − 퇴장자`(교체아웃된 선수는 `출전자`지만 **다시 넣을 수 있어야** 하므로 `− 출전자`를 쓰면 안 됨).

**Files:**
- Modify: `src/utils/soccerScoring.js` (`getSoccerPlayedPlayers` 정의 바로 아래, 현재 `:93` 다음)
- Test: `src/utils/__tests__/soccerScoring.benchCandidates.test.js` (생성)

**Interfaces:**
- Consumes: 기존 `getSoccerPlayedPlayers(match) → string[]` (`soccerScoring.js:82`)
- Produces:
  - `getNonPlayers(match: object, attendees: string[]) → string[]` — Task 2가 씀
  - `getSubCandidates(attendees: string[], assignments: object, events: object[]) → string[]` — Task 5가 씀
  - `keepLockedAttendees(names: string[], locked: Set<string>|string[]) → string[]` — Task 3이 씀

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/soccerScoring.benchCandidates.test.js` 생성:

```js
import { describe, it, expect } from 'vitest';
import { getNonPlayers, getSubCandidates, keepLockedAttendees } from '../soccerScoring';

// 유저 정의: "참석자 전원에서 (스타팅멤버+교체출전자)를 제외한 나머지가 미출전".
// 핵심: 경기 생성 시점 스냅샷(m.subs)은 판정 근거가 아니다.
describe('getNonPlayers — 미출전 = 참석자 − 출전자', () => {
  it('참석자 중 출전 안 한 사람만 남긴다', () => {
    expect(getNonPlayers({ lineup: ['A', 'B'] }, ['A', 'B', 'C', 'D'])).toEqual(['C', 'D']);
  });

  it('경기 생성 후 참석 처리된 지각자도 후보로 나온다 (m.subs 무시)', () => {
    // 생성 시점 스냅샷엔 B가 없지만, 지금 참석자이므로 후보여야 한다 — 이 기능의 핵심.
    expect(getNonPlayers({ lineup: ['A'], subs: [] }, ['A', 'B'])).toEqual(['B']);
  });

  it('불참 처리된 벤치전용자는 m.subs에 남아 있어도 빠진다', () => {
    // C는 생성 시점 subs에 박혔지만 지금은 참석자가 아니므로 미출전이 아니다.
    expect(getNonPlayers({ lineup: ['A'], subs: ['C'] }, ['A', 'B'])).toEqual(['B']);
  });

  it('교체 투입된 선수는 출전이므로 미출전이 아니다', () => {
    const m = { lineup: ['A'], events: [{ type: 'sub', playerOut: 'A', playerIn: 'B' }] };
    expect(getNonPlayers(m, ['A', 'B', 'C'])).toEqual(['C']);
  });

  it('최종 배치(assignments)에만 있는 선수도 출전이다', () => {
    expect(getNonPlayers({ lineup: [], assignments: { 0: 'A' } }, ['A', 'B'])).toEqual(['B']);
  });

  it('휴식 경기(출전자 없음)는 참석자 전원이 미출전', () => {
    expect(getNonPlayers({ lineup: [], events: [] }, ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('attendees가 undefined/빈배열이면 빈배열 (표시 경로라 방어적)', () => {
    expect(getNonPlayers({ lineup: ['A'] }, undefined)).toEqual([]);
    expect(getNonPlayers({ lineup: ['A'] }, [])).toEqual([]);
  });
});

// 교체 후보는 미출전과 규칙이 다르다: 교체아웃된 선수는 출전자지만 재투입 가능해야 한다.
describe('getSubCandidates — 교체후보 = 참석자 − 피치위 − 퇴장자', () => {
  it('피치 위 선수는 후보가 아니다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A' }, [])).toEqual(['B']);
  });

  it('교체아웃된 선수는 후보로 복귀한다 (getNonPlayers와 다른 지점)', () => {
    // A는 lineup이라 '출전자'지만 피치를 떠났으므로 다시 넣을 수 있어야 한다.
    expect(getSubCandidates(['A', 'B'], { 0: 'B' }, [{ type: 'sub', playerOut: 'A', playerIn: 'B' }]))
      .toEqual(['A']);
  });

  it('레드카드 퇴장 선수는 후보가 아니다', () => {
    // 퇴장자는 assignments에서 지워지므로 onPitch에 없다 — expelled로 명시 배제해야 한다.
    expect(getSubCandidates(['A', 'B'], { 0: 'B' }, [{ type: 'redCard', player: 'A' }])).toEqual([]);
  });

  it('경기 도중 참석 처리된 지각자가 즉시 후보가 된다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A' }, [])).toEqual(['B']);
  });

  it('assignments의 빈 슬롯(null)은 무시한다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A', 1: null }, [])).toEqual(['B']);
  });

  it('events가 undefined여도 안전하다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A' }, undefined)).toEqual(['B']);
  });
});

// 해제 경로 3개 중 일괄 변경 2개(활동선수 전체 / 초기화)를 덮는다.
// 칩 탭(onToggle)은 SoccerApp에서 `if (locked.has(name)) return`으로 막고 브라우저 스모크로 확인.
describe('keepLockedAttendees — 일괄 변경에서 출전자 보존', () => {
  it('"활동선수 전체": 새 명단에 없는 출전자도 살아남는다', () => {
    // A가 오늘 뛰었는데 활동선수 목록엔 없는 경우(용병 등) — 조용히 빠지면 안 된다.
    expect(keepLockedAttendees(['B', 'C'], new Set(['A']))).toEqual(['B', 'C', 'A']);
  });

  it('"초기화": 출전자만 남는다', () => {
    expect(keepLockedAttendees([], new Set(['A', 'B']))).toEqual(['A', 'B']);
  });

  it('중복이 생기지 않는다', () => {
    expect(keepLockedAttendees(['A', 'B'], new Set(['A']))).toEqual(['A', 'B']);
  });

  it('잠금이 없으면 명단 그대로', () => {
    expect(keepLockedAttendees(['A', 'B'], new Set())).toEqual(['A', 'B']);
  });

  it('names가 undefined여도 안전하다', () => {
    expect(keepLockedAttendees(undefined, new Set(['A']))).toEqual(['A']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/soccerScoring.benchCandidates.test.js`
Expected: FAIL — `getNonPlayers is not a function` / `getSubCandidates is not a function` / `keepLockedAttendees is not a function`

- [ ] **Step 3: 헬퍼 구현**

`src/utils/soccerScoring.js` — `getSoccerPlayedPlayers` 함수가 닫히는 `}` 바로 아래(현재 `:93` 다음 빈 줄)에 삽입:

```js
/**
 * 미출전 = 참석자 − 출전자. 요약 표시와 라인업 편집기의 정정 후보가 공유한다.
 * 유저 정의: "참석자 전원에서 (스타팅멤버+교체출전자)를 제외한 나머지가 미출전".
 * 경기에 저장된 m.subs(생성 시점 스냅샷)는 의도적으로 안 본다 — 나중에 참석 처리된 지각자가
 * 포함돼야 하고, 불참 처리된 벤치전용자는 빠져야 하기 때문.
 * @param {object} match
 * @param {string[]} attendees - 오늘 참석자
 * @returns {string[]} 이 경기에 안 뛴 참석자
 */
export function getNonPlayers(match, attendees) {
  const played = new Set(getSoccerPlayedPlayers(match));
  return (attendees || []).filter(n => !played.has(n));
}

/**
 * 진행중 경기의 교체 후보 = 참석자 − 피치 위 − 퇴장자.
 * getNonPlayers와 규칙이 다르다: 교체아웃된 선수는 '출전자'지만 재투입 가능해야 하므로
 * '− 출전자'를 쓸 수 없다. 대신 지금 피치에 없는 참석자를 후보로 본다.
 * 퇴장자는 assignments에서 지워져 onPitch에 안 잡히므로 events에서 따로 배제한다.
 * attendees에 기본값을 두지 않는다 — prop 미연결 시 조용히 빈 벤치가 되는 대신 즉시 터뜨린다.
 * @param {string[]} attendees - 오늘 참석자
 * @param {object} assignments - 현재 배치 { posIdx: name }
 * @param {object[]} events - 경기 이벤트
 * @returns {string[]} 지금 투입 가능한 선수
 */
export function getSubCandidates(attendees, assignments, events) {
  const expelled = new Set((events || []).filter(e => e.type === "redCard").map(e => e.player));
  const onPitch = new Set(Object.values(assignments || {}).filter(Boolean));
  return attendees.filter(n => !onPitch.has(n) && !expelled.has(n));
}

/**
 * 참석 명단을 일괄 변경할 때 잠금 인원(오늘 출전 기록 보유자)을 보존한다.
 * "활동선수 전체"(onSetAll)와 "초기화"(onClear)가 공유 — 칩 탭만 막으면 이 둘로 뚫린다.
 * 초기화는 keepLockedAttendees([], locked)로 호출한다.
 * @param {string[]} names - 새로 지정하려는 명단
 * @param {Set<string>|string[]} locked - 해제 금지 인원
 * @returns {string[]}
 */
export function keepLockedAttendees(names, locked) {
  return [...new Set([...(names || []), ...locked])];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/soccerScoring.benchCandidates.test.js`
Expected: PASS — 18 tests

- [ ] **Step 5: 전체 테스트로 회귀 없음 확인**

Run: `npx vitest run`
Expected: 기존 테스트 전부 PASS (추가만 했으므로 회귀 없어야 함)

- [ ] **Step 6: 커밋**

```bash
git add src/utils/soccerScoring.js src/utils/__tests__/soccerScoring.benchCandidates.test.js
git commit -m "feat(soccer): 벤치 파생 규칙 순수 헬퍼 getNonPlayers/getSubCandidates 추가

미출전=참석자−출전자, 교체후보=참석자−피치위−퇴장자. m.subs 스냅샷 미참조.
호출부 배선은 후속 커밋."
```

---

## Task 2: D1 — 미출전·정정 후보를 참석자 기준으로 전환

`SoccerMatchView`의 두 읽기 지점을 `getNonPlayers`로 바꾼다. 이걸로 **이미 뛴 경기에 지각자를 정정 투입**할 수 있게 된다(요구 2의 절반).

**Files:**
- Modify: `src/components/game/SoccerMatchView.jsx` (`:3` import, `:190-192`, `:313-314`)

**Interfaces:**
- Consumes: `getNonPlayers(match, attendees)` (Task 1)
- Produces: 없음 (UI 배선)

- [ ] **Step 1: import에 `getNonPlayers` 추가**

`src/components/game/SoccerMatchView.jsx:3` 을 찾아서:

```js
import { calcSoccerScore, getCleanSheetPlayers, getSoccerPlayedPlayers, soccerResultLabel } from '../../utils/soccerScoring';
```

다음으로 교체:

```js
import { calcSoccerScore, getCleanSheetPlayers, getSoccerPlayedPlayers, getNonPlayers, soccerResultLabel } from '../../utils/soccerScoring';
```

- [ ] **Step 2: 라인업 편집기의 정정 후보 전환**

`:190-192` 의 다음 3줄을 찾아서:

```js
    const fm = reconstructFormation(m);
    const played = getSoccerPlayedPlayers(m); // lineup ∪ sub-in ∪ assignments — 단일 소스
    const bench = (fm.subs || []).filter(n => !played.includes(n)); // 뛴(교체out) 선수 제외 — CORRECT 중복 방지
```

다음으로 교체 (`played`는 여기서만 쓰이므로 함께 제거):

```js
    const fm = reconstructFormation(m);
    // 정정 후보 = 참석자 − 출전자. m.subs(생성 시점 스냅샷) 대신 현재 참석자를 본다 —
    // 나중에 참석 처리된 지각자도 후보가 돼야 하기 때문. 출전자 제외는 CORRECT 중복 방지.
    const bench = getNonPlayers(m, attendees);
```

- [ ] **Step 3: 종료 경기 요약의 "미출전" 전환**

`:313-314` 의 다음 2줄을 찾아서:

```js
        const played = fm ? getSoccerPlayedPlayers(node) : [];
        const benchNeverPlayed = fm ? (fm.subs || []).filter(n => !played.includes(n)) : [];
```

다음으로 교체 (`played`는 `:330-332`의 "출전" 표시가 계속 쓰므로 **유지**):

```js
        const played = fm ? getSoccerPlayedPlayers(node) : [];
        const benchNeverPlayed = fm ? getNonPlayers(node, attendees) : [];
```

- [ ] **Step 4: `getSoccerPlayedPlayers` import가 여전히 필요한지 확인**

Run: `grep -n "getSoccerPlayedPlayers" src/components/game/SoccerMatchView.jsx`
Expected: `:3`(import)과 `:313` 부근(요약의 `played`) 최소 2건. 0건이면 import를 지울 것.

- [ ] **Step 5: 빌드 + 전체 테스트**

Run: `npm run build && npx vitest run`
Expected: 빌드 성공, 테스트 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): 미출전·정정후보를 참석자 기준으로 전환 (D1)

m.subs 생성시점 스냅샷 대신 getNonPlayers(참석자−출전자) 사용.
이미 뛴 경기에도 지각 참석자를 정정 투입할 수 있게 됨."
```

---

## Task 3: D3 — 출전 기록 있는 선수의 참석 해제 차단 (3경로)

`AttendeeSelector`에는 해제 경로가 3개다. 칩 탭만 막으면 나머지 둘로 뚫린다.

| 경로 | 현재 코드 | 위험 |
|---|---|---|
| 칩 탭 (`AttendeeSelector.jsx:32`) | `onClick={() => onToggle(p.name)}` | 개별 해제 |
| `활동선수 전체` (`:23`) | `onSetAll(...)` | 명단 통째 교체 → 출전자 조용히 누락 |
| `초기화` (`:24`) | `onClear` | 전멸 |

정책은 `SoccerApp.jsx`의 축구 전용 `rosterHandlers`가 최종 방어선이고, `AttendeeSelector`는 표시만 한다(풋살 공용 리듀서 액션은 불변).

**Files:**
- Modify: `src/SoccerApp.jsx` (`:21-26` import, soccerStats useMemo 아래에 `locked` 추가, `:466-474` rosterHandlers)
- Modify: `src/components/game/AttendeeSelector.jsx` (`lockedNames` prop + 🔒 표시)

**Interfaces:**
- Consumes: `getSoccerPlayedPlayers(match)` (기존)
- Produces: `locked: Set<string>` (SoccerApp 지역 변수 — Task 4의 모달이 `lockedNames={[...locked]}`로 씀)

- [ ] **Step 1: SoccerApp에 `getSoccerPlayedPlayers` import 추가**

`src/SoccerApp.jsx:21-26` 의 import 블록을 찾아서:

```js
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint,
  calcSoccerTeamRecord, calcSoccerOpponentRecords,
  buildEventLogRows, buildPointLogRows, buildPlayerLogRows,
  countFinishedSoccerMatches,
} from './utils/soccerScoring';
```

다음으로 교체:

```js
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint,
  calcSoccerTeamRecord, calcSoccerOpponentRecords,
  buildEventLogRows, buildPointLogRows, buildPlayerLogRows,
  countFinishedSoccerMatches, getSoccerPlayedPlayers, keepLockedAttendees,
} from './utils/soccerScoring';
```

- [ ] **Step 2: `locked` 파생 추가**

`src/SoccerApp.jsx` 의 `const soccerStats = useMemo(() => {` 로 시작하는 블록을 찾고, **그 블록이 닫히는 곳 바로 아래**에 삽입한다. (`:143`의 `const sortedPlayers = useMemo(...)` 와 `:150`의 `const soccerStats = useMemo(...)` 사이 스타일을 따를 것.)

```js
  // ── 참석 해제 잠금: 오늘 한 경기라도 뛴 선수 ──
  // "출전했는데 불참 처리"라는 모순을 예방(유저 요구). 조기 귀가해도 뛴 기록은 남으므로 해제 금지.
  // 이 잠금은 D2(교체후보 = 참석자 − 피치위 − 퇴장자)의 정합성 전제이기도 하다 —
  // 교체아웃된 선수가 참석에서 빠지면 벤치에서 사라져 재투입이 불가능해진다.
  // 축구 전용 파생: 리듀서(풋살 공용)는 건드리지 않는다.
  const locked = useMemo(() => {
    const s = new Set();
    for (const m of state.soccerMatches || []) for (const n of getSoccerPlayedPlayers(m)) s.add(n);
    return s;
  }, [state.soccerMatches]);
```

**선언 순서 확인:** `locked`는 `:415`의 `if (phase === "match")` 블록보다 위에 있어야 한다. `soccerStats` 아래면 조건을 만족한다.

- [ ] **Step 3: rosterHandlers를 3경로 모두 감싸도록 수정**

`src/SoccerApp.jsx:466-474` 의 다음 블록을 찾아서:

```jsx
            rosterHandlers={{
              onSyncSheet: syncAttendance,
              onToggle: (name) => dispatch({ type: 'TOGGLE_ATTENDEE', name }),
              onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: names }),
              onClear: () => set('attendees', []),
              onToggleSort: () => set('playerSortMode', playerSortMode === "point" ? "name" : "point"),
              onAddManual: (name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }),
              newPlayer, onNewPlayerChange: (v) => set('newPlayer', v),
              attendanceLoading,
            }}
```

다음으로 교체 — 세 경로 전부 `locked`를 보존한다. `onClear`는 잠금 인원을 남겨야 하므로 `set('attendees', [])`에서 `SET_ATTENDEES`로 바꾼다:

```jsx
            rosterHandlers={{
              onSyncSheet: syncAttendance,
              // 출전 기록이 있으면 해제 불가(D3). 추가는 언제나 허용 — 지각 참석 처리가 이 기능의 핵심.
              onToggle: (name) => { if (locked.has(name)) return; dispatch({ type: 'TOGGLE_ATTENDEE', name }); },
              // 통째 교체·초기화도 잠금 인원은 남긴다 — 칩만 막으면 이 둘로 뚫린다.
              // 초기화는 "빈 명단 + 잠금 보존"이라 같은 헬퍼로 표현된다.
              onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: keepLockedAttendees(names, locked) }),
              onClear: () => dispatch({ type: 'SET_ATTENDEES', attendees: keepLockedAttendees([], locked) }),
              onToggleSort: () => set('playerSortMode', playerSortMode === "point" ? "name" : "point"),
              onAddManual: (name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }),
              newPlayer, onNewPlayerChange: (v) => set('newPlayer', v),
              attendanceLoading,
            }}
```

**주의:** `:341-351`의 setup 단계 `AttendeeSelector`는 **건드리지 않는다.** 그 시점 `soccerMatches`가 비어 `locked`가 항상 공집합이라 가드가 무의미하다.

- [ ] **Step 4: AttendeeSelector에 `lockedNames` 표시 추가**

`src/components/game/AttendeeSelector.jsx` 의 시그니처(`:7-11`)를 찾아서:

```jsx
export default function AttendeeSelector({
  attendees, sortedPlayers, playerSortMode,
  onSyncSheet, onToggle, onSetAll, onClear, onToggleSort,
  onAddManual, newPlayer, onNewPlayerChange, attendanceLoading, styles: s,
}) {
  const { C } = useTheme();
```

다음으로 교체 (기본값 `[]` — 이 prop을 안 주는 setup 단계 호출부는 그대로 동작):

```jsx
export default function AttendeeSelector({
  attendees, sortedPlayers, playerSortMode, lockedNames = [],
  onSyncSheet, onToggle, onSetAll, onClear, onToggleSort,
  onAddManual, newPlayer, onNewPlayerChange, attendanceLoading, styles: s,
}) {
  const { C } = useTheme();
  // 표시 전용. 실제 차단은 호출부(SoccerApp의 rosterHandlers)가 최종 방어선이라
  // 여기가 뚫려도 데이터는 안전하다.
  const locked = new Set(lockedNames);
```

- [ ] **Step 5: 칩 렌더에 🔒 반영**

`src/components/game/AttendeeSelector.jsx:30-36` 의 다음 블록을 찾아서:

```jsx
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {sortedPlayers.map(p => (
            <div key={p.name} onClick={() => onToggle(p.name)} style={s.chip(attendees.includes(p.name))}>
              <span>{p.name}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{p.point}p</span>
            </div>
          ))}
        </div>
```

다음으로 교체:

```jsx
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {sortedPlayers.map(p => {
            const isLocked = locked.has(p.name);
            return (
              <div key={p.name}
                onClick={() => { if (!isLocked) onToggle(p.name); }}
                title={isLocked ? "출전 기록이 있어 불참으로 바꿀 수 없습니다" : undefined}
                style={{ ...s.chip(attendees.includes(p.name)), cursor: isLocked ? "not-allowed" : "pointer" }}>
                <span>{isLocked ? "🔒 " : ""}{p.name}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{p.point}p</span>
              </div>
            );
          })}
        </div>
        {lockedNames.length > 0 && (
          <div style={{ fontSize: 11, color: C.gray, marginTop: 8 }}>
            🔒 = 오늘 출전 기록이 있어 해제할 수 없습니다 ({lockedNames.length}명)
          </div>
        )}
```

- [ ] **Step 6: 빌드 + 전체 테스트**

Run: `npm run build && npx vitest run`
Expected: 빌드 성공, 테스트 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/SoccerApp.jsx src/components/game/AttendeeSelector.jsx
git commit -m "feat(soccer): 출전 기록 있는 선수의 참석 해제 차단 (D3)

toggle/setAll/clear 3경로 전부 rosterHandlers에서 잠금 보존.
AttendeeSelector는 lockedNames prop(기본 [])으로 표시만 담당 — 풋살 무영향.
D2 파생식의 정합성 전제(출전자 ⊆ 참석자)이기도 함."
```

---

## Task 4: D4 — 참석명단을 상단 탭바 모달로 이동 + D5 네이밍

일 축(참석)을 경기 축(출전)에서 물리적으로 분리한다. 모달은 `SoccerApp` 레벨이라 `SoccerMatchView`/`FormationRecorder`를 언마운트하지 않는다 → 진행중 경기에서 참석을 고쳐도 goalFlow 골 유실이 **구조적으로** 없다.

**Files:**
- Modify: `src/SoccerApp.jsx` (rosterHandlers 추출, 탭 추가, 모달 추가)
- Modify: `src/components/game/SoccerMatchView.jsx` (editRoster 서브플로우·명단수정 버튼·prop 제거, 버튼 이름)

**Interfaces:**
- Consumes: `locked` (Task 3)
- Produces: 없음

- [ ] **Step 1: rosterHandlers를 상수로 추출**

모달과 `SoccerMatchView`가 같이 쓸 수 없는 인라인 객체라 먼저 뺀다. `src/SoccerApp.jsx` 의 Task 3에서 수정한 `rosterHandlers={{ ... }}` 블록 전체를 찾아, **`if (phase === "match") {` 블록 안, `return (` 보다 위**(`:407`의 `const deleteSoccerGame` 아래가 적당)로 옮겨 상수로 만든다:

```js
    const rosterHandlers = {
      onSyncSheet: syncAttendance,
      // 출전 기록이 있으면 해제 불가(D3). 추가는 언제나 허용 — 지각 참석 처리가 이 기능의 핵심.
      onToggle: (name) => { if (locked.has(name)) return; dispatch({ type: 'TOGGLE_ATTENDEE', name }); },
      // 통째 교체·초기화도 잠금 인원은 남긴다 — 칩만 막으면 이 둘로 뚫린다.
      // 초기화는 "빈 명단 + 잠금 보존"이라 같은 헬퍼로 표현된다.
      onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: keepLockedAttendees(names, locked) }),
      onClear: () => dispatch({ type: 'SET_ATTENDEES', attendees: keepLockedAttendees([], locked) }),
      onToggleSort: () => set('playerSortMode', playerSortMode === "point" ? "name" : "point"),
      onAddManual: (name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }),
      newPlayer, onNewPlayerChange: (v) => set('newPlayer', v),
      attendanceLoading,
    };
```

그리고 `<SoccerMatchView ... />` 에서 `rosterHandlers={{...}}` prop 줄 전체를 **삭제**한다 (Step 5에서 `SoccerMatchView`가 이 prop을 더는 안 받게 된다).

- [ ] **Step 2: 탭바에 `참석명단` 추가**

`src/SoccerApp.jsx:419-425` 의 `<MatchTabBar tabs={[ ... ]} />` 에서 `playerStats` 줄 다음에 한 줄 추가:

```jsx
            { key: 'playerStats', label: '개인기록', onClick: () => set('matchModal', 'playerStats') },
            { key: 'roster', label: `참석명단 ${attendees.length}`, onClick: () => set('matchModal', 'roster') },
```

- [ ] **Step 3: 참석명단 모달 추가**

`src/SoccerApp.jsx` 의 `{matchModal === "playerStats" && (` 로 시작하는 블록이 닫히는 `)}` 바로 아래(`:458` 부근, `<div style={s.section}>` 위)에 삽입:

```jsx
        {matchModal === "roster" && (
          <Modal onClose={() => set('matchModal', null)} title="참석명단" maxWidth={500}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
              참석 {attendees.length}명 · 참석 여부만 바꿉니다.
              이미 기록된 경기의 출전 선수는 그 경기에서 "🔁 출전 수정"으로 고치세요.
            </div>
            <AttendeeSelector
              attendees={attendees} sortedPlayers={sortedPlayers} playerSortMode={playerSortMode}
              lockedNames={[...locked]} {...rosterHandlers} styles={s} />
          </Modal>
        )}
```

- [ ] **Step 4: `SoccerMatchView`의 editRoster 서브플로우 제거**

`src/components/game/SoccerMatchView.jsx:175-184` 의 다음 블록 **전체를 삭제**:

```jsx
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
```

- [ ] **Step 5: 안 쓰는 import와 prop 제거**

`:14` 의 다음 줄을 **삭제**:

```jsx
import AttendeeSelector from './AttendeeSelector';
```

`:24` 의 다음 줄을 찾아서:

```jsx
  sortedPlayers, playerSortMode, rosterHandlers,
```

다음으로 교체 (셋 다 `:181`의 AttendeeSelector에서만 쓰였고 그 블록을 Step 4에서 지웠다):

```jsx
```

즉 **줄 전체 삭제**. `attendees`(`:19`)는 **유지** — `:120`, D1의 `:192`/`:314`, Task 5의 레코더 전달이 쓴다.

- [ ] **Step 6: viewState의 editRoster 분기 제거**

`:30-32` 의 다음 블록을 찾아서:

```jsx
  const [viewState, setViewState] = useState(() =>
    (savedFormation?.viewState === "formation" || savedFormation?.viewState === "editRoster")
      ? savedFormation.viewState : "selectOpponent");
```

다음으로 교체:

```jsx
  const [viewState, setViewState] = useState(() =>
    savedFormation?.viewState === "formation" ? savedFormation.viewState : "selectOpponent");
```

`:41-46` 의 다음 블록을 찾아서:

```jsx
  useEffect(() => {
    const v = savedFormation?.viewState;
    if (v === "formation" || v === "editRoster") {
      setViewState(local => local === "editRoster" ? local : v);
    }
  }, [savedFormation?.viewState]);
```

다음으로 교체:

```jsx
  useEffect(() => {
    if (savedFormation?.viewState === "formation") setViewState("formation");
  }, [savedFormation?.viewState]);
```

- [ ] **Step 7: 새 경기 노드의 `👥 명단 수정` 버튼 제거**

`:272-277` 의 다음 블록 **전체를 삭제** (참석은 이제 상단 탭바에 있다):

```jsx
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button onClick={() => setViewState("editRoster")}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
              👥 명단 수정 ({attendees.length})
            </button>
          </div>
```

- [ ] **Step 8: D5 — `라인업 변경` → `출전 수정`**

`:259` 의 다음 줄을 찾아서:

```jsx
            🔁 라인업 변경
```

다음으로 교체 (앱이 이미 쓰는 `출전`/`미출전` 용어와 맞춘다 — `LineupEditView.jsx:41,47`, `SoccerMatchView.jsx:332`):

```jsx
            🔁 출전 수정
```

- [ ] **Step 9: 잔여 참조 전수 확인**

Run:
```bash
grep -n "editRoster\|rosterHandlers\|sortedPlayers\|playerSortMode\|AttendeeSelector" src/components/game/SoccerMatchView.jsx
```
Expected: **0건.** 하나라도 남으면 참조 오류이므로 그 줄을 마저 정리할 것.

- [ ] **Step 10: 선언 순서 육안 확인 (필수)**

`src/SoccerApp.jsx` 에서 `locked`(Task 3)와 `rosterHandlers`(Step 1)가 **`return (` 보다 위**에 선언됐는지 눈으로 확인한다. 이 저장소는 렌더 크래시(TDZ)를 `build`/`vitest`가 못 잡는다.

- [ ] **Step 11: 빌드 + 전체 테스트**

Run: `npm run build && npx vitest run`
Expected: 빌드 성공, 테스트 전부 PASS

- [ ] **Step 12: 커밋**

```bash
git add src/SoccerApp.jsx src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): 참석명단을 상단 탭바 모달로 분리, 라인업 변경→출전 수정 (D4/D5)

일 축(참석)을 경기 축(출전)에서 분리. editRoster viewState 서브플로우 삭제.
모달이 SoccerApp 레벨이라 레코더를 언마운트하지 않아 goalFlow 골 유실 위험 소멸."
```

---

## Task 5: D2 — 진행중 경기 교체 후보를 참석자에서 파생

**요구 핵심:** "진행중인 경기장안에서도 불참인원중 참석으로 변경하여 교체처리 가능하도록."

**왜 파생인가:** `useState(initSubs)`는 최초 1회만 시드되고 `key={matchIdx}`로만 remount된다(`SoccerMatchView.jsx:292`). `initSubs`의 출처인 `reconstructFormation`의 modern 경로는 `subs: m.subs || []`(`:75`) — 경기 생성 시점 스냅샷이다. 즉 remount를 시켜도 신규 참석자는 나오지 않는다. 파생만이 답이다.

**민감 컴포넌트 경고:** `FormationRecorder`는 `goalFlow`(리듀서 미도달 로컬 state)를 들고 있고 `revertSubInFormation`을 리듀서와 공유한다. 이 플랜에서 **유일하게 위험이 늘어난 지점**이다.

**Files:**
- Modify: `src/components/game/FormationRecorder.jsx` (`:3` import, `:12-16` 시그니처, `:21` state 제거, `:37` 뒤 파생, `:127`·`:248` setSubs 제거)
- Modify: `src/components/game/SoccerMatchView.jsx` (`:294` 호출부)

**Interfaces:**
- Consumes: `getSubCandidates(attendees, assignments, events)` (Task 1)
- Produces: 없음

- [ ] **Step 1: import에 `getSubCandidates` 추가**

`src/components/game/FormationRecorder.jsx:3` 의 다음 줄을 찾아서:

```js
import { FORMATIONS, FORMATION_KEYS, swapFormationSlots, defendersFromPositionMap, revertSubInFormation } from '../../utils/formations';
```

바로 아래에 추가 (`soccerScoring`에서 오므로 별도 import):

```js
import { getSubCandidates } from '../../utils/soccerScoring';
```

- [ ] **Step 2: 시그니처에서 `subs: initSubs` 빼고 `attendees` 넣기**

`:12-16` 의 다음 블록을 찾아서:

```jsx
export default function FormationRecorder({
  formation: initFormation, assignments: initAssignments, positionMap: initPositionMap,
  subs: initSubs, gk: initGk, opponent, startedAt, matchMinutes = 90,
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange, onFlowActiveChange,
}) {
```

다음으로 교체:

```jsx
// `attendees`에 기본값을 주지 않는 것은 의도다 — 미연결 시 조용히 빈 벤치가 되면 발견이 어렵다.
// undefined가 되는 경로는 prop 미연결(구현 실수)뿐이며, RTDB 빈배열 함정은
// firebaseSyncDiff.js:357의 `attendees: raw.attendees || []`가 단일 지점에서 이미 막는다.
export default function FormationRecorder({
  formation: initFormation, assignments: initAssignments, positionMap: initPositionMap,
  gk: initGk, attendees, opponent, startedAt, matchMinutes = 90,
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange, onFlowActiveChange,
}) {
```

- [ ] **Step 3: `subs` 로컬 state 제거**

`:21` 의 다음 줄을 **삭제**:

```jsx
  const [subs, setSubs] = useState(initSubs || []);
```

- [ ] **Step 4: 파생 `subs` 추가 (선언 순서 주의)**

`:37` 의 다음 줄을 찾아서:

```jsx
  const events = Array.isArray(initEvents) ? initEvents : [];
```

바로 아래에 추가:

```jsx
  // 교체 후보 = 참석자 − 피치위 − 퇴장자. 로컬 state가 아니라 파생 —
  // useState(prop) 시드는 최초 1회뿐이라 경기 도중 참석 처리된 선수를 영영 못 받는다
  // (이 저장소가 과거 CourtRecorder GK에서 겪은 안티패턴).
  // 교체 시 나간 선수는 assignments를 떠나므로 자동으로 후보에 복귀한다.
  const subs = getSubCandidates(attendees, assignments, events);
```

**선언 순서 확인 (필수):** `assignments`(`:19` useState)와 `events`(`:37`)가 이 줄보다 **위**에 있어야 한다. `subs`를 쓰는 곳은 전부 핸들러/JSX 내부라 본문 실행 후에 돌아가므로 여기 위치면 안전하다.

- [ ] **Step 5: `handleSubIn`의 `setSubs` 제거 (onStateChange는 유지)**

`:126-127` 의 다음 2줄을 찾아서:

```jsx
    const newSubs = [...subs.filter(n => n !== subName), subOut.name];
    setAssignments(newAssignments);
    setPositionMap(newPosMap);
    setSubs(newSubs);
```

다음으로 교체 — `newSubs`는 `:131`의 `onStateChange`가 계속 써야 하므로 **남긴다**(`m.subs` 저장 계약 유지). 다음 렌더의 파생값과 집합적으로 동일하다: `attendees − (onPitch − subOut + subIn) − expelled = subs − subIn + subOut`.

```jsx
    // newSubs는 onStateChange로 m.subs를 갱신하기 위해 유지(CORRECT_SOCCER_LINEUP/리듀서 revert가 읽음).
    // 로컬 setSubs는 없다 — subs는 assignments에서 파생되므로 다음 렌더에 자동 반영된다.
    const newSubs = [...subs.filter(n => n !== subName), subOut.name];
    setAssignments(newAssignments);
    setPositionMap(newPosMap);
```

- [ ] **Step 6: 교체 삭제 경로의 `setSubs` 제거**

`:244-250` 의 다음 블록을 찾아서:

```jsx
                  const reverted = revertSubInFormation({ assignments, positionMap, subs, gk }, e);
                  if (reverted) {
                    setAssignments(reverted.assignments);
                    setPositionMap(reverted.positionMap);
                    setSubs(reverted.subs);
                    setGk(reverted.gk);
                  }
```

다음으로 교체:

```jsx
                  const reverted = revertSubInFormation({ assignments, positionMap, subs, gk }, e);
                  if (reverted) {
                    setAssignments(reverted.assignments);
                    setPositionMap(reverted.positionMap);
                    // reverted.subs는 의도적으로 버린다 — subs는 파생이라 되돌려진 assignments에서
                    // 자동 재계산된다. m.subs는 리듀서(DELETE_SOCCER_EVENT)가 독립적으로 되돌린다.
                    // setSubs를 되살리지 말 것 = useState(prop) 안티패턴 회귀.
                    setGk(reverted.gk);
                  }
```

- [ ] **Step 7: 호출부에서 `subs` 빼고 `attendees` 넣기**

`src/components/game/SoccerMatchView.jsx:293-294` 의 다음 2줄을 찾아서:

```jsx
            formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
            subs={live.subs} gk={live.gk} opponent={currentMatch.opponent}
```

다음으로 교체 (`attendees`는 `:19`에서 이미 받고 있다):

```jsx
            formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
            gk={live.gk} attendees={attendees} opponent={currentMatch.opponent}
```

- [ ] **Step 8: `setSubs` 잔여 확인**

Run: `grep -n "setSubs\|initSubs" src/components/game/FormationRecorder.jsx`
Expected: **0건.** 남으면 참조 오류다.

- [ ] **Step 9: 기존 레코더 스모크 테스트를 새 계약에 맞추기**

이 테스트는 `renderToStaticMarkup`으로 실제 렌더를 돌리므로, `attendees`에 기본값이 없는 새 시그니처에서는 **반드시 깨진다**(`attendees.filter`가 undefined에서 터짐). 그게 정상이다.

`src/components/game/__tests__/FormationRecorder.smoke.test.jsx:13-16` 의 다음 블록을 찾아서:

```js
  createElement(FormationRecorder, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, positionMap: { GK1: 'GK', D1: 'DF' },
    subs: ['BN1'], gk: 'GK1', opponent: '상대', startedAt: 1, events: [],
    onAddEvent(){}, onDeleteEvent(){}, onFinishMatch(){}, onStateChange(){}, onFlowActiveChange(){}, ...props,
  })));
```

다음으로 교체 — `subs` prop을 `attendees`로 바꾸되, 파생 결과가 기존과 같도록 **피치 위 선수(GK1, D1) + 벤치(BN1)** 를 모두 참석자로 넣는다 (파생: `['GK1','D1','BN1'] − {GK1,D1} − {} = ['BN1']` = 기존 `subs`와 동일):

```js
  createElement(FormationRecorder, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, positionMap: { GK1: 'GK', D1: 'DF' },
    attendees: ['GK1', 'D1', 'BN1'], gk: 'GK1', opponent: '상대', startedAt: 1, events: [],
    onAddEvent(){}, onDeleteEvent(){}, onFinishMatch(){}, onStateChange(){}, onFlowActiveChange(){}, ...props,
  })));
```

Run: `npx vitest run src/components/game/__tests__/FormationRecorder.smoke.test.jsx`
Expected: PASS

**이 테스트가 지키는 것과 못 지키는 것:** 이 테스트는 `FormationRecorder` **자체**가 새 계약으로 렌더되는 것만 보장한다. `SoccerMatchView`가 `attendees={attendees}`를 실제로 넘기는지는 **못 잡는다**(테스트가 자기 props를 직접 주므로). 그 배선은 Task 6 스모크 1번에서만 잡힌다 — 건너뛰지 말 것.

- [ ] **Step 10: 빌드 + 전체 테스트**

Run: `npm run build && npx vitest run`
Expected: 빌드 성공, 테스트 전부 PASS

- [ ] **Step 11: 커밋**

```bash
git add src/components/game/FormationRecorder.jsx src/components/game/SoccerMatchView.jsx src/components/game/__tests__/FormationRecorder.smoke.test.jsx
git commit -m "feat(soccer): 진행중 경기 교체 후보를 참석자에서 파생 (D2)

useState(initSubs) 제거 → getSubCandidates(참석자−피치위−퇴장자).
경기 도중 참석 처리된 선수가 즉시 교체 후보가 된다.
레드카드 퇴장 선수 재투입 결함도 함께 해소(expelled 명시 배제)."
```

---

## Task 6: 브라우저 스모크 (설계 문서 §5)

이 저장소는 RTL 하네스가 얕아 `build`/`vitest`가 렌더 크래시를 못 잡는다. **실제로 눌러서** 확인한다.

**Files:** 없음 (검증만)

- [ ] **Step 1: 앱 기동**

Run: `npm run dev`
축구 모드로 경기를 하나 만들고 진행중 상태로 둔다.

- [ ] **Step 2: 스모크 6항목 — 하나라도 실패하면 멈추고 보고**

1. **진행중 경기 화면 진입** — 레코더가 렌더되는가. `attendees` prop 미연결이면 `attendees.filter`가 `TypeError`로 즉시 크래시한다. 콘솔에 에러 0건이어야 한다.
2. **핵심 요구** — 상단 `참석명단 N` 탭 → 모달에서 불참자 B를 참석으로 → 닫고 → 교체 모달을 열면 **B가 후보에 뜨는가.**
3. **교체** — 교체 실행 후 나간 선수가 후보로 **복귀**하는가.
4. **교체 삭제** — 교체 이벤트 ✕ → 배치가 되돌려지고 후보 목록도 같이 되돌아가는가.
5. **레드카드** — 퇴장시킨 선수가 교체 후보에 **안 뜨는가.**
6. **잠금** — 참석명단 모달에서 출전한 선수에 🔒가 붙고 눌러도 안 빠지는가. `활동선수 전체`·`초기화`를 눌러도 **출전자가 남는가.**

- [ ] **Step 3: 종료 경기 쪽도 확인**

경기를 마감하고 이전 경기 노드로 이동 → `🔁 출전 수정`(이름 바뀐 것 확인) → 벤치에 B가 뜨는가 → 치환 정정이 되는가. 요약의 `미출전:` 목록에 B가 들어가는가.

- [ ] **Step 4: 결과 보고**

통과 항목과 실패 항목을 실제 관찰 내용으로 보고한다. 추측 금지 — 못 돌렸으면 못 돌렸다고 말할 것.

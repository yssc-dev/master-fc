# 균등 자동 스케줄 (Balanced Auto-Schedule) 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자유대진 모드 진행 중 임의의 시점에 균등한 라운드 묶음(=segment)을 자동 생성해 schedule에 append하는 기능을 추가한다. 4·5팀에서만 활성화하고, 코트 수는 매 segment마다 가변 입력 가능하다.

**Architecture:** 핵심은 `matchMode='free'`를 유지한 채 기존 `schedule` 배열에 라운드를 누적 append하는 모델. 알고리즘은 기존 `generateRoundRobin`을 cycles 횟수만큼 반복. App.jsx의 분기 조건을 `shouldShowSchedule` 헬퍼로 정리해 기존 대진표/푸시 모드 동작을 보존한다.

**Tech Stack:** React 19 + Vite + Vitest, 기존 `src/utils/brackets.js` / `src/hooks/useGameReducer.js` / `src/components/game/ScheduleModal.jsx` 위에 증분 변경.

**Spec:** `docs/superpowers/specs/2026-05-28-balanced-auto-schedule-design.md` (v1.2)

---

## File Structure

| 파일 | 액션 | 책임 |
|---|---|---|
| `src/utils/balancedSchedule.js` | 신규 | 알고리즘: `generateBalancedSegment` + `countCurrentMatchesPerTeam` + `estimateMatchMinutes` |
| `src/utils/__tests__/balancedSchedule.test.js` | 신규 | §4.4 표 케이스 단위 테스트 |
| `src/hooks/useGameReducer.js` | 수정 | `APPEND_SCHEDULE_SEGMENT` 액션 추가 |
| `src/hooks/__tests__/useGameReducer.appendSchedule.test.js` | 신규 | 액션 검증 케이스 |
| `src/components/game/BalancedScheduleModal.jsx` | 신규 | 입력 UI + 미리보기 + 라이브 매치 가드 |
| `src/components/game/ScheduleModal.jsx` | 수정 | 빈 상태, 자동설정 버튼, formatDesc 확장, 자유 매치 안내 |
| `src/App.jsx` | 수정 | `shouldShowSchedule` 헬퍼, allRoundsComplete/confirmRound 조건 완화, BalancedScheduleModal 통합 |

원칙: 한 파일 변경 = 한 책임. App.jsx 변경은 §5.4의 6개 지점을 헬퍼 변수로 묶어 회귀 위험 최소화.

---

## Task 1: Balanced schedule 알고리즘 (TDD)

**Files:**
- Create: `src/utils/balancedSchedule.js`
- Test: `src/utils/__tests__/balancedSchedule.test.js`

- [ ] **Step 1.1: 실패 테스트 작성 — 5팀 2코트 1사이클**

Create `src/utils/__tests__/balancedSchedule.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateBalancedSegment } from '../balancedSchedule';

describe('generateBalancedSegment', () => {
  it('5팀 2코트 1사이클 — 5라운드 × 2매치, 각 팀 4경기, 각 팀 1번 휴식', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 2, cycles: 1 });
    expect(result.length).toBe(5); // 5라운드
    // 각 라운드 2매치
    result.forEach(round => expect(round.matches.length).toBe(2));
    // 총 10매치
    const totalMatches = result.reduce((sum, r) => sum + r.matches.length, 0);
    expect(totalMatches).toBe(10);
    // 각 팀 출전 수 = 4
    const counts = [0, 0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([4, 4, 4, 4, 4]);
    // 각 라운드 내 팀 충돌 없음
    result.forEach(round => {
      const teams = round.matches.flat();
      expect(new Set(teams).size).toBe(teams.length);
    });
  });
});
```

- [ ] **Step 1.2: 테스트 실행 — 실패 확인**

Run: `npm test -- src/utils/__tests__/balancedSchedule.test.js`
Expected: FAIL with "Cannot resolve module '../balancedSchedule'"

- [ ] **Step 1.3: 알고리즘 구현**

Create `src/utils/balancedSchedule.js`:

```js
import { generateRoundRobin } from './brackets';

/**
 * 균등 자동 스케줄 라운드 묶음 생성.
 * 4·5팀에 한정. 6팀+ / 3팀은 호출 시점에서 막혀야 함(UI 책임).
 *
 * @param {Object} args
 * @param {number} args.teamCount - 팀 수 (4 또는 5)
 * @param {number} args.courtCount - 1 또는 2
 * @param {number} args.cycles - 반복 횟수 (1, 2, 3 ...)
 * @returns {Array<{matches: Array<[number, number]>}>} schedule에 append할 라운드 배열
 */
export function generateBalancedSegment({ teamCount, courtCount, cycles }) {
  const pool = generateRoundRobin(Array.from({ length: teamCount }, (_, i) => i));
  // pool[r] = 라운드 r의 동시 매치 배열 (circle method)

  const oneCycle = courtCount >= 2
    ? pool.map(round => ({ matches: round }))
    : pool.flatMap(round => round.map(m => ({ matches: [m] })));

  return Array.from({ length: cycles }).flatMap(() => oneCycle);
}

/**
 * 미리보기용 — 누적 매치 수를 팀별로 카운트.
 */
export function countCurrentMatchesPerTeam(completedMatches, teamCount) {
  const counts = Array(teamCount).fill(0);
  for (const m of completedMatches) {
    if (typeof m.homeIdx === 'number') counts[m.homeIdx]++;
    if (typeof m.awayIdx === 'number') counts[m.awayIdx]++;
  }
  return counts;
}

/**
 * 매치당 시간 자동 추정.
 * 최근 5매치 중 이벤트 ≥ 2개인 매치들에서 이벤트 시각 범위(분) 평균을 ceil.
 * 데이터 부족 시 10분 고정.
 */
export function estimateMatchMinutes(completedMatches, allEvents) {
  const recent = completedMatches.slice(-5);
  const durations = [];
  for (const m of recent) {
    if (!m.matchId) continue;
    const evts = allEvents.filter(e => e.matchId === m.matchId && typeof e.timestamp === 'number');
    if (evts.length < 2) continue;
    const ts = evts.map(e => e.timestamp);
    durations.push(Math.max(...ts) - Math.min(...ts));
  }
  if (durations.length < 2) return 10;
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  return Math.max(1, Math.ceil(avgMs / 60000));
}
```

- [ ] **Step 1.4: 테스트 실행 — 통과 확인**

Run: `npm test -- src/utils/__tests__/balancedSchedule.test.js`
Expected: PASS (1 passing)

- [ ] **Step 1.5: 추가 케이스 테스트 작성**

Append to `src/utils/__tests__/balancedSchedule.test.js`:

```js
describe('generateBalancedSegment — 추가 케이스', () => {
  it('5팀 1코트 1사이클 — 10라운드 × 1매치, 각 팀 4경기', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 1, cycles: 1 });
    expect(result.length).toBe(10);
    result.forEach(round => expect(round.matches.length).toBe(1));
    const counts = [0, 0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([4, 4, 4, 4, 4]);
  });

  it('5팀 2코트 2사이클 — 10라운드, 각 팀 8경기', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 2, cycles: 2 });
    expect(result.length).toBe(10);
    const counts = [0, 0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([8, 8, 8, 8, 8]);
  });

  it('4팀 2코트 1사이클 — 3라운드 × 2매치, 각 팀 3경기, 휴식 없음', () => {
    const result = generateBalancedSegment({ teamCount: 4, courtCount: 2, cycles: 1 });
    expect(result.length).toBe(3);
    result.forEach(round => expect(round.matches.length).toBe(2));
    const counts = [0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([3, 3, 3, 3]);
  });

  it('4팀 1코트 2사이클 — 12라운드, 각 팀 6경기', () => {
    const result = generateBalancedSegment({ teamCount: 4, courtCount: 1, cycles: 2 });
    expect(result.length).toBe(12);
    const counts = [0, 0, 0, 0];
    result.forEach(r => r.matches.forEach(([h, a]) => { counts[h]++; counts[a]++; }));
    expect(counts).toEqual([6, 6, 6, 6]);
  });

  it('cycles=1에서 모든 매치업이 정확히 1번씩 등장 (5팀)', () => {
    const result = generateBalancedSegment({ teamCount: 5, courtCount: 2, cycles: 1 });
    const pairs = new Map();
    result.forEach(r => r.matches.forEach(([h, a]) => {
      const key = [h, a].sort((x, y) => x - y).join('-');
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }));
    // C(5,2) = 10
    expect(pairs.size).toBe(10);
    pairs.forEach(count => expect(count).toBe(1));
  });
});

describe('countCurrentMatchesPerTeam', () => {
  it('completedMatches에서 팀별 매치 수 카운트', () => {
    const completed = [
      { homeIdx: 0, awayIdx: 1 },
      { homeIdx: 2, awayIdx: 3 },
      { homeIdx: 0, awayIdx: 2 },
    ];
    expect(countCurrentMatchesPerTeam(completed, 5)).toEqual([2, 1, 2, 1, 0]);
  });

  it('homeIdx/awayIdx 없는 매치는 무시', () => {
    const completed = [
      { homeIdx: 0, awayIdx: 1 },
      { foo: 'bar' },
    ];
    expect(countCurrentMatchesPerTeam(completed, 4)).toEqual([1, 1, 0, 0]);
  });
});

describe('estimateMatchMinutes', () => {
  it('데이터 충분하면 평균 시각 범위(분) 올림', () => {
    const completed = [
      { matchId: 'F1_C0' },
      { matchId: 'F2_C0' },
    ];
    const events = [
      { matchId: 'F1_C0', timestamp: 0 },
      { matchId: 'F1_C0', timestamp: 600000 }, // 10분
      { matchId: 'F2_C0', timestamp: 1000000 },
      { matchId: 'F2_C0', timestamp: 1480000 }, // 8분
    ];
    expect(estimateMatchMinutes(completed, events)).toBe(9); // (10+8)/2 = 9
  });

  it('이벤트 < 2개인 매치만 있으면 기본 10', () => {
    const completed = [{ matchId: 'F1_C0' }];
    const events = [{ matchId: 'F1_C0', timestamp: 0 }];
    expect(estimateMatchMinutes(completed, events)).toBe(10);
  });

  it('완료 매치가 없으면 10', () => {
    expect(estimateMatchMinutes([], [])).toBe(10);
  });

  it('최근 5매치만 고려', () => {
    const completed = Array.from({ length: 8 }, (_, i) => ({ matchId: `F${i + 1}_C0` }));
    // F1~F3은 길이 30분, F4~F8은 길이 5분 → 최근 5개(F4~F8) 평균 5분
    const events = completed.flatMap((m, i) => {
      const dur = i < 3 ? 1800000 : 300000;
      return [
        { matchId: m.matchId, timestamp: 0 },
        { matchId: m.matchId, timestamp: dur },
      ];
    });
    expect(estimateMatchMinutes(completed, events)).toBe(5);
  });
});
```

- [ ] **Step 1.6: 모든 테스트 통과 확인**

Run: `npm test -- src/utils/__tests__/balancedSchedule.test.js`
Expected: PASS (모든 테스트 통과, 약 11~12 passing)

- [ ] **Step 1.7: 커밋**

```bash
git add src/utils/balancedSchedule.js src/utils/__tests__/balancedSchedule.test.js
git commit -m "feat(futsal): generateBalancedSegment 알고리즘 + 단위 테스트

- 4·5팀 라운드로빈 풀을 cycles 횟수만큼 반복
- 1코트는 직렬, 2코트는 동시 라운드 구조
- 매치당 시간 자동 추정 (최근 5매치 평균)
- 누적 팀별 매치 수 카운팅 헬퍼"
```

---

## Task 2: APPEND_SCHEDULE_SEGMENT reducer 액션 (TDD)

**Files:**
- Modify: `src/hooks/useGameReducer.js` (액션 추가)
- Test: `src/hooks/__tests__/useGameReducer.appendSchedule.test.js`

- [ ] **Step 2.1: 실패 테스트 작성**

Create `src/hooks/__tests__/useGameReducer.appendSchedule.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — APPEND_SCHEDULE_SEGMENT', () => {
  it('빈 schedule에 첫 segment 추가 — currentRoundIdx=0', () => {
    const state = withState({ schedule: [], currentRoundIdx: 0, courtCount: 1 });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }],
      newCourtCount: 2,
    });
    expect(next.schedule.length).toBe(2);
    expect(next.courtCount).toBe(2);
    expect(next.currentRoundIdx).toBe(0);
    expect(next.viewingRoundIdx).toBe(0);
  });

  it('기존 segment 전부 확정 → segment 추가 시 currentRoundIdx가 새 첫 라운드 가리킴', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }],
      currentRoundIdx: 2, // 마지막 + 1 (범위 밖, 다 확정)
      confirmedRounds: { 0: true, 1: true },
      courtCount: 1,
    });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[0, 2]] }],
      newCourtCount: 2,
    });
    expect(next.schedule.length).toBe(3);
    expect(next.currentRoundIdx).toBe(2); // 새 첫 라운드 인덱스
    expect(next.viewingRoundIdx).toBe(2);
  });

  it('기존 segment 일부만 확정 → currentRoundIdx 보존', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }, { matches: [[0, 2]] }],
      currentRoundIdx: 1, // R2 진행 중
      confirmedRounds: { 0: true },
      courtCount: 2,
    });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[1, 3]] }],
      newCourtCount: 1,
    });
    expect(next.schedule.length).toBe(4);
    expect(next.currentRoundIdx).toBe(1); // 보존
    expect(next.courtCount).toBe(1);
  });

  it('confirmedRounds, completedMatches는 변경되지 않음', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }],
      currentRoundIdx: 1,
    });
    const next = gameReducer(state, {
      type: 'APPEND_SCHEDULE_SEGMENT',
      newRounds: [{ matches: [[2, 3]] }],
      newCourtCount: 2,
    });
    expect(next.confirmedRounds).toEqual({ 0: true });
    expect(next.completedMatches).toEqual([{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }]);
  });
});
```

- [ ] **Step 2.2: 테스트 실행 — 실패 확인**

Run: `npm test -- src/hooks/__tests__/useGameReducer.appendSchedule.test.js`
Expected: FAIL — 액션 없어서 state 변화 없음

- [ ] **Step 2.3: 액션 구현**

Edit `src/hooks/useGameReducer.js` — `case 'START_MATCHES':` 직전(라인 745 부근)에 새 case 추가:

```js
    case 'APPEND_SCHEDULE_SEGMENT': {
      const { newRounds, newCourtCount } = action;
      if (!Array.isArray(newRounds) || newRounds.length === 0) return state;
      const newSchedule = [...state.schedule, ...newRounds];
      const prevLen = state.schedule.length;
      // 이전 segment를 다 확정했으면(currentRoundIdx >= prevLen) 새 첫 라운드 가리킴.
      // 미확정이 남아있으면 현재 위치 보존.
      const nextCurrent = (prevLen === 0 || state.currentRoundIdx >= prevLen) ? prevLen : state.currentRoundIdx;
      return {
        ...state,
        schedule: newSchedule,
        courtCount: typeof newCourtCount === 'number' ? newCourtCount : state.courtCount,
        currentRoundIdx: nextCurrent,
        viewingRoundIdx: nextCurrent,
      };
    }
```

- [ ] **Step 2.4: 테스트 통과 확인**

Run: `npm test -- src/hooks/__tests__/useGameReducer.appendSchedule.test.js`
Expected: PASS (4 passing)

- [ ] **Step 2.5: 전체 테스트 회귀 확인**

Run: `npm test`
Expected: 기존 테스트 모두 통과 + 새 테스트 통과

- [ ] **Step 2.6: 커밋**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.appendSchedule.test.js
git commit -m "feat(futsal): APPEND_SCHEDULE_SEGMENT reducer 액션

자유대진 진행 중 schedule 배열에 라운드 묶음을 append하고
currentRoundIdx, viewingRoundIdx, courtCount를 함께 갱신.
이전 segment 미확정 상태에서 추가 호출 시엔 위치 보존."
```

---

## Task 3: App.jsx 핵심 조건 정리 (회귀 방지 핵심 단계)

**Files:**
- Modify: `src/App.jsx` (6개 지점)

⚠️ 이 단계가 가장 위험. 각 변경 후 `npm test`로 회귀 확인.

- [ ] **Step 3.1: allRoundsComplete 조건 완화 (App.jsx:338-346)**

Find:
```js
  const allRoundsComplete = useMemo(() => {
    if (matchMode === "schedule" && schedule.length > 0) {
      const lastIdx = schedule.length - 1;
      return confirmedRounds[lastIdx] === true;
    }
    return false;
  }, [matchMode, schedule, confirmedRounds, phase]);
```

Replace with:
```js
  const allRoundsComplete = useMemo(() => {
    if (schedule.length > 0 && matchMode !== "push") {
      const lastIdx = schedule.length - 1;
      return confirmedRounds[lastIdx] === true;
    }
    return false;
  }, [matchMode, schedule, confirmedRounds, phase]);
```

- [ ] **Step 3.2: confirmRound의 nextRoundIdx 조건 완화 (App.jsx:611)**

Find:
```js
    const nextIdx = (matchMode === "schedule" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
```

Replace with:
```js
    const nextIdx = (matchMode !== "push" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
```

- [ ] **Step 3.3: shouldShowSchedule 헬퍼 추가 + 렌더 분기 수정 (App.jsx:1352 근처)**

먼저 `shouldShowSchedule`를 컴포넌트 본문 적절한 위치에 추가. `allRoundsComplete` 선언(라인 ~338) 뒤에 한 줄로 추가:

Find:
```js
  }, [matchMode, schedule, confirmedRounds, phase]);
```
(allRoundsComplete useMemo의 닫는 `}, [...]);` 직후)

Insert AFTER that line:
```js

  // 자동 segment + free 모드 공존 케이스를 위한 헬퍼.
  // 대진표 모드는 라운드 완료 후에도 ScheduleView 잔류(기존 동작 보존),
  // free 모드만 라운드 완료 시 FreeView로 자동 복귀.
  const shouldShowSchedule = matchMode !== "push" && schedule.length > 0 && !isExtraRound
    && !(matchMode === "free" && allRoundsComplete);
```

이제 렌더 분기 수정. Find (App.jsx:1352 근처):
```jsx
          ) : matchMode === "schedule" && schedule.length > 0 && !isExtraRound ? (
            <ScheduleMatchView
```

Replace with:
```jsx
          ) : shouldShowSchedule ? (
            <ScheduleMatchView
```

- [ ] **Step 3.4: 하단 바 조건 수정 (App.jsx:1377)**

Find:
```jsx
        {matchMode === "schedule" && schedule.length > 0 && !isExtraRound && (
          <div style={s.bottomBar}>
```

Replace with:
```jsx
        {shouldShowSchedule && (
          <div style={s.bottomBar}>
```

- [ ] **Step 3.5: 진행 상태 텍스트 조건 확장 (App.jsx:1236-1237)**

Find:
```jsx
            {matchMode === "schedule"
              ? (allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1} / ${schedule.length}`)
```

Replace with:
```jsx
            {(matchMode === "schedule" || (matchMode === "free" && schedule.length > 0))
              ? (allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1} / ${schedule.length}`)
```

- [ ] **Step 3.6: 빌드 + 전체 테스트 확인**

Run: `npm run build`
Expected: 성공 (lint 에러 없음)

Run: `npm test`
Expected: 모든 기존 테스트 통과 (matchMode='schedule' 시나리오 회귀 없음)

- [ ] **Step 3.7: 수동 회귀 점검 (dev 서버) — 권장**

Run: `npm run dev` (백그라운드)
점검 시나리오 (각각 5분 이내):
1. 5팀 2코트 schedule 모드로 시작 → 10R 모두 진행 → "전체 라운드 완료" 표시 + ScheduleView 잔류 + 확정취소 버튼 노출 확인
2. push 모드 시작 → 대진표 버튼 안 보임 + 정상 진행 확인

서버 종료: dev 백그라운드 작업을 중지.

- [ ] **Step 3.8: 커밋**

```bash
git add src/App.jsx
git commit -m "refactor(futsal): App.jsx 분기 정리 — shouldShowSchedule 도입

- allRoundsComplete: matchMode='free'+schedule.length>0 케이스 인식
- confirmRound nextRoundIdx: free 모드에서도 다음 라운드 자동 이동
- 렌더 분기 + 하단바: shouldShowSchedule 헬퍼로 통일
  (대진표 모드는 라운드 완료 후 ScheduleView 잔류 기존 동작 보존)
- 진행 상태 텍스트: free+schedule 케이스도 'R X/N' 표시

기존 대진표/push 모드 동작 회귀 없음."
```

---

## Task 4: ScheduleModal 보강 — 빈 상태, 자동설정 버튼, 자유 매치 안내, formatDesc 확장

**Files:**
- Modify: `src/components/game/ScheduleModal.jsx`

- [ ] **Step 4.1: 추가 props 정의 (signature 확장)**

Open `src/components/game/ScheduleModal.jsx`. Find (라인 7):
```jsx
export default function ScheduleModal({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, allEvents, teamNames, teamColorIndices, courtCount, splitPhase, teamCount, matchMode, rotations, onClose, styles: s }) {
```

Replace with:
```jsx
export default function ScheduleModal({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, allEvents, teamNames, teamColorIndices, courtCount, splitPhase, teamCount, matchMode, rotations, completedMatches = [], onOpenAutoConfig, onClose, styles: s }) {
```

새 props: `completedMatches` (자유 매치 카운팅용), `onOpenAutoConfig` (자동설정 버튼 클릭 핸들러, 자유대진 모드에서만 전달됨).

- [ ] **Step 4.2: formatDesc에 free+schedule 케이스 추가 (라인 48-55)**

Find:
```jsx
  const formatDesc = (() => {
    if (teamCount === 4 && courtCount === 2) return "4팀·2코트 — 동일팀 4번씩 경기 · 12라운드";
    if (teamCount === 5 && courtCount === 2) return "5팀·2코트 — 동일팀 2번씩 · 10라운드 · 매R 1팀 휴식";
    if (teamCount === 6 && courtCount === 2) return "6팀·2코트 — 그룹 스플릿 · 12라운드";
    if (courtCount === 1 && matchMode === "schedule") return `${teamCount}팀·1코트 — 라운드로빈 × ${rotations || 1}회전`;
    if (matchMode === "free") return "자유대진 — 매 라운드 직접 선택";
    return `${teamCount}팀 · ${courtCount}코트`;
  })();
```

Replace with:
```jsx
  const formatDesc = (() => {
    if (matchMode === "free" && schedule.length > 0) return `자유대진 + 자동 ${schedule.length}라운드 · ${courtCount}코트`;
    if (teamCount === 4 && courtCount === 2 && matchMode === "schedule") return "4팀·2코트 — 동일팀 4번씩 경기 · 12라운드";
    if (teamCount === 5 && courtCount === 2 && matchMode === "schedule") return "5팀·2코트 — 동일팀 2번씩 · 10라운드 · 매R 1팀 휴식";
    if (teamCount === 6 && courtCount === 2 && matchMode === "schedule") return "6팀·2코트 — 그룹 스플릿 · 12라운드";
    if (courtCount === 1 && matchMode === "schedule") return `${teamCount}팀·1코트 — 라운드로빈 × ${rotations || 1}회전`;
    if (matchMode === "free") return "자유대진 — 매 라운드 직접 선택";
    return `${teamCount}팀 · ${courtCount}코트`;
  })();
```

- [ ] **Step 4.3: 자유 매치 카운트 계산**

Insert (formatDesc 직후, return JSX 직전):

```jsx
  const freeMatchCount = completedMatches.filter(m => m?.matchId?.startsWith?.('F')).length;
  const canOpenAutoConfig = typeof onOpenAutoConfig === 'function';
```

- [ ] **Step 4.4: 빈 상태 + 자동설정 버튼 + 자유 매치 안내 추가**

Find (return 안의 `<Modal onClose={onClose} title="대진표">` 직후):

```jsx
    <Modal onClose={onClose} title="대진표">
      {/* 경기방식 요약 */}
      <div style={{
        fontSize: 11, color: C.gray, textAlign: "center", padding: "6px 10px",
        background: C.cardLight, borderRadius: 8, marginBottom: 10,
      }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>경기방식</span>
        <span style={{ margin: "0 6px", opacity: 0.4 }}>|</span>
        {formatDesc}
      </div>
```

Replace with:
```jsx
    <Modal onClose={onClose} title="대진표">
      {/* 경기방식 요약 */}
      <div style={{
        fontSize: 11, color: C.gray, textAlign: "center", padding: "6px 10px",
        background: C.cardLight, borderRadius: 8, marginBottom: 10,
      }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>경기방식</span>
        <span style={{ margin: "0 6px", opacity: 0.4 }}>|</span>
        {formatDesc}
      </div>
      {freeMatchCount > 0 && (
        <div style={{ fontSize: 11, color: C.gray, textAlign: "center", marginBottom: 8 }}>
          자유 매치 {freeMatchCount}개 별도 진행
        </div>
      )}
      {schedule.length === 0 && (
        <div style={{ textAlign: "center", color: C.gray, padding: "24px 8px", fontSize: 13 }}>
          아직 자동 생성된 대진표가 없습니다.
        </div>
      )}
```

- [ ] **Step 4.5: 자동설정 버튼 추가 — 표 뒤에**

Find the closing `</table>` before `</Modal>` and ensure the auto-config button is appended just before `</Modal>`:

Look for the last `</table>` in the file (it's the schedule table). After `</table>` and before `</Modal>`, insert:

```jsx
      {canOpenAutoConfig && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <button
            onClick={onOpenAutoConfig}
            style={{
              background: C.accent, color: C.bg, border: 0, borderRadius: 999,
              padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            + 대진표 자동설정
          </button>
        </div>
      )}
```

(`canOpenAutoConfig`가 true일 때만 노출 → App.jsx에서 자유대진+4·5팀 조건 만족할 때만 onOpenAutoConfig를 전달하면 됨)

- [ ] **Step 4.6: 빌드 확인 (lint/syntax 오류 없음)**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4.7: 커밋**

```bash
git add src/components/game/ScheduleModal.jsx
git commit -m "feat(futsal): ScheduleModal 보강 — 빈 상태/자동설정 진입점/자유 매치 안내

- schedule.length === 0이면 안내 문구 + 자동설정 버튼만 노출
- onOpenAutoConfig prop이 함수로 전달되면 자동설정 버튼 노출
- 자유 매치(F-id) 개수 > 0이면 상단에 안내 라인
- formatDesc에 'free + schedule.length > 0' 케이스 추가"
```

---

## Task 5: BalancedScheduleModal 신규 — 입력 UI + 미리보기 + 라이브 매치 가드

**Files:**
- Create: `src/components/game/BalancedScheduleModal.jsx`

- [ ] **Step 5.1: 컴포넌트 생성 — 기본 스켈레톤 + 입력 + 미리보기**

Create `src/components/game/BalancedScheduleModal.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { TEAM_COLORS } from '../../config/constants';
import Modal from '../common/Modal';
import {
  generateBalancedSegment,
  countCurrentMatchesPerTeam,
  estimateMatchMinutes,
} from '../../utils/balancedSchedule';

const SUPPORTED_TEAM_COUNTS = [4, 5];

export default function BalancedScheduleModal({
  teamCount,
  teamNames,
  teamColorIndices,
  completedMatches,
  allEvents,
  courtCount: initialCourtCount,
  hasLiveMatch,
  onConfirm,
  onClose,
}) {
  const { C } = useTheme();

  // 4·5팀 외엔 비활성화 안내만 표시
  if (!SUPPORTED_TEAM_COUNTS.includes(teamCount)) {
    return (
      <Modal onClose={onClose} title="대진표 자동설정">
        <div style={{ padding: 20, textAlign: "center", color: C.gray, fontSize: 13, lineHeight: 1.6 }}>
          {teamCount === 3 && "3팀은 1코트 진행이라 자동설정 대상이 아닙니다."}
          {teamCount === 6 && "6팀은 그룹스플릿 모드를 사용해주세요."}
          {teamCount >= 7 && "본 기능은 4·5팀에서 지원합니다."}
        </div>
      </Modal>
    );
  }

  const [courtCount, setCourtCount] = useState(initialCourtCount || 2);
  const [cycles, setCycles] = useState(1);
  const defaultMinutes = useMemo(
    () => estimateMatchMinutes(completedMatches, allEvents),
    [completedMatches, allEvents],
  );
  const [minutes, setMinutes] = useState(defaultMinutes);

  const currentCounts = useMemo(
    () => countCurrentMatchesPerTeam(completedMatches, teamCount),
    [completedMatches, teamCount],
  );

  const preview = useMemo(
    () => generateBalancedSegment({ teamCount, courtCount, cycles }),
    [teamCount, courtCount, cycles],
  );

  const totalMatches = preview.reduce((sum, r) => sum + r.matches.length, 0);
  const matchesPerTeam = teamCount > 0 ? (totalMatches * 2) / teamCount : 0;
  const totalMinutes = preview.length * Math.max(1, Number(minutes) || 0);
  const isImbalanced = Math.max(...currentCounts) - Math.min(...currentCounts) >= 1;

  const handleConfirm = () => {
    if (hasLiveMatch) {
      alert("라이브 매치를 먼저 확정하거나 취소한 뒤 자동설정을 진행해주세요.");
      return;
    }
    onConfirm({ newRounds: preview, newCourtCount: courtCount });
  };

  const pill = (teamIdx) => {
    const ci = teamColorIndices?.[teamIdx];
    const tc = ci != null ? TEAM_COLORS[ci] : null;
    return {
      display: "inline-block", padding: "2px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700,
      background: tc ? `${tc.bg}55` : C.cardLight,
      color: C.white,
      border: tc ? `1px solid ${tc.bg}88` : "none",
      whiteSpace: "nowrap",
    };
  };

  const segBtn = (active) => ({
    background: active ? C.accent : C.cardLight,
    color: active ? C.bg : C.white,
    border: 0, borderRadius: 8, padding: "8px 12px",
    fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1,
  });

  return (
    <Modal onClose={onClose} title="대진표 자동설정">
      {/* 입력 영역 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>코트 수</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2].map(n => (
              <button key={n} onClick={() => setCourtCount(n)} style={segBtn(courtCount === n)}>
                {n}코트
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>몇 번씩 대전</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setCycles(n)} style={segBtn(cycles === n)}>
                {n}번씩
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>
            매치당 시간 (분) · 자동 추정 {defaultMinutes}분
          </div>
          <input
            type="number"
            min={1}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${C.grayDarker}`, background: C.cardLight,
              color: C.white, fontSize: 14,
            }}
          />
        </div>

        {isImbalanced && (
          <div style={{ fontSize: 11, color: C.orange, background: `${C.orange}11`, padding: "8px 10px", borderRadius: 8 }}>
            ⚠ 현재 팀 간 매치 수 차이가 {Math.max(...currentCounts) - Math.min(...currentCounts)}매치 있습니다.
            이 자동 스케줄은 추가 보정 없이 라운드로빈을 더하므로 최종 누적이 동일하지 않을 수 있습니다.
          </div>
        )}

        {/* 미리보기 요약 */}
        <div style={{ background: C.cardLight, borderRadius: 8, padding: 10, fontSize: 12, color: C.white, lineHeight: 1.8 }}>
          <div><span style={{ color: C.gray }}>총 매치:</span> <b>{totalMatches}</b></div>
          <div><span style={{ color: C.gray }}>각 팀 추가:</span> <b>+{matchesPerTeam}경기</b></div>
          <div><span style={{ color: C.gray }}>라운드 수:</span> <b>{preview.length}R × {courtCount}코트</b></div>
          <div><span style={{ color: C.gray }}>예상 소요:</span> <b>약 {totalMinutes}분</b></div>
        </div>

        {/* 매치업 리스트 */}
        <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.grayDarker}`, borderRadius: 8, padding: 8 }}>
          {preview.map((round, ri) => {
            const playingTeams = new Set(round.matches.flatMap(([h, a]) => [h, a]));
            const restingTeams = Array.from({ length: teamCount }, (_, i) => i).filter(i => !playingTeams.has(i));
            return (
              <div key={ri} style={{ marginBottom: 6, fontSize: 11, color: C.white }}>
                <span style={{ color: C.accent, fontWeight: 700, marginRight: 6 }}>R{ri + 1}</span>
                {round.matches.map(([h, a], mi) => (
                  <span key={mi} style={{ marginRight: 6 }}>
                    <span style={pill(h)}>{teamNames[h]}</span>
                    <span style={{ margin: "0 4px", color: C.gray }}>vs</span>
                    <span style={pill(a)}>{teamNames[a]}</span>
                  </span>
                ))}
                {restingTeams.length > 0 && (
                  <span style={{ color: C.gray, marginLeft: 4 }}>
                    · 휴식: {restingTeams.map(i => teamNames[i]).join(", ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, background: C.grayDark, color: C.white, border: 0, borderRadius: 8,
            padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>취소</button>
          <button onClick={handleConfirm} style={{
            flex: 2, background: C.accent, color: C.bg, border: 0, borderRadius: 8,
            padding: "10px", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}>생성</button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5.2: 빌드 확인**

Run: `npm run build`
Expected: 성공 (lint/syntax 에러 없음)

- [ ] **Step 5.3: 커밋**

```bash
git add src/components/game/BalancedScheduleModal.jsx
git commit -m "feat(futsal): BalancedScheduleModal 신규 — 입력+미리보기+가드

- 4·5팀 외에는 비활성화 안내
- 코트수/사이클/매치당시간 입력
- 매치당시간 자동 추정값을 기본값으로 깔고 사용자 조정 가능
- 누적 비균등 시 경고 표시
- 미리보기: 총 매치, 각 팀 추가, 라운드 수, 예상 소요, 매치업 + 휴식
- 라이브 매치 가드(hasLiveMatch prop)"
```

---

## Task 6: App.jsx 통합 — BalancedScheduleModal 진입 + 대진표 버튼 노출 + APPEND dispatch

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 6.1: BalancedScheduleModal import**

Open `src/App.jsx`. Near the top, find existing component imports (around line 19-22). Add:

```jsx
import BalancedScheduleModal from './components/game/BalancedScheduleModal';
```

- [ ] **Step 6.2: 라이브 매치 감지 로직 추가**

`shouldShowSchedule` 헬퍼 정의 직후에 추가:

Find:
```js
  const shouldShowSchedule = matchMode !== "push" && schedule.length > 0 && !isExtraRound
    && !(matchMode === "free" && allRoundsComplete);
```

Insert AFTER:
```js

  // 자유대진 라이브 매치 진행 중 여부 — F{n}_C{c} 이벤트가 있고 completedMatches에 없음
  const hasLiveFreeMatch = useMemo(() => {
    if (matchMode !== "free") return false;
    const completedIds = new Set(completedMatches.map(m => m.matchId).filter(Boolean));
    return allEvents.some(e => {
      const id = e.matchId;
      return typeof id === 'string' && id.startsWith('F') && !completedIds.has(id);
    });
  }, [matchMode, allEvents, completedMatches]);
```

- [ ] **Step 6.3: 대진표 버튼 노출 조건 완화 (라인 1245-1247)**

Find:
```jsx
            {matchMode === "schedule" && (
              <button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
            )}
```

Replace with:
```jsx
            {matchMode !== "push" && (
              <button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
            )}
```

- [ ] **Step 6.4: ScheduleModal에 props 전달 (completedMatches + onOpenAutoConfig)**

Find:
```jsx
        {matchModal === "schedule" && (
          <ScheduleModal schedule={schedule} currentRoundIdx={currentRoundIdx} viewingRoundIdx={viewingRoundIdx}
            setViewingRoundIdx={(v) => set('viewingRoundIdx', v)} confirmedRounds={confirmedRounds}
            allEvents={allEvents} teamNames={teamNames} teamColorIndices={teamColorIndices} courtCount={courtCount}
            splitPhase={splitPhase} teamCount={teamCount} matchMode={matchMode} rotations={rotations}
            onClose={() => set('matchModal', null)} styles={s} />
        )}
```

Replace with:
```jsx
        {matchModal === "schedule" && (
          <ScheduleModal schedule={schedule} currentRoundIdx={currentRoundIdx} viewingRoundIdx={viewingRoundIdx}
            setViewingRoundIdx={(v) => set('viewingRoundIdx', v)} confirmedRounds={confirmedRounds}
            allEvents={allEvents} teamNames={teamNames} teamColorIndices={teamColorIndices} courtCount={courtCount}
            splitPhase={splitPhase} teamCount={teamCount} matchMode={matchMode} rotations={rotations}
            completedMatches={completedMatches}
            onOpenAutoConfig={matchMode === "free" && [4, 5].includes(teamCount)
              ? () => set('matchModal', 'balancedAuto')
              : undefined}
            onClose={() => set('matchModal', null)} styles={s} />
        )}
        {matchModal === "balancedAuto" && (
          <BalancedScheduleModal
            teamCount={teamCount}
            teamNames={teamNames}
            teamColorIndices={teamColorIndices}
            completedMatches={completedMatches}
            allEvents={allEvents}
            courtCount={courtCount}
            hasLiveMatch={hasLiveFreeMatch}
            onConfirm={({ newRounds, newCourtCount }) => {
              dispatch({ type: 'APPEND_SCHEDULE_SEGMENT', newRounds, newCourtCount });
              set('matchModal', null);
            }}
            onClose={() => set('matchModal', null)}
          />
        )}
```

- [ ] **Step 6.5: 빌드 + 테스트 확인**

Run: `npm run build`
Expected: 성공

Run: `npm test`
Expected: 모든 테스트 통과

- [ ] **Step 6.6: 커밋**

```bash
git add src/App.jsx
git commit -m "feat(futsal): BalancedScheduleModal App.jsx 통합

- 대진표 버튼 노출 조건을 'push 제외' 로 완화 (자유대진에서도 노출)
- ScheduleModal에 onOpenAutoConfig prop 전달 (자유대진+4/5팀 한정)
- BalancedScheduleModal matchModal 케이스 추가
- 라이브 매치 감지(hasLiveFreeMatch)로 가드 진입
- 확인 시 APPEND_SCHEDULE_SEGMENT dispatch"
```

---

## Task 7: 수동 통합 시나리오 점검

**Files:** 없음 (수동 검증)

- [ ] **Step 7.1: dev 서버 기동**

Run: `npm run dev`

- [ ] **Step 7.2: 신규 기능 시나리오 (a) — 5팀**

테스트 게임 생성 → 5팀 자유대진 (1코트 또는 2코트) 시작:
1. 자유 매치 2개 진행 후 라운드 종료
2. 상단 "대진표" 버튼 클릭 → 모달 열림 → "아직 자동 생성된 대진표가 없습니다" + "+ 대진표 자동설정" 버튼 + 자유 매치 2개 안내
3. 자동설정 클릭 → 모달 열림 → 코트수 2 + 1번씩 + 매치당 시간 자동 추정값 → 미리보기 10매치/5R 표시
4. 생성 클릭 → ScheduleView로 자동 전환, 5R 진행 가능
5. 5R 모두 확정 → FreeMatchView로 자동 복귀 확인
6. 다시 대진표 → 자동설정 → 코트수 1로 변경, 1번씩 → 10R 추가 생성 → 진행 → 완료
7. 경기마감 → 통계 확인 — 각 팀 매치 수 균등(8경기) 확인

각 단계 결과 메모.

- [ ] **Step 7.3: 신규 기능 시나리오 (b) — 4팀 + 2사이클**

새 게임 → 4팀 자유대진 → 자동설정 → 코트수 2 + 2번씩 → 6라운드 생성 → 진행 → 각 팀 6경기 확인.

- [ ] **Step 7.4: 신규 기능 시나리오 (c) — 라이브 매치 가드**

5팀 자유대진 → 라이브 매치 설정 + 골 1~2개 입력 (매치 종료 X) → 상단 대진표 → 자동설정 → 생성 클릭 → **알림 "라이브 매치를 먼저 확정하거나 취소한 뒤 자동설정을 진행해주세요"** 확인 후 진행 차단됨.

- [ ] **Step 7.5: 회귀 시나리오 (d) — 5팀 2코트 schedule 모드**

새 게임 → 5팀 2코트 **대진표 모드** → 10R 진행 → 모두 확정:
- "전체 라운드 완료" 표시 ✓
- ScheduleView **잔류** ✓ (FreeView로 안 바뀜)
- 하단바에 "라운드 X 종료됨 / 확정취소" 버튼 ✓
- 경기마감 정상 동작 ✓

- [ ] **Step 7.6: 회귀 시나리오 (e) — 4팀 2코트 schedule 모드**

새 게임 → 4팀 2코트 대진표 → 12R 진행 → 동일 회귀 검증

- [ ] **Step 7.7: 회귀 시나리오 (f) — 6팀 2코트 그룹스플릿**

새 게임 → 6팀 2코트 → 전반 6R → midSplit → 후반 6R → 동일 회귀 검증
+ 6팀 자유대진 → 대진표 → 자동설정 클릭 → "6팀은 그룹스플릿 모드를 사용해주세요" 안내 확인

- [ ] **Step 7.8: 회귀 시나리오 (g) — 밀어내기 모드**

새 게임 → push 모드 → 상단에 "대진표" 버튼 **숨김** 확인 + PushMatchView 정상 진행

- [ ] **Step 7.9: 회귀 시나리오 (h) — 5팀 1코트 schedule**

새 게임 → 5팀 1코트 대진표 + rotations 2회전 → 정상 동작 + 회귀 없음

- [ ] **Step 7.10: dev 서버 종료**

- [ ] **Step 7.11: 점검 결과 기록 (선택)**

문제 발견 시 별도 이슈로 정리. 모두 통과 시 다음 단계로.

---

## Task 8: 최종 정리 + 빌드 + PR 준비

**Files:** 없음

- [ ] **Step 8.1: 전체 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 통과

- [ ] **Step 8.2: 빌드 확인**

Run: `npm run build`
Expected: 성공 + dist 생성

- [ ] **Step 8.3: lint 확인**

Run: `npm run lint`
Expected: 에러 없음 (warning은 기존 수준 유지)

- [ ] **Step 8.4: 브랜치 푸시 + PR 생성**

```bash
git push -u origin feat/balanced-auto-schedule
gh pr create --base main --head feat/balanced-auto-schedule \
  --title "feat(futsal): 균등 자동 스케줄 — 자유대진 도중 임의 시점에 균등 라운드 자동 생성" \
  --body "$(cat <<'EOF'
## 요약
자유대진 모드 진행 중 임의 시점에 라운드로빈 사이클을 자동 생성해 schedule에 append하는 기능 추가. 4·5팀에서 활성화, 코트 수는 매 segment마다 가변 입력.

## 변경 사항
- `src/utils/balancedSchedule.js` (신규) — 알고리즘 + 매치당 시간 추정 + 누적 카운팅
- `src/components/game/BalancedScheduleModal.jsx` (신규) — 입력/미리보기/가드 UI
- `src/components/game/ScheduleModal.jsx` — 빈 상태, 자동설정 진입점, 자유 매치 안내, formatDesc 확장
- `src/hooks/useGameReducer.js` — `APPEND_SCHEDULE_SEGMENT` 액션
- `src/App.jsx` — `shouldShowSchedule` 헬퍼, 조건 정리, 모달 통합 (기존 대진표/push 모드 회귀 없음)

## 회귀 검증 완료
- (d) 5팀 2코트 schedule 모드
- (e) 4팀 2코트 schedule 모드
- (f) 6팀 2코트 그룹스플릿
- (g) 밀어내기 모드
- (h) 5팀 1코트 schedule (rotations)

## Spec / Plan
- Spec: `docs/superpowers/specs/2026-05-28-balanced-auto-schedule-design.md` (v1.2)
- Plan: `docs/superpowers/plans/2026-05-28-balanced-auto-schedule.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR URL 출력 확인.

---

## 참고: v2 후보 (본 PR 범위 외)

- 누적 비균등 상태에서 자동 보정 매치 추가
- 자동 schedule 일괄 폐기 액션 + UI 버튼
- 자유 매치를 ScheduleModal 표에 통합 표시
- F 매치 인덱스 분리 카운터
- 6팀 2코트 자동 스케줄(라운드 분해 알고리즘 추가)
- 라운드 단위 매치업 swap

# 라운드 재확정 후 다음 라운드 화살표 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재확정 시 `nextRoundIdx`를 "다음 미확정 라운드"로 계산하도록 변경하여, 이미 확정된 후속 라운드를 스킵해 ▶ 버튼이 막히지 않게 한다.

**Architecture:** `src/App.jsx`의 `confirmRound` 내부만 수정. while 루프로 `confirmedRounds[i]` 순차 검사 후 미확정 인덱스를 찾아 리듀서에 전달. 리듀서/상태 구조/네비 UI 무변경.

**Tech Stack:** React + useReducer. `src/App.jsx` 단일 파일.

**Spec:** `docs/superpowers/specs/2026-04-17-reconfirm-round-arrow-fix-design.md`

---

## Task 1: confirmRound의 nextIdx 계산 로직 교체

**Files:**
- Modify: `src/App.jsx:432-462` (`confirmRound`, 특히 라인 434~435)

- [ ] **Step 1: 현재 위치 확인**

Run: `grep -n 'const isLastRound = roundIdx' src/App.jsx`
Expected: `434:    const isLastRound = roundIdx >= schedule.length - 1;` 한 줄.

- [ ] **Step 2: 두 줄을 다음 미확정 라운드 스캔 로직으로 교체**

**Before (라인 434~435):**
```jsx
    const isLastRound = roundIdx >= schedule.length - 1;
    const nextIdx = matchMode === "schedule" && !isExtraRound && !isLastRound ? roundIdx + 1 : null;
```

**After:**
```jsx
    const sched = newSchedule || schedule;
    let scanIdx = roundIdx + 1;
    while (scanIdx < sched.length && confirmedRounds[scanIdx]) scanIdx++;
    const nextIdx = (matchMode === "schedule" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
```

주의:
- `newSchedule` 변수는 이 함수 상단(라인 433)에서 이미 `let newSchedule = null` 로 선언되어 있고, 6팀 스플릿 분기에서 설정된다. 해당 변수 그대로 재사용.
- `confirmedRounds`는 상위 스코프에서 구조분해로 이미 접근 가능 (App 컴포넌트 라인 33 참고).
- `dispatch` 호출(라인 461)은 변경 없음 (`nextRoundIdx: nextIdx` 그대로).

- [ ] **Step 3: 빌드 성공 확인**

Run: `npm run build`
Expected: `dist/` 생성, 에러 없음 (기존 chunk-size warning은 무시).

- [ ] **Step 4: 수동 재현 테스트 (버그 케이스)**

Run: `npm run dev` (이미 돌아가고 있으면 생략)

브라우저에서:
1. 대진표 모드 경기를 R12까지 확정 (팀 수·코트 수 무관, `matchMode === "schedule"` 이기만 하면 됨. 3팀 1코트 15R로 재현 가능)
2. R11로 ◀ 이동 → "확정취소" 클릭 → R11 수정 없이 재확정
3. R12로 ▶ 이동

Expected: R12 화면에서 ▶ 버튼 **enabled** (R13 접근 가능). 수정 전에는 disabled였음.

- [ ] **Step 5: 정상 흐름 회귀 테스트**

같은 세션에서 새 경기 시작하여 R1~R15 순차 확정:
- 매 라운드 확정 후 `viewingRoundIdx`/`currentRoundIdx` 가 `roundIdx + 1`로 이동하는지 (기존 동작 유지)
- R15 확정 후 더 이상 넘어갈 라운드 없음 (기존 UX 유지)

Expected: 기존과 동일한 흐름.

- [ ] **Step 6: 커밋**

```bash
git add src/App.jsx
git commit -m "fix: 재확정 시 다음 미확정 라운드로 점프하도록 수정"
```

---

## Task 2: 최종 코드 리뷰

**Files:**
- None (review only)

- [ ] **Step 1: 커밋 diff 확인**

Run: `git show HEAD --stat && git show HEAD`
Expected: `src/App.jsx` 1 file changed, 4 lines 이하 변경.

- [ ] **Step 2: 전체 로컬 상태 clean 확인**

Run: `git status`
Expected: clean (또는 `.claude/`, 이미 untracked인 plan 파일만 남음).

---

## 완료 기준

- [x] `src/App.jsx`의 `confirmRound` 내 `nextIdx` 계산이 while 루프 기반으로 교체됨
- [x] 버그 케이스(R11 재확정 후 R12→R13 ▶) 수동 재현 시 enabled
- [x] 정상 순차 확정 흐름 회귀 없음
- [x] 1 commit이 main 브랜치에 기록됨

# 라운드 재확정 후 다음 라운드 화살표 비활성화 버그 수정

## 개요

대진표 모드에서 이미 확정된 **후속 라운드가 있는 상태**로 앞 라운드를 재확정하면 `currentRoundIdx`가 뒤로 끌려가 "다음 라운드 ▶" 버튼이 막힌다.

## 재현 시나리오

1. R12를 확정 → `currentRoundIdx = 12` (R13 접근 가능)
2. R11로 돌아가 "확정취소" → `currentRoundIdx = 10`, `confirmedRounds[11]`은 유지 (R12 데이터 보존)
3. R11 수정 후 재확정 → `currentRoundIdx = 11` (R12 이미 확정인데도 11로 되돌아감)
4. R12로 이동 → `viewingRoundIdx(11) >= currentRoundIdx(11)` → **▶ 버튼 disabled**

## 원인

`src/App.jsx:435`:

```js
const isLastRound = roundIdx >= schedule.length - 1;
const nextIdx = matchMode === "schedule" && !isExtraRound && !isLastRound
  ? roundIdx + 1
  : null;
```

`roundIdx + 1`을 그대로 사용하므로 그 이후 라운드가 이미 확정돼 있어도 스킵하지 않는다. 재확정 직후 `currentRoundIdx`는 바로 다음 인덱스로 고정되어, 이미 확정된 후속 라운드에서 ▶가 막힌다.

## 수정

`confirmRound` 내 `nextIdx` 계산을 **"다음 미확정 라운드로 점프"** 로 변경.

### Before (라인 434~435)

```js
    const isLastRound = roundIdx >= schedule.length - 1;
    const nextIdx = matchMode === "schedule" && !isExtraRound && !isLastRound ? roundIdx + 1 : null;
```

### After

```js
    const sched = newSchedule || schedule;
    let scanIdx = roundIdx + 1;
    while (scanIdx < sched.length && confirmedRounds[scanIdx]) scanIdx++;
    const nextIdx = (matchMode === "schedule" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
```

> `newSchedule`는 6팀 스플릿 후반부 확장 케이스. 해당 분기에서 schedule이 확장되므로 `newSchedule || schedule`로 정확한 길이를 참조한다.

## 동작 검증 (케이스별)

| 케이스 | 입력 | 결과 | 비고 |
|--------|------|------|------|
| 정상 순차 확정 | R12 확정, `confirmedRounds[12]` 없음 | `nextIdx = 12` | 기존과 동일 |
| 재확정 (버그 케이스) | R11 재확정, `confirmedRounds[11] = true` | `nextIdx = 12` | 수정 효과 |
| 마지막 라운드 | R15 확정 (schedule.length=15) | `nextIdx = null` | 기존과 동일 |
| 중간 재확정, 이후 전부 확정 | R5 재확정, `confirmedRounds[5..14]` 모두 true | `nextIdx = null` | 끝까지 스캔 |
| 6팀 스플릿 후반부 생성 | R6 확정 시 schedule 확장 (6→12) | `sched.length = 12` 기준으로 스캔 | 기존 스플릿 로직 유지 |

## 유지 (변경 없음)

- `useGameReducer.js`의 `CONFIRM_ROUND` / `UNCONFIRM_ROUND` 리듀서
- `ScheduleMatchView`의 화살표 `disabled` 조건 (`viewingRoundIdx >= currentRoundIdx`)
- 시트 저장 로직
- 확정취소는 선택된 라운드만 풀도록 유지 (R11 취소해도 R12 확정/데이터 유지)

## 영향 범위

- 파일 1개: `src/App.jsx`
- 함수 1개: `confirmRound`
- 약 4줄 변경
- 다른 기능에 사이드이펙트 없음 (정상 순차 확정 시 동작 동일)

## 테스트 시나리오

1. 15라운드 경기에서 R1~R12 정상 확정 → R13 이동 가능 (▶ enabled)
2. R11 확정취소 → R11 수정 → R11 재확정 → R12 이동 → **▶ enabled** (R13 접근 가능)
3. R1 확정취소 → R1 재확정 → R2 ▶ enabled (R3 이후 모두 확정된 경우 최종 미확정 라운드로 점프)
4. 마지막 R15 재확정 → 추가 라운드 없음 (`nextIdx = null`), 기존 UX 유지

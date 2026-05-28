# 균등 자동 스케줄 (Balanced Auto-Schedule) 설계

**작성일**: 2026-05-28
**대상 모드**: 풋살(App.jsx) — `matchMode === "free"` 모드의 보조 기능

## 1. 배경 & 문제

지금 풋살 앱은 게임 생성 시점에 `courtCount`와 `matchMode`가 고정되고, 대진표(`schedule`) 모드는 그 시점의 코트 수에 맞춰 한 번에 전체 스케줄을 생성한다(`src/utils/brackets.js`).

현실에선 다음과 같은 변칙 일정이 종종 발생한다:

- 예약 사정으로 **전반 1코트(1h) + 후반 2코트(1h)**, 또는 그 반대
- 게임 중간에 가용 코트 수가 바뀜
- 1시간 단위로 운영 구간이 나뉘는 게 일반적

요구사항:

- **누적 매치 수가 모든 팀에 균등**해야 함 (이게 최우선)
- 운영자가 게임 도중에 "지금부터 자동 대진"을 트리거 가능
- 트리거 시점에 그 구간(segment)의 코트 수를 따로 지정 가능
- 여러 번 트리거해도 누적 균등이 유지되어야 함

## 2. 멘탈 모델

- 사용자는 **자유대진 모드**로 게임을 시작/진행한다.
- 임의의 시점에 **"대진표 자동설정"** 을 누르면, 그 시점까지의 누적 매치 수를 입력으로 균등한 라운드 묶음(=segment)이 schedule에 추가된다.
- segment가 끝나면 다시 자유대진으로 돌아오거나, 또 자동설정을 눌러 새 segment를 추가할 수 있다.
- "전반/후반"은 사용자 머릿속의 개념일 뿐, 시스템에는 저장하지 않는다.
- 입력은 **각 팀이 이 segment에서 다른 팀과 몇 번씩 만날지(=라운드로빈 사이클 수)** + **코트 수** + **매치당 시간(미리보기용)** 만 받는다.

## 3. 사용자 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 지원 시나리오 | (b) 전반 수동 + 후반 자동 균등화 — **코트수 변수화** 포함 |
| 균등 불가능 시 | 안전 균등 범위만 자동 생성, 나머지 시간은 자유대진 수동 |
| 입력 방식 | 코트 수 + 라운드로빈 사이클 수("몇 번씩 대전할지") + 매치당 시간(미리보기) |
| 위치 | `matchMode === "free"` 모드의 보조 기능 |
| 진행 방식 | 자동 생성된 schedule은 대진표 모드처럼 고정 진행 (라운드 단위 확정) |
| 시멘틱 라벨 | "전반/후반" 같은 메타데이터는 도입하지 않음 |
| 모달 컴포넌트 | 기존 `ScheduleModal`을 재사용 (빈 상태 + 자동설정 버튼 추가) |

## 4. 핵심 알고리즘: 균등 자동 스케줄러

### 4.1 입력

```js
generateBalancedSegment({
  teamCount,    // 5 (게임 시작 시 고정)
  courtCount,   // 1 or 2 — 이 segment에서 쓸 코트 수
  cycles,       // 1, 2, 3 ... — "몇 번씩 대전할지"
})
// 반환: [{ matches: [[homeIdx, awayIdx], ...] }, ...] — schedule append 형식
```

알고리즘 자체는 누적 매치 수를 필요로 하지 않는다(v1 전제: 자유대진 구간이 균등).
누적 매치 수는 **모달 미리보기 표시용**으로만 별도 계산한다.

### 4.2 알고리즘 (Round-Robin Cycle Repeat)

v1 전제: 호출 시점의 `currentTeamMatches`가 균등하다(자유대진 단계에서 사용자가 균등 유지). 비균등이면 모달이 경고하지만 보정은 v2.

1. **단일 사이클 라운드 풀 생성**
   - `generateRoundRobin([0..N-1])` 호출 (이미 `src/utils/brackets.js:68-85`에 있음, circle method)
   - 결과: `[[match,match,...], [match,match,...], ...]` — 각 내부 배열이 1라운드의 동시 매치 묶음 (N팀이면 N-1라운드, 각 라운드 N/2 또는 (N-1)/2 매치)
   - 5팀이면 5라운드 × 2매치 = 10매치, 각 라운드 1팀 자동 휴식 (circle method 성질)

2. **코트 수에 맞춰 라운드 분해**
   - **2코트 (= 라운드 = 동시진행 슬롯)**: 풀의 라운드 구조를 그대로 사용
   - **1코트 (직렬)**: 각 동시 매치를 별도 라운드로 분리 (`generate1Court`와 동일 방식)
   - **`courtCount > 풀의 라운드 당 매치 수`인 경우**: 풀의 라운드 그대로 (남는 코트는 미사용)

3. **사이클 반복**
   - `cycles` 횟수만큼 1~2단계 결과를 반복 추가
   - 라운드 인덱스(`R{n}`)는 `startRoundIdx + 1`부터 순차 부여

4. **출력**
   - `[{ matches: [[homeIdx, awayIdx], ...] }, ...]` — 기존 `schedule` 구조와 동일
   - 호출자가 기존 schedule에 **append**

### 4.3 비균등 상태 경고 (v1)

`currentTeamMatches`의 max - min ≥ 1이면 모달에 경고:

> "현재 팀 간 매치 수 차이가 N매치 있습니다. 이 자동 스케줄은 균등을 추가 보정하지 않으므로 최종 누적이 동일하지 않을 수 있습니다."

생성은 허용 (사용자가 명시적으로 결정). 보정 알고리즘은 v2.

### 4.4 테스트 케이스

| N | 코트 | 사이클 | 시작 누적 | 결과 | 검증 |
|---|---|---|---|---|---|
| 5 | 2 | 1 | [0,0,0,0,0] | 10매치 / 5라운드 | 각 팀 4경기, 각 팀 1번 휴식 |
| 5 | 1 | 1 | [0,0,0,0,0] | 10매치 / 10라운드 | 각 팀 4경기 |
| 5 | 2 | 2 | [4,4,4,4,4] | 20매치 / 10라운드 | 각 팀 +8경기 (12 누적) |
| 4 | 2 | 1 | [0,0,0,0] | 6매치 / 3라운드 | 각 팀 3경기 |
| 5 | 1 | 2 | [2,2,2,2,2] | 20매치 / 20라운드 | 각 팀 +8경기 (10 누적) |
| 5 | 2 | 1 | [4,4,4,4,4] (자유대진 후) | 10매치 추가 | 누적 각 팀 8경기 |

## 5. UI 변경

### 5.1 자유대진 모드 — 대진표 버튼 노출 (`src/App.jsx`)

**현재** (라인 1245-1247):
```jsx
{matchMode === "schedule" && (
  <button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
)}
```

**변경**:
```jsx
<button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
```

(조건 제거, 항상 노출)

### 5.2 ScheduleModal 보강 (`src/components/game/ScheduleModal.jsx`)

#### 5.2.1 빈 상태 처리
```jsx
if (schedule.length === 0) {
  return (
    <Modal onClose={onClose} title="대진표">
      <div style={{ textAlign: "center", color: C.gray, padding: 24 }}>
        아직 자동 생성된 대진표가 없습니다.
      </div>
      {/* 자동설정 버튼 */}
    </Modal>
  );
}
```

#### 5.2.2 자동설정 버튼 추가 (자유대진 모드에서만)
- 모달 하단(또는 상단)에 `[+ 대진표 자동설정]` 버튼
- 클릭 시 `BalancedScheduleModal` 오픈
- 대진표 모드(`matchMode === "schedule"`)에선 노출 안 함 (기존 스케줄과 충돌 위험)

#### 5.2.3 자유 매치 안내
- `completedMatches.filter(m => m.matchId?.startsWith('F'))` 개수가 1 이상이면 모달 상단에 한 줄 안내:
  *"자유 매치 N개 별도 진행"*
- 자유 매치를 표 형태로 표시하지는 않음 — 라이브 화면에서 매치 단위 네비게이션으로 확인하는 게 자연스러움

#### 5.2.4 formatDesc 확장
- 자유대진 + 자동 라운드 N개 케이스 추가:
  - `"자유대진 + 자동 ${schedule.length}라운드 × ${courtCount}코트"`

### 5.3 BalancedScheduleModal — 신규 컴포넌트

`src/components/game/BalancedScheduleModal.jsx`

```
┌──────────────────────────────────────┐
│ 대진표 자동설정                       │
│                                      │
│ 코트 수:        [1]  [2 ✓]            │
│ 몇 번씩 대전:   [1번씩] [2번씩] [3번씩]│
│ 매치당 시간:    [10]분                 │
│                                      │
│ ─── 미리보기 ───                      │
│ 총 매치 수:    10 (5팀 × 4 / 2)        │
│ 각 팀 추가:    +4경기 (현재 2 → 6)     │
│ 라운드 수:     5R × 2코트              │
│ 예상 소요:     약 50분                 │
│                                      │
│ ★ 미리보기 매치업                       │
│  R1: 보영vs승훈 / 종현vs진수            │
│       휴식: 주열                       │
│  R2: 보영vs종현 / 승훈vs주열            │
│       휴식: 진수                       │
│  ... (전체 N라운드)                    │
│                                      │
│ [취소]              [생성]            │
└──────────────────────────────────────┘
```

- **입력**:
  - 코트 수 (`segBtn` [1] [2])
  - 사이클 수 ("몇 번씩 대전") [1] [2] [3]
  - 매치당 시간 (분 단위 입력)
    - **기본값 산출 우선순위**:
      1. `completedMatches` 안의 매치들이 ≥ 3개면, 각 매치의 이벤트 시각 범위(`max(timestamp) - min(timestamp)`)의 평균을 분 단위로 반올림한 값
      2. 데이터 부족(≤ 2매치 또는 모두 이벤트 1개 이하)이면 **10분 고정**
    - placeholder/초기값으로 채우고 사용자가 자유 수정
- **실시간 미리보기**:
  - 입력 바뀔 때마다 알고리즘 dry-run으로 매치업/라운드 수 계산
  - 표시: 총 매치 수, 각 팀 추가 수, 라운드 수, 예상 소요 시간, 전체 매치업 리스트
- **확인** 누르면 schedule에 append + `courtCount` 업데이트 + 자유대진 → ScheduleView 화면 전환

## 6. 데이터 모델 변경

### 6.1 schedule append 방식

기존 `schedule` 배열에 새 라운드들을 **append**한다. 자유대진 매치는 별도 ID 공간(`F{n}_C{c}`) 사용 중이므로 충돌 없음. `R{n}_C{c}`의 `n`은 `schedule.length` 기준이라 자연스럽게 이어진다.

### 6.2 새 reducer 액션

```js
// src/hooks/useGameReducer.js
case 'APPEND_SCHEDULE_SEGMENT': {
  // action: { newRounds: [{ matches: [...] }, ...], newCourtCount }
  return {
    ...state,
    schedule: [...state.schedule, ...action.newRounds],
    courtCount: action.newCourtCount,
    // currentRoundIdx는 그대로 둠 (이미 확정된 라운드 다음을 가리킴)
  };
}
```

### 6.3 firebaseSyncDiff.js 영향

- `schedule`, `courtCount`는 이미 동기화 대상 (`firebaseSyncDiff.js:6`)
- 새 액션은 두 필드만 갱신 → 기존 sync 로직으로 자동 처리됨
- 추가 작업 없음

### 6.4 모드 표시

- `matchMode`는 **`"free"` 그대로 유지**
- `schedule.length > 0`이고 미확정 라운드가 있으면 → `ScheduleMatchView` 렌더링
- 모든 자동 라운드 확정 끝나면 → 다시 `FreeMatchView`로 자동 복귀
- App.jsx 렌더 분기 수정 필요 (라인 1352 근처):
  ```jsx
  ) : (matchMode === "schedule" || schedule.length > 0) && !allRoundsComplete && !isExtraRound ? (
    <ScheduleMatchView ... />
  ) : (
    <FreeMatchView ... />
  )
  ```

## 7. 알고리즘 구현 위치

`src/utils/balancedSchedule.js` — 신규 파일

```js
import { generateRoundRobin } from './brackets';

export function generateBalancedSegment({ teamCount, courtCount, cycles }) {
  const pool = generateRoundRobin([...Array(teamCount).keys()]);
  // pool: [[match,match], [match,match], ...] (circle method)

  const oneCycle = courtCount >= 2
    ? pool.map(round => ({ matches: round }))
    : pool.flatMap(round => round.map(m => ({ matches: [m] })));

  return Array.from({ length: cycles }).flatMap(() => oneCycle);
}

// 모달 미리보기용 누적 카운팅 헬퍼
export function countCurrentMatchesPerTeam(completedMatches, teamCount) {
  const counts = Array(teamCount).fill(0);
  for (const m of completedMatches) {
    if (m.homeIdx != null) counts[m.homeIdx]++;
    if (m.awayIdx != null) counts[m.awayIdx]++;
  }
  return counts;
}
```

## 8. 테스트 전략

`src/utils/__tests__/balancedSchedule.test.js`

- 표 4.4의 모든 케이스 단위 테스트
- 각 케이스에서 검증할 invariants:
  - 각 팀 매치 수가 정확히 균등
  - 같은 라운드 내 팀 충돌 없음
  - 매치업 다양성 (cycles=1이면 모든 쌍 정확히 1번)
  - 휴식 분배 (5팀·2코트면 각 팀 정확히 1번 휴식 per cycle)

UI 통합 테스트는 본 스펙 범위 밖.

## 9. 범위 제한 (v1 명시적 제외)

- **누적 비균등 보정**: 사용자가 자유대진 진행 중 매치 수를 균등하게 유지했다고 가정. 비균등이면 모달에 경고만 표시, 자동 보정은 v2.
- **자동 생성된 segment의 부분 수정**: 일단 라운드 단위 swap 기능 없음. 잘못 만들었으면 schedule 일괄 폐기(reducer 액션 추가) 또는 라운드 확정취소로 처리.
- **자유 매치를 ScheduleModal에서 표 형태로 표시**: 안내 라인만 표시, 표 통합은 v2.
- **3코트 이상 지원**: 현재 앱이 2코트 한계이므로 동일하게 유지.
- **다른 팀 수에 대한 풀 검증**: 4·5·6팀은 핵심 케이스. 7팀 이상은 알고리즘 자체는 일반화되지만 본 스펙에선 4·5·6에 한정해 검증.

## 10. 구현 순서 (요약)

1. `balancedSchedule.js` 알고리즘 + 단위 테스트
2. `BalancedScheduleModal.jsx` 신규
3. `useGameReducer.js`에 `APPEND_SCHEDULE_SEGMENT` 액션
4. `ScheduleModal.jsx` 빈 상태 + 자동설정 버튼 + formatDesc 확장
5. `App.jsx` — 대진표 버튼 노출 조건 완화, 렌더 분기 수정
6. 통합 점검 (자유대진 → 자동 → 라운드 진행 → 자유대진 복귀 → 자동 #2)

상세 구현 단계는 별도 implementation plan에서 진행.

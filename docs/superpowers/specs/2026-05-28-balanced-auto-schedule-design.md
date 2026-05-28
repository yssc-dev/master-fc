# 균등 자동 스케줄 (Balanced Auto-Schedule) 설계

**작성일**: 2026-05-28
**개정**: v1.1 (논리 결함 검토 반영)
**대상 모드**: 풋살(App.jsx) — `matchMode === "free"` 모드의 보조 기능

## v1.1 변경 요약
- §4.2: 6팀 2코트는 본 기능 비활성화 명시
- §5.1: 대진표 버튼 노출 조건 + 자동설정 버튼 활성화 조건 분리 명시
- §5.3: 라이브 매치 가드 + 매치당 시간 자동 추정 범위 한정 + 모달 입력값 보존 정책
- §5.4 (신규): App.jsx의 `allRoundsComplete`, `confirmRound`, 렌더 분기 수정
- §6.2: APPEND_SCHEDULE_SEGMENT의 currentRoundIdx 검증 케이스 추가
- §9: 6팀 2코트 비활성화, segment 도중 자유대진 끼워넣기 차단 명시

## v1.2 변경 요약 (기존 모드 회귀 방지)
- §5.4.3: 렌더 분기를 `shouldShowSchedule` 헬퍼로 정리. 대진표 모드는 라운드 완료 후에도 ScheduleView 잔류(기존 동작 보존), free 모드만 완료 시 자동 복귀.
- §5.4.4: 하단 바도 동일 조건 사용 — 대진표 모드의 "확정취소" 버튼이 라운드 완료 후에도 노출되도록 보존.
- §10: 회귀 검증 시나리오 (d)~(h) 추가 — 5팀·4팀·6팀·push·1코트 schedule 모드 모두 검증 명시.

## 기존 경기 방식 영향 요약
**대진표(schedule), 밀어내기(push) 모드에 동작 변경 없음** — 모든 수정은 다음 두 케이스 중 하나:
1. `matchMode === "free" && schedule.length > 0` (신규 케이스) 처리만 추가
2. 헬퍼 변수로 묶어 양쪽 분기에 같은 의미를 부여 (행동표가 기존과 동일)

§10 (d)~(h) 회귀 시나리오로 통합 점검 시 명시적 확인.

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

v1 전제:
- 호출 시점의 `currentTeamMatches`가 균등하다(자유대진 단계에서 사용자가 균등 유지). 비균등이면 모달이 경고하지만 보정은 v2.
- **지원 팀수: 4팀, 5팀만**. 3팀(courtCount=1 강제, 자동 의미 약함), 6팀(라운드 분해 비자명, §9 참조), 7팀+ (검증 범위 밖)는 본 기능 비활성화.

1. **단일 사이클 라운드 풀 생성**
   - `generateRoundRobin([0..N-1])` 호출 (이미 `src/utils/brackets.js:68-85`에 있음, circle method)
   - 결과: `[[match,match,...], [match,match,...], ...]` — 각 내부 배열이 1라운드의 동시 매치 묶음 (N팀이면 N-1라운드)
   - 4팀: 3라운드 × 2매치 = 6매치, 각 팀 3경기, 휴식 없음
   - 5팀: 5라운드 × 2매치 = 10매치, 각 팀 4경기, 각 팀 1번 휴식 (circle method 성질)

2. **코트 수에 맞춰 라운드 분해**
   - **2코트**: 풀의 라운드 구조를 그대로 사용 (4팀·5팀 모두 라운드 당 2매치)
   - **1코트 (직렬)**: 각 동시 매치를 별도 라운드로 분리 (`generate1Court`와 동일 방식)

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
| 5 | 2 | 2 | [0,0,0,0,0] | 20매치 / 10라운드 | 각 팀 8경기 |
| 4 | 2 | 1 | [0,0,0,0] | 6매치 / 3라운드 | 각 팀 3경기, 휴식 없음 |
| 4 | 1 | 2 | [0,0,0,0] | 12매치 / 12라운드 | 각 팀 6경기 |
| 5 | 1 | 2 | [2,2,2,2,2] | 20매치 / 20라운드 | 각 팀 +8경기 (10 누적) |
| 5 | 2 | 1 | [4,4,4,4,4] | 10매치 / 5라운드 | 누적 각 팀 8경기 |

알고리즘은 누적값을 사용하지 않지만, 사용자 시나리오(자유대진 후 segment 추가)가 균등을 유지하는지 표 형식으로 검증.

## 5. UI 변경

### 5.1 자유대진 모드 — 대진표 버튼 노출 (`src/App.jsx`)

**현재** (라인 1245-1247):
```jsx
{matchMode === "schedule" && (
  <button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
)}
```

**변경** — push 모드 제외 후 항상 노출:
```jsx
{matchMode !== "push" && (
  <button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
)}
```

push 모드는 schedule 개념이 없어서 제외. schedule/free 양쪽에서 동일 모달 진입.

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
- **노출 조건**: `matchMode === "free"` 이고 `teamCount in {4, 5}` 일 때만
- 그 외 케이스 처리:
  - `matchMode === "schedule"`: 노출 안 함 (기존 스케줄과 충돌)
  - `teamCount === 3`: 노출 안 함, 모달에 안내 *"3팀은 1코트 진행이라 자동설정 대상이 아닙니다"*
  - `teamCount === 6`: 노출 안 함, 모달에 안내 *"6팀은 그룹스플릿 모드를 사용해주세요"*
  - `teamCount >= 7`: 노출 안 함, 안내 *"본 기능은 4·5팀에서 지원합니다"*

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
      1. **최근 5매치**(`completedMatches.slice(-5)`) 중 이벤트 ≥ 2개인 매치들에서 각각 `max(eventTimestamp) - min(eventTimestamp)` 계산
      2. 위 조건을 만족하는 매치가 ≥ 2개면 그 평균을 분 단위로 올림(`Math.ceil`), 그렇지 않으면 **10분 고정**
      3. 자유 매치와 R 매치 모두 포함 (둘 다 실제 운영 페이스 반영)
    - placeholder/초기값으로 채우고 사용자가 자유 수정
- **실시간 미리보기**:
  - 입력 바뀔 때마다 알고리즘 dry-run으로 매치업/라운드 수 계산
  - 표시: 총 매치 수, 각 팀 추가 수, 라운드 수, 예상 소요 시간, 전체 매치업 리스트
- **모달 입력값 보존 정책**: 취소 또는 모달 닫기 시 입력값 **초기화** (다음 열 때 기본값으로 다시 계산). 단순함 우선.
- **라이브 매치 가드**: `[생성]` 누르기 전 검사
  - FreeMatchView의 각 코트 슬롯(`courtMatches`)에 매치가 설정되어 있거나 해당 `F{n}_C{c}` matchId의 `allEvents`에 이벤트가 있으면 **블로킹**
  - 알림: *"라이브 매치를 먼저 확정하거나 취소한 뒤 자동설정을 진행해주세요"*
  - 가드 통과해야 schedule append + `courtCount` 업데이트 + ScheduleView로 자동 전환

### 5.4 App.jsx 핵심 수정 — `matchMode === "free"` + `schedule.length > 0` 케이스 인식

자동 스케줄은 `matchMode='free'`를 유지한 채 `schedule` 배열만 채우는 방식이라, 현재 코드의 여러 곳이 *"matchMode === 'schedule'이어야만 schedule 관련 처리"* 조건을 갖고 있는 점을 풀어줘야 한다.

#### 5.4.1 `allRoundsComplete` (`src/App.jsx:338-346`)
**현재**:
```js
const allRoundsComplete = useMemo(() => {
  if (matchMode === "schedule" && schedule.length > 0) {
    const lastIdx = schedule.length - 1;
    return confirmedRounds[lastIdx] === true;
  }
  return false;
}, [matchMode, schedule, confirmedRounds, phase]);
```
**변경**:
```js
const allRoundsComplete = useMemo(() => {
  if (schedule.length > 0 && matchMode !== "push") {
    const lastIdx = schedule.length - 1;
    return confirmedRounds[lastIdx] === true;
  }
  return false;
}, [matchMode, schedule, confirmedRounds, phase]);
```

이로써 `matchMode='free'` + schedule 다 확정 → `allRoundsComplete=true` → 렌더 분기에서 FreeMatchView로 복귀 가능.

#### 5.4.2 `confirmRound` 의 `nextRoundIdx` (`src/App.jsx:611`)
**현재**:
```js
const nextIdx = (matchMode === "schedule" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
```
**변경**:
```js
const nextIdx = (matchMode !== "push" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
```

라운드 확정 시 free 모드에서도 다음 라운드로 자동 이동.

#### 5.4.3 렌더 분기 (`src/App.jsx:1352`)

⚠️ **회귀 방지 주의**: 기존 대진표 모드는 모든 라운드 확정 후에도 ScheduleMatchView 잔류(과거 라운드 리뷰/수정용). 이걸 깨면 안 됨.

**현재**:
```jsx
matchMode === "push" ? <PushMatchView ... />
  : matchMode === "schedule" && schedule.length > 0 && !isExtraRound ? <ScheduleMatchView ... />
  : <FreeMatchView ... />
```

**변경** — mode별 분기 명시:
```jsx
// 헬퍼 변수 — 5.4.4와 공유
const shouldShowSchedule =
  matchMode !== "push" &&
  schedule.length > 0 &&
  !isExtraRound &&
  !(matchMode === "free" && allRoundsComplete);  // free 모드만 자동 복귀

matchMode === "push" ? <PushMatchView ... />
  : shouldShowSchedule ? <ScheduleMatchView ... />
  : <FreeMatchView ... />
```

**행동표 — 회귀 없음 검증**:
| matchMode | schedule.length | allRoundsComplete | 결과 | 기존과 동일? |
|---|---|---|---|---|
| schedule | > 0 | false | ScheduleView | ✅ 동일 |
| schedule | > 0 | true | ScheduleView | ✅ 동일 (확정취소 가능) |
| free | 0 | — | FreeView | ✅ 동일 |
| free | > 0 | false | ScheduleView | 🆕 신규 동작 |
| free | > 0 | true | FreeView | 🆕 신규 (자동 복귀) |
| push | — | — | PushView | ✅ 동일 |

#### 5.4.4 하단 바 / 라운드 확정 UI (`src/App.jsx:1377`)

⚠️ **회귀 방지**: 기존 대진표 모드는 라운드 완료 후에도 하단바의 "확정취소" 버튼을 노출. 그대로 유지해야 함.

**현재**:
```jsx
{matchMode === "schedule" && schedule.length > 0 && !isExtraRound && (...)}
```
**변경** — §5.4.3의 `shouldShowSchedule` 재사용:
```jsx
{shouldShowSchedule && (...)}
```

이로써 대진표 모드는 라운드 완료 후에도 하단바 유지(기존 동작), free 모드는 라운드 완료 시점에 자동 복귀(신규).

#### 5.4.5 진행 상태 텍스트 (`src/App.jsx:1236-1237`)
**현재**:
```jsx
{matchMode === "schedule"
  ? (allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1} / ${schedule.length}`)
  ...
}
```
**변경 — schedule.length > 0 일 때도 동일 표시**:
```jsx
{(matchMode === "schedule" || (matchMode === "free" && schedule.length > 0))
  ? (allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1} / ${schedule.length}`)
  : matchMode === "free"
  ? `자유대진 · ${completedMatches.length}매치`
  ...
}
```

#### 5.4.6 매치 모드 라벨 (`src/App.jsx:1317, 1322`)
formatDesc 갱신 시 §5.2.4와 일관되게 처리: `matchMode === "free" && schedule.length > 0` 케이스에 `"자유대진 + 자동 ${schedule.length}라운드"` 형태로.

## 6. 데이터 모델 변경

### 6.1 schedule append 방식

기존 `schedule` 배열에 새 라운드들을 **append**한다. 자유대진 매치는 별도 ID 공간(`F{n}_C{c}`) 사용 중이므로 충돌 없음. `R{n}_C{c}`의 `n`은 `schedule.length` 기준이라 자연스럽게 이어진다.

### 6.2 새 reducer 액션

```js
// src/hooks/useGameReducer.js
case 'APPEND_SCHEDULE_SEGMENT': {
  // action: { newRounds: [{ matches: [...] }, ...], newCourtCount }
  const newSchedule = [...state.schedule, ...action.newRounds];
  // currentRoundIdx 보정: 이전 segment를 다 확정했으면 첫 새 라운드를 가리키도록,
  // 미확정이 남아있으면 그 위치 유지.
  const prevLen = state.schedule.length;
  let nextCurrent = state.currentRoundIdx;
  if (prevLen === 0 || nextCurrent >= prevLen) {
    nextCurrent = prevLen; // 새로 append된 첫 라운드
  }
  return {
    ...state,
    schedule: newSchedule,
    courtCount: action.newCourtCount,
    currentRoundIdx: nextCurrent,
    viewingRoundIdx: nextCurrent,
  };
}
```

**검증 케이스**:
| 시나리오 | prevLen | prev currentRoundIdx | append 후 currentRoundIdx |
|---|---|---|---|
| 첫 segment (자유대진만 진행) | 0 | 0 | 0 |
| segment #1 전부 확정 → segment #2 추가 | 5 | 5 | 5 |
| segment #1 중간(R3 확정) 멈췄다가 segment #2 추가(가드 통과해도?) | 5 | 3 | 3 (보존) |
| segment #1 일부 확정 안 한 채 추가 호출 | 5 | 0 | 0 |

§5.3 라이브 매치 가드는 이벤트 관점이고, 라운드 미확정 상태(events는 매치마다 라운드 확정에서 묶임)는 별개. v1에선 "라운드 확정 안 한 채로 segment 추가"는 허용(단순). 사용자가 같은 schedule 흐름 안에서 추가 라운드 더하는 셈.

### 6.3 firebaseSyncDiff.js 영향

- `schedule`, `courtCount`는 이미 동기화 대상 (`firebaseSyncDiff.js:6`)
- 새 액션은 두 필드만 갱신 → 기존 sync 로직으로 자동 처리됨
- 추가 작업 없음

### 6.4 모드 표시

- `matchMode`는 **`"free"` 그대로 유지**
- `schedule.length > 0`이고 미확정 라운드가 있으면 → `ScheduleMatchView` 렌더링
- 모든 자동 라운드 확정 끝나면 → 다시 `FreeMatchView`로 자동 복귀
- 구체 수정은 §5.4 참조

### 6.5 자유 매치 ID 카운터

`FreeMatchView.jsx:32`의 라이브 매치 ID 생성:
```js
const getLiveMatchId = (ci) => `F${completedMatches.length + ci + 1}_C${ci}`;
```

`completedMatches`에 R 매치(자동 segment 결과)도 포함되므로, **자유 매치 인덱스가 점프함** (예: F1, F2 → 10개 R 매치 → 다음 F는 F13).

**v1 결정**: 그대로 유지 (단순). matchId 충돌 없음. 운영자 시각에서 어색해도 점수/통계엔 영향 없음. F-only 카운터 분리는 v2 후보.

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
- **자동 생성된 segment의 부분 수정**: 일단 라운드 단위 swap 기능 없음. 잘못 만들었으면 라운드 확정취소로 되돌리거나 schedule 일괄 폐기(v2).
- **자유 매치를 ScheduleModal에서 표 형태로 표시**: 안내 라인만 표시, 표 통합은 v2.
- **3코트 이상 지원**: 현재 앱이 2코트 한계이므로 동일하게 유지.
- **6팀 자동 스케줄**: 6팀 2코트는 라운드 분해가 비자명(풀 라운드 = 3매치, 코트 = 2). 본 기능 비활성화, 모달에서 안내. 6팀은 기존 그룹스플릿 모드 사용.
- **3팀, 7팀+ 자동 스케줄**: 본 기능 비활성화. 4·5팀만 지원.
- **segment 도중 자유대진 복귀**: 자동 생성된 라운드는 모두 진행해야 자유대진으로 복귀. 도중에 빠지려면 라운드 확정취소를 사용. schedule 일괄 폐기 액션은 v2 후보.
- **F 매치 인덱스 점프**: §6.5 참조. 카운터 분리는 v2.
- **다른 팀 수에 대한 풀 검증**: 4·5팀 한정 검증.

## 10. 구현 순서 (요약)

1. **`src/utils/balancedSchedule.js` 신규** — 알고리즘 + 단위 테스트 (§4.4 표 전체)
2. **`src/hooks/useGameReducer.js`** — `APPEND_SCHEDULE_SEGMENT` 액션 + currentRoundIdx 보정 (§6.2)
3. **`src/App.jsx` 핵심 조건 정리** (§5.4 5개 지점) — 이 단계가 가장 위험. 먼저 *기존 schedule 모드 회귀 테스트* 통과 확인 후 진행.
4. **`src/components/game/BalancedScheduleModal.jsx` 신규** — 입력 UI + 라이브 매치 가드 + 매치당 시간 추정 + 미리보기
5. **`src/components/game/ScheduleModal.jsx`** — 빈 상태, 자동설정 버튼(노출 조건 §5.2.2), formatDesc 확장, 자유 매치 안내
6. **`src/App.jsx` 진입점** — `matchMode !== "push"`로 대진표 버튼 노출 (§5.1)
7. **통합 점검 시나리오**:

   **신규 기능 검증**:
   - (a) 5팀 자유대진 시작 → 자유 매치 2개 → 자동 1코트 1사이클(5R) → 모두 확정 → **FreeMatchView 자동 복귀 확인** → 자동 2코트 1사이클(5R) → 모두 확정 → 경기마감 → 통계 확인 (각 팀 누적 8경기 균등)
   - (b) 4팀 자유대진 → 자동 2코트 2사이클(6R) → 각 팀 6경기 확인
   - (c) 라이브 매치 진행 중 자동설정 클릭 → **가드 알림 노출, 진행 차단 확인**

   **기존 모드 회귀 검증 (필수)**:
   - (d) **5팀 2코트 schedule 모드** — 처음부터 끝까지 진행 → 모든 라운드 확정 후 **ScheduleView 잔류 확인** (FreeView로 전환되면 안 됨) → 하단 "확정취소" 버튼 노출 확인 → 경기마감 정상
   - (e) **4팀 2코트 schedule 모드** — 12라운드 진행 → 같은 회귀 검증
   - (f) **6팀 2코트 그룹스플릿 모드** — 전반 6R → midSplit → 후반 6R → 동일 회귀 검증
   - (g) **밀어내기(push) 모드** — schedule 관련 변경이 영향 없음 확인 (대진표 버튼 숨김, PushMatchView 정상)
   - (h) **5팀 1코트 schedule 모드** — `rotations` 정상 동작 확인

상세 구현 단계는 별도 implementation plan에서 진행.

# 축구 기록화면 ◀▶ 연속체 전환 + 상대팀 변경 설계

- 날짜: 2026-07-01
- 대상: `src/components/game/SoccerMatchView.jsx`, `src/SoccerApp.jsx`, `src/hooks/useGameReducer.js`
- 관련 컴포넌트(무변경/소폭): `RoundNav`, `OpponentSelector`, `FormationRecorder`, `SoccerScheduleModal`

## 배경 / 문제

현재 축구 기록화면(상대팀 선택 = 다음 경기 생성 화면) 상단에 **`오늘 경기 (N경기)` 리스트**가 박혀 있어 이전 경기들의 스코어·대진결과를 나열한다(`SoccerMatchView.jsx` line 259~273). 이 정보는:

- **대진표 모달**(`SoccerScheduleModal.jsx`)에 이미 승/무/패 + 스코어가 다 나온다(line 44).
- 이전 경기의 세부(누구골·누구어시)는 리스트 항목을 **클릭**해야 읽기전용 보기로 진입한다.

풋살 모드는 리스트 없이 **◀▶ 화살표 하나의 연속체**로 과거↔현재를 오가고(`ScheduleMatchView`/`FreeMatchView`), 승무패 요약은 상단 대진표로 본다. 축구도 동일한 구조로 바꾼다.

추가로, **상대팀을 잘못 기입한 채 기록된 경우**(과거 경기 + 진행 중 경기)를 사후 정정할 수 있어야 한다.

## 목표 (Goals)

1. `오늘 경기` 리스트 제거. 축구 기록화면을 풋살식 **단일 ◀▶ 연속체**로 재구성.
2. 연속체에 **진행 중(레코더) 화면까지 포함**(풋살 완전동일) — 기록 도중에도 ◀로 과거를 열람하고 ▶로 복귀.
3. 과거 경기의 골/어시/GK/포메이션 수정은 **기존 `확정취소` 게이트** 경로를 그대로 사용.
4. **상대팀 변경**: 과거·진행 중 경기 모두에 대해 `확정취소` 없이 즉시 상대팀을 교체.

## 비목표 (Non-goals)

- `FormationRecorder`에 readOnly 모드 신설(피치까지 읽기전용 표시) — 하지 않음. 과거는 기존 요약 뷰 유지.
- 과거 경기를 `확정취소` 없이 직접(in-place) 편집 — 하지 않음(“진행중 최대 1개” 불변식 유지).
- 풋살 모드 코드 변경 — 절대 없음(공용 `RoundNav`만 그대로 재사용).
- 대진표/팀순위/개인기록 모달 변경 — 없음.

---

## 설계 ① — ◀▶ 연속체 (`SoccerMatchView` 재구성)

### 연속체 모델 (matchIdx 순서 고정)

풋살 `ScheduleMatchView`의 `viewingRoundIdx` 패턴을 이식하되, reopen 시 노드가 재정렬되어 튀는 것을 막기 위해 **matchIdx 오름차순으로 노드를 고정**한다.

```
노드:  제1경기 · 제2경기 · … · 제K경기   │   [+ 새 경기]
       └ finished/휴식 = 읽기전용 요약 ┘   └ 진행 중 없을 때만 존재(맨 오른쪽) ┘
       └ playing = FormationRecorder(편집) ┘
```

정의:

- `orderedMatches = [...soccerMatches].sort((a,b) => a.matchIdx - b.matchIdx)` — finished/휴식 + 최대 1개의 playing.
- `playingPos` = `orderedMatches`에서 status가 `"playing"`인 인덱스, 없으면 `-1`.
- `hasPlaying = playingPos >= 0`.
- 트레일링 “새 경기” 노드는 **`hasPlaying`이 false일 때만** 존재(맨 오른쪽).
- 총 노드 수 `N = orderedMatches.length + (hasPlaying ? 0 : 1)`.
- **편집 노드 인덱스** `editableIdx = hasPlaying ? playingPos : orderedMatches.length`.

### navIdx (연속체 위치 상태)

- `SoccerMatchView` 로컬 `useState`. **탭별 로컬**(멀티탭에서 서로의 열람 위치를 뺏지 않음 — `FreeMatchView.viewingIdx` 패턴).
- 초기값 = `editableIdx`.
- **자동 포커스 리셋**: 경기 구조가 바뀌면(새 경기 생성 / 경기 종료 / 확정취소 / 휴식 추가) `navIdx = editableIdx`로 리셋 — “지금 할 일”에 포커스. 구현은 `FreeMatchView`의 `lastMatchCount` 가드 패턴을 따른다(구조 시그니처: `orderedMatches.length` + `playingPos`).
- 단순 이벤트 추가/삭제(골·어시 등)는 구조 시그니처를 바꾸지 않으므로 리셋되지 않음(열람 중 화면 안 뺏김).

### 노드 렌더링 규칙

상단에 `RoundNav`를 **모든 노드에서 항상** 표시. 그 아래 본문:

| navIdx | 대상 | 본문 |
| --- | --- | --- |
| 트레일링 새 경기(`= orderedMatches.length`, `!hasPlaying`) | — | `상대팀 선택 / 새 경기 생성`(OpponentSelector + 명단수정 + 휴식) |
| 매치 노드 & status `playing` | `orderedMatches[navIdx]` | `FormationRecorder`(편집) |
| 매치 노드 & status `finished`(일반) | 〃 | 읽기전용 요약(스코어카드 + 이벤트리스트) + `ConfirmBar`(확정취소) |
| 매치 노드 & status `finished`(휴식) | 〃 | `😴 휴식` 요약(확정취소 없음) |

- `오늘 경기` 리스트 블록(line 259~273) **완전 삭제**.
- 기존 `viewingMatch` 읽기전용 뷰(line 160~209)의 본문을 **매치 노드(finished)** 렌더로 재사용. 단, 자체 `RoundNav`/`← 돌아가기`는 상위 통합 `RoundNav`로 흡수(중복 제거).
- `FormationRecorder`는 uncontrolled — 노드 전환/복귀 시 `key={match.matchIdx}`로 remount해 경기 객체에서 재시드(기존 line 219 패턴 유지). 진행 중 경기에서 ◀로 과거를 봤다가 ▶로 돌아와도 상태는 리듀서(events)에서 파생되므로 유실 없음.

### RoundNav 라벨/상태칩

`RoundNav` props(`label,total,onPrev,onNext,canPrev,canNext,statusText,statusTone`) 재사용:

- `total = N`, `canPrev = navIdx > 0`, `canNext = navIdx < N-1`.
- 매치 노드: `label = "제{match.matchIdx+1}경기"`.
- 새 경기 노드: `label = "제{soccerMatches.length+1}경기"`.
- statusText/tone: finished→`종료됨`/green, 휴식→`휴식`/green, playing→`진행중`/orange, 새 경기→`새 경기`/gray.

### 서브플로우 (formation 설정 / 명단 수정)

- `formation`(포메이션 배치), `editRoster`(참석명단 수정)는 **새 경기 노드에서 진입하는 전용 전체화면 스텝**으로 유지 — `RoundNav` 없이 렌더, 완료/뒤로 시 새 경기 노드로 복귀(기존 `viewState` 머신 유지).
- `viewState`는 서브플로우 라우팅(+멀티탭 동기화)에 계속 사용. 노드 본문(playing/finished/새경기)은 **경기 status에서 파생**해 결정.

### reopen(확정취소) 상호작용

- 과거 매치 노드의 `ConfirmBar`에서 `확정취소` → `REOPEN_SOCCER_MATCH`(status playing 복귀, 다른 playing은 finished 정리) → 구조 변경 → `navIdx`가 그 경기(이제 `editableIdx`)로 리셋 → 전체 `FormationRecorder`로 골/어시/GK/포메이션 자유 편집. 기존 `handleReopenMatch`(line 125) 로직 유지, 화면 전환만 연속체에 맞춤.

---

## 설계 ② — 상대팀 변경

### 리듀서 신규 액션

`UPDATE_SOCCER_MATCH_FORMATION`은 포메이션 필드만 화이트리스트(line 913)라 재사용 불가. 신규 액션 추가:

```js
case 'SET_SOCCER_MATCH_OPPONENT': {
  const { matchIdx, opponent } = action;
  const matches = state.soccerMatches.map((m, i) =>
    i === matchIdx ? { ...m, opponent } : m
  );
  return { ...state, soccerMatches: matches };
}
```

- 상대팀은 경기 객체의 스칼라 필드. `soccerMatches`는 이미 RTDB 자식노드로 동기화되므로 별도 sync 배선 불필요(빈배열 함정 무관 — 스칼라).

### SoccerApp 핸들러/전달

- `const setSoccerMatchOpponent = (matchIdx, opponent) => dispatch({ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx, opponent });`
- `SoccerMatchView`에 prop `onSetMatchOpponent`로 전달.

### UI — RoundNav 옆 전용 버튼 → OpponentSelector 모달

- `RoundNav` 우측(또는 바로 아래)에 **`상대팀 변경` 버튼**. 표시 조건: 현재 노드가 **opponent를 가진 매치 노드(finished·playing)** 일 때만. 새 경기 노드/휴식 노드에서는 숨김(새 경기 노드는 OpponentSelector 자체가 이미 존재).
- 버튼 클릭 → `Modal`(공용) 안에 **`OpponentSelector` 재사용**:
  - `opponents` = `state.opponents`
  - `onSelect={(name) => { onSetMatchOpponent(match.matchIdx, name); closeModal(); }}`
  - `onAddOpponent`/`onRemoveOpponent`/`onRenameOpponent`는 기존 핸들러 전달 → 새 팀명 추가 시 `opponents` 목록에도 등록되고(line 17) 곧바로 해당 경기에 배정(line 18).
- 진행 중/과거 **모든 매치 노드에서 확정취소 없이 즉시** 상대팀 교체.

### 안전성

- 상대팀명은 세션 상태(reducer/RTDB)에만 존재하며 **경기마감(summary → 시트 전송) 전까지는 시트에 기록되지 않음** → 세션 내 변경은 시트 정합성 문제 없음.
- 이벤트(goal/opponentGoal 등)는 opponent 문자열을 참조하지 않음(opponentGoal은 `currentGk`만 저장) → 상대팀 변경이 기존 이벤트·집계를 깨지 않음.
- 이미 시트로 전송(마감)된 경기의 정정은 본 스펙 범위 밖(기존 시트 삭제+재전송 도구 소관).

---

## 변경 파일 요약

| 파일 | 변경 |
| --- | --- |
| `src/components/game/SoccerMatchView.jsx` | `오늘 경기` 리스트 삭제, `navIdx` 연속체 도입, 모든 노드 상단 `RoundNav`, 상대팀 변경 버튼+모달 |
| `src/hooks/useGameReducer.js` | `SET_SOCCER_MATCH_OPPONENT` 액션 추가 |
| `src/SoccerApp.jsx` | `setSoccerMatchOpponent` 핸들러 + `onSetMatchOpponent` prop 전달 |

`RoundNav`, `OpponentSelector`, `FormationRecorder`, `Modal`은 재사용(무변경 또는 소폭).

## 엣지 케이스

- 경기 0개(처음): 노드는 트레일링 새 경기 하나뿐 → `RoundNav`는 `제1경기 / 1`, ◀▶ 비활성. 상대팀 변경 버튼 숨김.
- 진행 중 경기가 유일 노드: `제N경기 / N`, ◀는 직전 과거 있으면 활성.
- 중간 경기 확정취소: 그 경기만 playing, 나머지 finished. 노드는 matchIdx 순 유지되고 그 경기 위치에서 편집(맨 오른쪽으로 튀지 않음).
- 휴식 노드: 상대팀 변경/확정취소 버튼 숨김, `😴 휴식` 표시.
- 멀티탭: 다른 탭이 경기를 종료/생성하면 이 탭의 `navIdx`는 구조 변경으로 `editableIdx`로 리셋(풋살 동일 동작).

## 테스트

- 리듀서 유닛테스트: `SET_SOCCER_MATCH_OPPONENT`가 해당 matchIdx의 opponent만 바꾸고 events/score/status를 보존.
- 기존 `syncCoverage`/reducer 테스트 그린 유지(soccerMatches 동기화 경로 무변경 확인).
- 수동 QA: (a) 화살표로 과거↔진행중↔새경기 이동, (b) 진행 중 ◀로 과거 열람 후 ▶ 복귀 시 레코더 상태 보존, (c) 과거/진행중 상대팀 변경 즉시 반영 + 대진표/집계 반영, (d) 확정취소 → 편집 → 재종료.

## 범위 밖 (Out of scope)

- 과거 경기 피치 읽기전용 표시(readOnly FormationRecorder).
- 과거 in-place 편집(확정취소 없이 골/어시 수정).
- 이미 마감(시트 전송)된 경기의 상대팀 정정.
- 풋살 모드 관련 일체.

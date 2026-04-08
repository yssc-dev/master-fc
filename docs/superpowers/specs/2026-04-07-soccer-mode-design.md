# 축구 모드 확장 설계

## 개요

기존 풋살 전용 플랫폼을 확장하여 축구(11 vs 11) 경기 기록을 지원한다. 풋살과 별도의 컴포넌트를 만들되, 기존 서비스(Firebase, Apps Script, Google Sheets)를 재사용한다.

## 핵심 결정사항

| 항목 | 결정 |
|------|------|
| 인원 | 11 vs 11 |
| 포메이션 | 1차: GK/DF만 구분, 2차: 시각적 포메이션 배치 (추후) |
| 교체 | 시점(분) + playerOut/playerIn 기록 |
| 상대팀 | 이름만 관리 (선수 정보 없음), 설정에서 등록/선택 |
| 점수 | 골+1, 어시스트+1, 자책골-1, 클린시트+1 (GK+전체DF) |
| 보너스 | 없음 (크로바/고구마 제외) |
| 시간 | 이벤트 입력 시 자동 timestamp (수동 분 입력 없음) |
| 경기 구성 | 하루에 1~N경기, 경기마다 상대팀이 다를 수 있음 |
| 저장소 | 기존 Google Sheets에 축구용 시트 탭 추가 |
| 아키텍처 | 축구 전용 컴포넌트 분리, 기존 서비스/유틸 재사용 |

---

## 아키텍처

### 새로 만들 파일

- `src/components/game/SoccerMatchView.jsx` — 축구 경기 메인 뷰 (경기 목록, 현재 경기, 전체 마감)
- `src/components/game/SoccerRecorder.jsx` — 골/교체 이벤트 입력 UI (우리골, 상대골, 교체 버튼)
- `src/components/game/SubstitutionModal.jsx` — 선수 교체 모달 (나가는 선수, 들어오는 선수, 분 입력)
- `src/components/game/OpponentSelector.jsx` — 상대팀 선택/추가 컴포넌트
- `src/components/game/LineupSelector.jsx` — 출전 11명 선택 + GK/DF 포지션 토글
- `src/utils/soccerScoring.js` — 클린시트 판정 + 축구 포인트 계산

### 수정할 파일

- `src/App.jsx` — `matchMode: "soccer"` 분기, SoccerMatchView 렌더링, 마감 처리
- `src/hooks/useGameReducer.js` — 축구 전용 액션 추가
- `src/config/settings.js` — 축구 설정 (ownGoalPoint: -1, cleanSheetPoint: 1, opponents 배열)
- `apps-script/Code.js` — 클린시트 컬럼 지원, 축구용 로그 쓰기/읽기

### 기존 재사용

- `src/services/appSync.js` — Apps Script API 클라이언트 그대로
- `src/services/firebaseSync.js` — Firebase 동기화 그대로
- `src/services/sheetService.js` — Google Sheets CSV 파싱 그대로
- `src/components/game/EventLog.jsx` — 이벤트 표시 (타입 확장)
- `src/utils/speechRecord.js` — 음성인식 재사용 가능

---

## 게임 상태 모델

```js
{
  phase: "setup" | "playing" | "finished",
  matchMode: "soccer",
  attendees: ["김철수", "이영희", ...],

  // 축구 전용 상태
  soccerMatches: [
    {
      matchIdx: 0,
      opponent: "FC서울",
      lineup: ["김철수", "이영희", ...],        // 출전 11명
      gk: "박수비",                              // 골키퍼
      defenders: ["이수비", "김수비", ...],       // 수비수 목록
      events: [
        { type: "goal", player: "김철수", assist: "이영희", timestamp: 1704506595000, id: "..." },
        { type: "owngoal", player: "박수비", timestamp: 1704507900000, id: "..." },
        { type: "opponentGoal", currentGk: "박수비", timestamp: 1704509220000, id: "..." },
        { type: "sub", playerOut: "김철수", playerIn: "최공격", position: "FW", timestamp: 1704508860000, id: "..." },
      ],
      startedAt: 1704506400000,  // 경기 시작 timestamp
      ourScore: 2,        // 우리팀 득점 (자동 계산)
      opponentScore: 1,   // 상대팀 득점 (자동 계산)
      status: "playing" | "finished",
    },
  ],
  currentMatchIdx: 0,
  opponents: ["FC서울", "동네팀A"],  // 등록된 상대팀 목록
}
```

### 이벤트 타입

| type | 설명 | 필드 |
|------|------|------|
| `goal` | 우리팀 골 | player, assist(선택), timestamp |
| `owngoal` | 자책골 | player, timestamp |
| `opponentGoal` | 상대팀 골 | currentGk, timestamp |
| `sub` | 교체 | playerOut, playerIn, position(승계포지션), timestamp |

### 스코어 자동 계산

- `ourScore` = goal 이벤트 수
- `opponentScore` = opponentGoal 이벤트 수 + owngoal 이벤트 수

---

## UI 흐름

### Step 1: 셋업

- 구글시트에서 참석명단 불러오기
- 참석자 토글 선택
- "경기 시작" 버튼 → playing 단계로 전환

### Step 2: 경기 생성

- 상대팀 선택 (드롭다운, "새 상대팀 추가" 옵션)
- 참석명단에서 출전 11명 탭하여 선택
- 각 선수 탭하여 포지션 토글: 일반 → GK → DF → 일반
- GK는 1명만 허용 (다른 선수 GK 탭 시 이전 GK 해제)
- "경기 시작" 버튼

### Step 3: 경기 진행

- 스코어보드: 우리팀 스코어 vs 상대팀(이름) 스코어
- 3개 버튼: ⚽ 우리골, ⚽ 상대골, 🔄 교체
- 이벤트 로그 표시 (시간순)
- 각 이벤트 삭제/수정 가능

#### 우리골 입력 모달

1. 득점자 선택 (현재 피치 위 선수 목록)
2. 어시스트 선택 ("없음" 옵션 포함)
3. 자책골 토글 (ON 시 상대팀 스코어에 반영)
4. 확인 → timestamp 자동 저장

#### 상대골 입력

1. 버튼 탭 → 즉시 기록 (현재 GK 자동 연결)
2. opponentScore +1

#### 교체 입력 모달

1. 나가는 선수 선택 (현재 피치 위 11명)
2. 들어오는 선수 선택 (벤치 = 참석명단 - 현재 피치)
3. 확인 → lineup 자동 업데이트, 포지션 승계, timestamp 자동 저장

### Step 4: 경기 종료

- "경기 종료" 버튼 → 결과 요약 표시
- 골/어시/클린시트 자동 판정
- "다음 경기" (새 경기 생성) 또는 "전체 마감" 선택

### Step 5: 전체 마감

- 오늘 전체 경기 요약 테이블 (상대팀, 결과, 클린시트)
- 선수별 기록 요약 (골, 어시, 클린시트, 포인트)
- "기록 저장" → Google Sheets + Firebase 저장

---

## 포인트 계산

```
골:        +1점 (득점자)
어시스트:   +1점 (어시스트)
자책골:    -1점 (자책골 선수)
클린시트:  +1점 (GK + 모든 DF, 무실점 경기 시)
```

### 클린시트 판정 로직

1. 경기 종료 시 `opponentScore === 0` 확인
2. 해당 경기의 `gk` + `defenders` 배열의 모든 선수에게 클린시트 +1
3. 교체로 나간 DF도 포함 (경기 중 한 번이라도 DF로 출전했으면 해당)
4. 교체로 DF 포지션에 투입된 선수도 포함

### 보너스 없음

- 크로바(MVP) / 고구마(꼴등) 포인트 미적용
- 향후 MOM 투표 등으로 확장 가능

---

## 데이터 저장

### 3종 로그 (앱에서 모두 쌓기)

| 시트명 (기본값) | 용도 | 비고 |
|----------------|------|------|
| `축구_이벤트로그` | 로우데이터 (모든 이벤트) | **신규** |
| `축구_포인트로그` | 경기별 이벤트 요약 | 현행 유지 |
| `축구_선수별집계기록로그` | 선수별 경기 집계 | 현행 유지 |
| `축구_참석명단` | 참석자 명단 | 기존 |
| `축구_대시보드` | 선수별 누적 통계 (CSV) | 기존 |

시트명은 팀 설정에서 변경 가능.

### 이벤트로그 컬럼 (로우데이터)

| 컬럼 | 설명 |
|------|------|
| 경기일자 | 경기 날짜 |
| 경기번호 | 해당일 N번째 경기 |
| 상대팀명 | 상대팀 이름 |
| 이벤트 | 출전/골/자책골/실점/교체 |
| 선수 | 주체 선수 (출전자, 득점자, 실점GK, 교체IN) |
| 관련선수 | 어시스트, 교체OUT 선수 |
| 포지션 | GK/DF/FW (출전, 교체 시 승계포지션) |
| 입력시간 | 이벤트 발생 timestamp |

### 포인트로그 컬럼 (현행)

| 컬럼 | 설명 |
|------|------|
| 경기일자 | 경기 날짜 |
| 경기번호 | 해당일 N번째 경기 |
| 상대팀명 | 상대팀 이름 |
| 득점 | 득점자 이름 (또는 OG) |
| 어시 | 어시스트 선수 |
| 실점 | 실점 여부 |
| 자책골 | 자책골 선수 |
| 입력시간 | 기록 시간 |

### 선수별집계기록로그 컬럼 (현행)

| 컬럼 | 설명 |
|------|------|
| 경기일자 | 경기 날짜 |
| 선수명 | 선수 이름 |
| 전체경기 | 출전 경기 수 |
| 필드경기 | 필드 출전 수 |
| 키퍼경기 | GK 출전 수 |
| 골 | 득점 수 |
| 어시 | 어시스트 수 |
| 클린시트 | 클린시트 횟수 |
| 실점 | 실점 수 (GK일 때) |
| 자책골 | 자책골 수 |
| 입력시간 | 기록 시간 |

### Firebase

```
games/{팀이름_축구}/active/{gameId}: { state: JSON, updatedAt: ... }
settings/{팀이름_축구}: { sheetId, attendanceSheet, dashboardSheet, playerLogSheet, eventLogSheet, pointLogSheet, opponents: [...], ... }
```

### Apps Script (Code.js)

- 기존 함수 재사용 (시트명 파라미터 전달 구조)
- `writeEventLog` 신규 추가 (이벤트로그 로우 쓰기)
- `writePlayerLog` 에 클린시트 컬럼 추가 지원
- 축구/풋살 구분은 시트명으로 자연스럽게 분리

---

## 설정 (settings.js 확장)

```js
// 축구팀 기본 설정
{
  // 기존 공통
  sheetId: "...",
  attendanceSheet: "축구_참석명단",
  dashboardSheet: "축구_대시보드",
  playerLogSheet: "축구_선수별집계기록로그",
  pointLogSheet: "축구_포인트로그",

  // 축구 전용
  eventLogSheet: "축구_이벤트로그",  // 로우데이터
  ownGoalPoint: -1,        // 풋살은 -2
  cleanSheetPoint: 1,      // 풋살에는 없음
  opponents: ["FC서울", "동네팀A"],  // 등록된 상대팀 목록
}
```

---

## 범위 밖 (추후)

- 시각적 포메이션 배치 (피치 위 드래그)
- MOM(Man of the Match) 투표
- 상대팀 선수 정보 관리
- 전후반 구분
- 축구 전용 대시보드/분석

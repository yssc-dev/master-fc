# 마스터FC 풋살 웹앱 — ERD (Entity Relationship Diagram)

> 최종 업데이트: 2026-03-30

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     클라이언트 (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ localStorage│ │  React   │  │ Firebase │  │ Apps     │    │
│  │ (캐시)    │  │  State   │  │  SDK     │  │ Script   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└───────┼──────────────┼─────────────┼─────────────┼──────────┘
        │              │             │             │
        ▼              ▼             ▼             ▼
   ┌─────────┐   ┌──────────┐  ┌─────────┐  ┌──────────────┐
   │ Browser │   │ In-Memory│  │Firebase  │  │Google Sheets │
   │ Storage │   │  State   │  │Realtime  │  │(6개 시트)     │
   └─────────┘   └──────────┘  │   DB     │  └──────────────┘
                                └─────────┘
```

---

## 1. Google Sheets (영구 저장소)

### 1-1. 회원인증 (AUTH_SHEET)
| 열 | 필드 | 타입 | 설명 |
|----|------|------|------|
| A | 팀이름 | string | "마스터FC" |
| B | 모드 | string | "관리자" / "멤버" |
| C | 이름 | string | 선수 이름 |
| D | 폰뒷자리 | string | 4자리 (로그인용) |
| E | 역할 | string | "관리자" / "멤버" |

### 1-2. 앱_경기상태 (STATE_SHEET)
| 열 | 필드 | 타입 | 설명 |
|----|------|------|------|
| A | 팀이름 | string | FK → 회원인증.팀이름 |
| B | 경기일자 | date | gameId 타임스탬프 기반 |
| C | 상태 | string | "진행중" / "확정" |
| D | 상태JSON | json | 전체 게임 상태 |
| E | 저장시간 | datetime | ISO 8601 KST |
| F | 요약 | string | gameId, 작성자, phase 등 |

### 1-3. 포인트로그 (POINT_LOG_SHEET)
| 열 | 필드 | 타입 | 설명 |
|----|------|------|------|
| A | 경기일자 | date | 경기 생성 날짜 |
| B | 경기번호 | string | "1라운드 A구장" |
| C | 내팀 | string | 득점팀 이름 |
| D | 상대팀 | string | 실점팀 이름 |
| E | 득점선수 | string | 골 넣은 선수 |
| F | 어시선수 | string | 어시스트 선수 |
| G | 자책골 | string | 자책골 선수 |
| H | 실점키퍼 | string | 실점 당한 키퍼 |
| I | 입력시간 | datetime | 시트 전송 시점 |
| J | 팀이름 | string | FK → 회원인증.팀이름 |

### 1-4. 선수별집계기록로그 (PLAYER_LOG_SHEET)
| 열 | 필드 | 타입 | 설명 |
|----|------|------|------|
| A | 경기일자 | date | 경기 생성 날짜 |
| B | 선수명 | string | 선수 이름 |
| C | 골 | number | 골 수 |
| D | 어시 | number | 어시스트 수 |
| E | 역주행 | number | 자책골 포인트 (-2) |
| F | 실점 | number | 실점 수 |
| G | 클린시트 | number | 무실점 경기 수 |
| H | 크로바 | number | 1위팀 보너스 포인트 |
| I | 고구마 | number | 꼴찌팀 페널티 포인트 |
| J | 키퍼경기수 | number | GK 출전 수 |
| K | 입력시간 | datetime | 시트 전송 시점 |
| L | 팀이름 | string | FK → 회원인증.팀이름 |

### 1-5. 대시보드 (CSV 조회용)
| 주요 열 | 설명 |
|---------|------|
| 이름 | 선수명 |
| 경기수 | 총 출전 수 |
| 골/어시/역주행 | 누적 스탯 |
| 클린시트/크로바/고구마 | 누적 보너스 |
| 포인트 | 총점 |
| 키퍼경기/실점/실점률 | GK 스탯 |

### 1-6. 참석명단 (CSV 조회용)
| 주요 열 | 설명 |
|---------|------|
| 이름 | 선수명 |
| 시드순위 | 드래프트 순서 |
| 참석여부 | O/X |

---

## 2. Firebase Realtime DB

```
firebase-root/
├── games/
│   └── {팀이름}/
│       ├── active/
│       │   └── {gameId}/          ← 진행중 경기
│       │       ├── state: {...}   ← 전체 게임 상태 JSON
│       │       └── savedAt: timestamp
│       └── current/               ← 레거시 (단일 경기)
│           ├── state: {...}
│           └── savedAt: timestamp
└── settings/
    └── {팀이름}/                   ← 팀별 설정
        ├── sheetId: string
        ├── attendanceSheet: string
        ├── dashboardSheet: string
        ├── pointLogSheet: string
        ├── playerLogSheet: string
        ├── ownGoalPoint: number
        ├── crovaPoint: number
        ├── gogumaPoint: number
        └── bonusMultiplier: number
```

---

## 3. localStorage (브라우저 캐시)

| 키 | 내용 | TTL |
|----|------|-----|
| `masterfc_auth` | {name, phone4, team, mode, role, timestamp} | 24시간 |
| `masterfc_settings_{팀}` | Firebase 설정 캐시 | 무제한 |

---

## 4. In-Memory State (React useReducer)

### GameState
```
{
  phase: "setup" | "teamBuild" | "match" | "summary",
  attendees: [string],           ← 참석자 이름 목록
  teams: [[string]],             ← 팀별 선수 배열
  teamNames: [string],           ← 팀 이름 배열
  teamColorIndices: [number],    ← 팀 색상 인덱스
  teamCount: number,
  courtCount: number,
  matchMode: "schedule" | "free",

  schedule: [{matches: [[number, number]]}],  ← 라운드별 대진
  currentRoundIdx: number,
  viewingRoundIdx: number,
  confirmedRounds: {[idx]: true},

  allEvents: [Event],            ← 골/자책골 이벤트
  completedMatches: [Match],     ← 확정된 매치 결과

  gks: {[teamIdx]: string},      ← 현재 라운드 GK
  gksHistory: {[roundIdx]: gks}, ← 확정된 라운드 GK

  earlyFinish: boolean,          ← 조기마감 여부
  splitPhase: "first" | "second",← 6팀 스플릿
  gameCreator: string,
}
```

### Event
```
{
  id: string,                    ← "evt_{timestamp}_{seq}"
  type: "goal" | "owngoal",
  matchId: string,               ← "R{round}_C{court}"
  player: string,                ← 득점/자책골 선수
  assist: string | null,
  team: string,                  ← 소속팀
  scoringTeam: string,
  concedingTeam: string,
  concedingGk: string,
  homeTeam: string,
  awayTeam: string,
  courtId: string,
  timestamp: number,
}
```

### Match (completedMatches)
```
{
  matchId: string,               ← "R{round}_C{court}"
  homeIdx: number,
  awayIdx: number,
  homeTeam: string,
  awayTeam: string,
  homeGk: string,
  awayGk: string,
  homeScore: number,
  awayScore: number,
  court: string,
  mercenaries: [string],
  isExtra: boolean,
}
```

---

## 5. Entity Relationship Diagram

```
┌──────────────┐         ┌──────────────────┐
│   회원인증    │────────▶│    앱_경기상태     │
│  (Auth)      │  팀이름  │  (Game Session)   │
│              │         │                  │
│ · 팀이름 PK  │         │ · 팀이름 FK      │
│ · 이름       │         │ · gameId         │
│ · 폰뒷자리   │         │ · 상태           │
│ · 역할       │         │ · 상태JSON ──────┼──┐
└──────┬───────┘         └──────────────────┘  │
       │                                        │
       │ 1:N                              ┌─────▼─────┐
       │                                  │ GameState  │
       │                                  │ (JSON)     │
       │                                  │            │
       │                                  │ · events[] │
       │                                  │ · matches[]│
       │                                  │ · teams[]  │
       │                                  │ · gks{}    │
       │                                  └─────┬──────┘
       │                                        │
       │                              기록확정 시 │ 분리 저장
       │                                        │
       ▼                    ┌────────────────────┼────────────────┐
┌──────────────┐            ▼                    ▼                │
│  참석명단     │    ┌──────────────┐    ┌────────────────┐       │
│ (Attendance) │    │  포인트로그    │    │ 선수별집계기록   │       │
│              │    │ (Point Log)  │    │   로그          │       │
│ · 이름       │    │              │    │ (Player Log)   │       │
│ · 시드순위    │    │ · 경기일자   │    │                │       │
│ · 참석여부    │    │ · 경기번호   │    │ · 경기일자     │       │
└──────────────┘    │ · 내팀/상대   │    │ · 선수명       │       │
                    │ · 득점/어시   │    │ · 골/어시/역주행│       │
                    │ · 자책골      │    │ · 클린시트     │       │
                    │ · 실점키퍼    │    │ · 크로바/고구마 │       │
                    │ · 팀이름 FK  │    │ · 팀이름 FK    │       │
                    └──────┬───────┘    └───────┬────────┘       │
                           │                    │                │
                           ▼                    ▼                │
                    ┌──────────────────────────────┐             │
                    │        대시보드 (집계)         │◀────────────┘
                    │                              │   QUERY 수식
                    │ · 선수별 누적 스탯            │
                    │ · 포인트 랭킹                │
                    │ · 키퍼 실점률                 │
                    │ · 출석률                      │
                    └──────────────────────────────┘
```

---

## 6. 데이터 흐름

```
[경기 생성] ──▶ [실시간 기록] ──▶ [라운드 확정] ──▶ [경기마감] ──▶ [기록확정]
                    │                                    │              │
              Firebase 동기화                      크로바/고구마      시트 저장
              (다중 기기)                           포인트 계산    ┌────┴────┐
                                                               ▼         ▼
                                                          포인트로그  선수별집계
                                                               │         │
                                                               ▼         ▼
                                                          대시보드 QUERY 집계
                                                               │
                                                               ▼
                                                          앱 CSV 조회
                                                        (랭킹/출석/분석)
```

---

## 7. API 엔드포인트 (Apps Script)

| Action | Method | 설명 |
|--------|--------|------|
| `verify` | POST | 로그인 인증 |
| `saveState` | POST | 경기 상태 저장 |
| `loadState` | POST | 경기 상태 로드 |
| `loadAllStates` | POST | 진행중 경기 목록 |
| `clearState` | POST | 경기 상태 삭제 |
| `finalizeState` | POST | 경기 확정 (진행중→확정) |
| `writePointLog` | POST | 포인트로그 저장 |
| `writePlayerLog` | POST | 선수별집계 저장 |
| `getHistory` | POST | 확정된 과거 경기 조회 |
| `getSheetList` | POST | 시트 탭 목록 |
| `getPrevRankings` | POST | 이전 랭킹 (최신 경기 증분) |
| `getRankingHistory` | POST | 전체 랭킹 히스토리 |
| `getPointLog` | POST | 포인트로그 전체 조회 |
| `getPlayerLog` | POST | 선수별집계 전체 조회 |
| `getCumulativeBonus` | POST | 시즌 누적 보너스 |

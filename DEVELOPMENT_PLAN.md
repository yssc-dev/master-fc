# 구기종목 기록 플랫폼 — 개발 플랜

> 취미 구기종목(풋살, 축구, 야구, 농구 등) 팀의 경기 기록 플랫폼
> 최종 업데이트: 2026-03-19

---

## 현재 상태 (v1.0 — Vite 리팩토링 완료)

### 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | Vite + React 19 (JSX) |
| 상태 관리 | useReducer (30+ useState 통합) |
| 실시간 동기화 | Firebase Realtime DB (모듈 SDK) |
| 백엔드 | Google Apps Script v2.0 |
| 데이터 저장 | Google Sheets (경기상태, 포인트로그, 선수별집계) |
| 환경 변수 | `.env` (Firebase 키, Apps Script URL, Sheet ID) |
| 빌드 | Vite → 435KB (130KB gzipped) |

### 프로젝트 구조

```
footsal_webapp/
├── index.html                    # Vite 엔트리 (minimal)
├── vite.config.js
├── package.json
├── .env                          # Firebase/Apps Script 설정
├── .gitignore
├── apps-script/
│   └── Code.js                   # Apps Script v2.0
├── src/
│   ├── main.jsx                  # ReactDOM.createRoot + ErrorBoundary
│   ├── App.jsx                   # useReducer 기반 게임 오케스트레이터
│   ├── Root.jsx                  # 인증 + 화면 라우팅
│   ├── config/
│   │   ├── firebase.js           # Firebase 초기화 (import.meta.env)
│   │   ├── constants.js          # TEAM_COLORS, C 팔레트, SHEET_CONFIG
│   │   └── fallbackData.js       # FALLBACK_DATA (56명)
│   ├── services/
│   │   ├── authUtil.js           # localStorage 인증
│   │   ├── appSync.js            # Apps Script API 클라이언트
│   │   ├── firebaseSync.js       # Firebase RTDB 동기화
│   │   └── sheetService.js       # CSV 파싱 + Sheet 데이터 fetch
│   ├── hooks/
│   │   └── useGameReducer.js     # 단일 reducer (RESTORE_STATE 등)
│   ├── utils/
│   │   ├── idGenerator.js
│   │   ├── scoring.js            # 득점 계산 (통합)
│   │   ├── draft.js              # 스네이크 드래프트
│   │   └── brackets.js           # 라운드로빈/스케줄 생성
│   ├── components/
│   │   ├── common/
│   │   │   ├── Modal.jsx         # 공통 모달
│   │   │   ├── PhaseIndicator.jsx
│   │   │   └── ErrorBoundary.jsx
│   │   ├── auth/
│   │   │   └── LoginScreen.jsx
│   │   ├── home/
│   │   │   └── HomeScreen.jsx
│   │   ├── dashboard/
│   │   │   └── TeamDashboard.jsx # 기록/명단/경기관리 3탭
│   │   ├── game/
│   │   │   ├── CourtRecorder.jsx
│   │   │   ├── PlayerActionModal.jsx
│   │   │   ├── EventLog.jsx
│   │   │   ├── ScheduleMatchView.jsx
│   │   │   ├── FreeMatchView.jsx
│   │   │   ├── ScheduleModal.jsx
│   │   │   ├── StandingsModal.jsx
│   │   │   └── PlayerStatsModal.jsx
│   │   └── history/
│   │       └── HistoryView.jsx
│   └── styles/
│       ├── theme.js              # 스타일 팩토리 (btn, chip, card 등)
│       └── global.css            # 리셋 + 스크롤바
├── DEVELOPMENT_PLAN.md
├── BUSINESS_MODEL.md
└── README.md
```

### 구현 완료 기능

- [x] Vite 기반 모듈화 (2,850줄 단일 HTML → 32개 파일)
- [x] Firebase 모듈 SDK 전환 (CDN compat → npm)
- [x] 환경변수 분리 (.env)
- [x] useReducer 상태 관리 (RESTORE_STATE 단일 액션 복원)
- [x] 풋살 경기 기록 (라운드, 이벤트, 팀편성)
- [x] 실시간 동기화 (Firebase, 다중 기기)
- [x] 멀티팀 데이터 분리
- [x] 관리자/멤버 권한 분리
- [x] 과거 경기 조회
- [x] 크로바/고구마 커스텀 이벤트
- [x] 누적 시즌 보너스 (2배 이벤트)
- [x] 팀 대시보드 3탭 구조 (기록/명단/경기관리)
- [x] 새 경기: 구글시트 연동(자동편성) / 커스텀경기 선택
- [x] Apps Script v2.0 (응답 표준화, 입력 검증, 팀 접근 제어, LockService)

### Apps Script v2.0 개선사항

| 개선 | 내용 |
|------|------|
| 응답 표준화 | `_jsonResponse()` / `_errorResponse()` 헬퍼. 모든 응답에 `success: boolean` |
| 입력 검증 | writePointLog — gameDate, matchId, scorer/ownGoalPlayer 필수 |
| | writePlayerLog — gameDate, name 필수 |
| 팀 접근 제어 | `_checkTeamAccess()` — 토큰의 팀 ≠ 요청 팀이면 거부 |
| 동시성 제어 | `LockService.getScriptLock()` — save/clear/finalize/writeLogs |
| 버그 수정 | clearState, finalizeState에서 미사용 gameDate 파라미터 제거 |

---

## 유저 플로우 (현재 구현)

```
로그인 (이름 + 휴대폰 뒷자리)
  ↓
팀 선택 (단일팀이면 자동 스킵)
  ↓
팀 대시보드
  ├── [기록 탭] 시즌 통계 + TOP 5 + 과거 경기 조회
  ├── [명단 탭] 전체 팀원 목록 (포인트/경기수/PPG)
  └── [경기관리 탭] ← 진행중 경기 있으면 녹색 배지
       ├── 진행중 경기 카드 → 현재 라운드 화면으로 복귀
       └── 새 경기
            ├── 📋 구글시트 연동
            │     시트에서 참석자+팀수 자동 로딩
            │     → 스네이크 드래프트 → 스케줄 생성 → 바로 경기
            └── ⚙️ 커스텀 경기
                  → 참석자 선택 → 팀 편성 → 경기 시작
```

### 경기 진행 플로우

```
[경기 시작]
  ├── 대진표 모드: 라운드로빈 자동 생성 (4/5/6팀 × 1/2코트)
  └── 자유대진 모드: 매 라운드 직접 대진 선택
        ↓
[라운드 진행]
  ├── GK 지정 → 선수 터치 → 골/어시/자책골 기록
  ├── 이벤트 수정/삭제 가능
  ├── 용병 추가 가능
  ├── 실시간 동기화 (Firebase)
  ├── 자동 저장 (디바운스 800ms, Firebase + Apps Script 병렬)
  └── 라운드 종료 확정 → 다음 라운드
        ↓
[전체 라운드 완료] → 게임마감
  ├── 팀 순위 (승점제)
  ├── 선수별 기록 (골/어시/자책/클린시트/크로바/고구마)
  ├── 크로바/고구마 보너스 자동 계산 (시즌 누적 1위 2배)
  └── 기록 확정 (관리자만) → 시트에 포인트로그 + 선수별집계 저장
```

---

## 소프트웨어 설계

### 데이터 모델

```
Users (가입 유저)
├── id
├── name
├── phone
├── auth_method          ← 현재: 관리자등록 / 추후: 이메일, 카카오, 구글
├── created_at
└── 1명이 여러 팀 소속 가능

Teams (팀)
├── id
├── name                 ← "마스터FC"
├── created_by (user_id) ← owner
├── invite_code          ← 6자리, 팀원 초대용
├── created_at
└── 1팀이 여러 종목 구독 가능

TeamMembers (팀-유저 소속)
├── user_id
├── team_id
├── role                 ← "owner" | "admin" | "member" | "viewer"
├── back_number
├── joined_at
└── 복합키: user_id + team_id

TeamSports (팀-종목 구독)
├── team_id
├── sport_type           ← "futsal" | "soccer" | "baseball" | "basketball"
├── scoring_rule_id      ← 집계방식 (공식룰 or 커스텀)
├── is_active            ← 과금/활성 상태
├── activated_at
└── 복합키: team_id + sport_type

SportTypes (종목 정의 — 시스템 테이블)
├── id: "futsal" | "soccer" | "baseball" | "basketball"
├── label: "풋살" | "축구" | "야구" | "농구"
├── default_events       ← ["goal","assist","clean_sheet","own_goal",...]
├── default_scoring      ← { "goal": 3, "assist": 1, "own_goal": -2 }
├── team_size            ← { min: 4, max: 5, default: 5 }
├── round_label          ← "쿼터" | "이닝" | "세트" | "라운드"
└── 종목 추가 = 행 추가 + UI 컴포넌트 개발

ScoringRules (집계방식)
├── id
├── sport_type
├── team_id              ← null이면 공식룰 (시스템 기본)
├── name                 ← "공식룰" | "마스터FC 커스텀"
├── rules_json           ← { "goal": 3, "assist": 1, "crova": 5, "goguma": -3 }
├── custom_events        ← [{ key:"crova", label:"크로바", desc:"..." }, ...]
└── is_default

Seasons (시즌)
├── id
├── team_id
├── sport_type
├── name                 ← "2026 시즌" | "2025 후반기"
├── start_date / end_date
├── status               ← "진행중" | "종료"
└── created_by

Venues (경기장)
├── id
├── team_id
├── name                 ← "한재풋살장"
├── address
├── sport_types          ← ["futsal","soccer"]
└── is_active

Games (경기)
├── id
├── team_id
├── sport_type
├── season_id
├── venue_id
├── game_date
├── status               ← "진행중" | "확정"
├── state_json           ← 전체 경기 상태
├── summary
├── created_by
└── finalized_at

GameEvents (이벤트)
├── id
├── game_id
├── round_number
├── player_id
├── event_type           ← "goal" | "assist" | "crova" | 커스텀
├── point_value
└── timestamp

PlayerStats (시즌 집계 캐시)
├── user_id, team_id, sport_type, season_id
├── games, goals, assists, points, ...
└── 경기 확정 시 갱신

PlayerCareerStats (통산 집계 캐시)
├── user_id, team_id, sport_type
├── total_seasons, total_games, total_goals, total_points, ...
└── 시즌 종료 시 갱신
```

### 관계 요약

```
User ──< TeamMember >── Team
                          │
                     TeamSports ──> SportType
                       │  │              │
                       │  ScoringRules ──┘
                       │  │
                    Venues Seasons
                       │  │
                       Games
                          │
                     GameEvents ──> User (player)
                          │
                  PlayerStats (시즌별)
                          │
              PlayerCareerStats (통산)
```

---

### 권한 체계

| 기능 | owner | admin | member | viewer |
|------|:-----:|:-----:|:------:|:------:|
| 팀 삭제 | O | | | |
| 팀 설정 변경 | O | | | |
| 집계방식 변경 | O | O | | |
| 팀원 초대/추방 | O | O | | |
| 역할 변경 | O | O* | | |
| 경기 생성 | O | O | O | |
| 경기 기록 (실시간) | O | O | O | |
| 기록 확정/삭제 | O | O | | |
| 경기 조회 | O | O | O | O |
| 통계 조회 | O | O | O | O |

*admin은 member↔viewer만 변경 가능, admin 지정은 owner만

현재 구현: 관리자(owner+admin), 멤버(member) 2단계로 단순화

---

### 집계방식 설계

#### 데이터 구조

```json
{
  "type": "custom",
  "base_sport": "futsal",
  "events": {
    "goal":        { "label": "골",       "icon": "⚽", "point": 3,  "target": "field", "auto": false },
    "assist":      { "label": "어시스트",  "icon": "👟", "point": 1,  "target": "field", "auto": false },
    "clean_sheet": { "label": "클린시트",  "icon": "🧤", "point": 3,  "target": "gk",    "auto": true },
    "own_goal":    { "label": "자책골",    "icon": "🔴", "point": -2, "target": "field", "auto": false },
    "crova":       { "label": "크로바",    "icon": "🏆", "point": 5,  "target": "all",   "auto": false, "is_custom": true },
    "goguma":      { "label": "고구마",    "icon": "🍠", "point": -3, "target": "all",   "auto": false, "is_custom": true }
  },
  "team_points": { "win": 3, "draw": 1, "lose": 0 },
  "season_bonus": {
    "enabled": true,
    "rules": [
      { "event": "crova",  "multiplier": 2, "exclude_ties": true },
      { "event": "goguma", "multiplier": 2, "exclude_ties": true }
    ]
  }
}
```

#### 공식룰 종목별 기본값

| 종목 | 기본 이벤트 | 기본 점수 |
|------|------------|-----------|
| 풋살 | 골, 어시스트, 클린시트, 자책골 | +3, +1, +3, -2 |
| 축구 | 골, 어시스트, 클린시트, 자책골 | +3, +1, +3, -2 |
| 야구 | 안타, 2루타, 3루타, 홈런, 타점, 도루, 삼진(투수) | TBD |
| 농구 | 2점슛, 3점슛, 자유투, 리바운드, 어시스트, 스틸, 블록 | TBD |

---

### 과금 모델 (추후)

```
무료 (기본)
├── 팀 1개
├── 종목 1개
├── 팀원 15명
├── 경기 기록 무제한
└── 과거 기록 최근 3개월

프로 (팀 단위 월 구독)
├── 종목 무제한 추가        ← 핵심 과금 포인트
├── 팀원 무제한
├── 과거 기록 무제한
├── 시즌 통계 대시보드
├── 커스텀 집계방식
└── 데이터 내보내기 (CSV/PDF)
```

---

## 개발 로드맵

### Phase 1 — 마스터FC 검증 + Vite 전환 ✅

- [x] 풋살 경기 기록 (라운드, 이벤트, 팀편성)
- [x] 실시간 동기화 (Firebase)
- [x] 멀티팀 데이터 분리
- [x] 관리자/멤버 권한 분리
- [x] 과거 경기 조회
- [x] 크로바/고구마 커스텀 이벤트
- [x] 누적 시즌 보너스 (2배 이벤트)
- [x] Vite + React 모듈화 (32개 파일)
- [x] useReducer 상태 관리
- [x] Firebase 모듈 SDK 전환
- [x] 환경변수 분리 (.env)
- [x] 팀 대시보드 3탭 (기록/명단/경기관리)
- [x] 새 경기: 구글시트 연동 / 커스텀경기
- [x] Apps Script v2.0 (응답 표준화, 검증, 접근 제어, LockService)

### Phase 2 — 플랫폼 기반 구축

- [ ] 데이터 모델 정규화 (위 스키마 적용)
- [ ] 팀 생성 / 초대코드 합류 플로우
- [ ] 권한 체계 (owner/admin/member/viewer)
- [ ] 집계방식 설정 UI (공식룰/커스텀 선택)
- [ ] 팀 설정 화면 (팀원 관리, 역할 변경)
- [ ] 홈 화면 (내 팀 목록, 팀 전환)
- [ ] 시즌 관리 (시즌 시작/종료, 시즌별 통계)
- [ ] 경기장 선택 기능

### Phase 3 — 종목 확장

- [ ] 종목별 UI 컴포넌트 분리 (풋살 → 공통 프레임워크)
- [ ] 축구 모드 (11인, 교체 등)
- [ ] 팀별 종목 추가/제거
- [ ] 종목별 공식룰 정의

### Phase 4 — 통계 및 경험

- [ ] 시즌 리더보드 (종목별, 팀별)
- [ ] 개인 통계 대시보드 (내 전체 기록)
- [ ] 통산 기록 (전 시즌 통합)
- [ ] 경기 하이라이트 요약 (MVP, 주요 이벤트)
- [ ] 알림 (경기 예정, 출석 확인)

### Phase 5 — 확장 종목

- [ ] 야구 기록 모듈
- [ ] 농구 기록 모듈
- [ ] 종목별 커스텀 이벤트 템플릿

### Phase 6 — 비즈니스

- [ ] 소셜 로그인 (카카오, 구글)
- [ ] 과금 시스템 (종목 추가, 프로 플랜)
- [ ] 데이터 내보내기
- [ ] 팀 간 교류전/리그 기능

---

## 핵심 설계 원칙

1. **종목은 플러그인**: 공통 프레임워크(팀, 경기, 이벤트) 위에 종목별 UI/룰만 교체
2. **집계방식은 데이터**: 하드코딩이 아닌 JSON 설정으로, 팀별 자유도
3. **팀이 과금 단위**: 유저가 아닌 팀 기준 구독, 종목 추가가 핵심 과금
4. **현재 인프라 유지**: Sheets/Firebase로 검증 → 유저 늘면 DB 전환

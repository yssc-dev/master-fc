# 로그 소스 통합 설계: `로그_매치` 도입 + Firebase stateJSON 의존 제거

작성일: 2026-04-21
대상: 선수 분석(PlayerAnalytics) 데이터 파이프라인

## 배경과 문제

현재 선수 분석 페이지는 **3개 소스**를 혼용한다.

1. **Firebase stateJSON** (`games/{team}/finalized/_states/{gameId}`) — 앱 기록 세션의 원시 데이터. 시너지/득점콤비/🍀🌶️/시간대/수비력/승리기여 계산에 필수.
2. **구글 시트 `포인트로그`** — 골/자책/실점 이벤트 단위. 골든콤비/키퍼킬러 계산.
3. **구글 시트 `선수별집계기록로그`** — 선수×날짜 집계. 시즌레이스/선수카드 개인스탯.

이 때문에 PlayerAnalytics가 탭별로 다른 소스를 쓰고, "수비력/승리기여/시너지는 앱 기록 경기만 분석" 제약이 사용자에게 노출된다. 최근 통합 로그 시스템(`로그_이벤트`, `로그_선수경기`) 도입 이후에도 Firebase stateJSON 의존이 남은 이유는 **라운드 단위 구조 정보 3가지가 로그 시트에 빠져 있기 때문**이다.

| 빠진 정보 | 영향받는 지표 |
|---|---|
| `game_id` (세션 고유 키) | 🍀🌶️ (세션 내 팀 순위 재계산) |
| `round_idx` (라운드 순서) | 시간대 패턴, 득점콤비 |
| `team_members` (라운드별 팀 구성원 목록) | 시너지, 득점콤비, 수비력/승리기여 |

현재 Firebase stateJSON은 **최근 3일치만** 저장되어 있어 과거 데이터 분석은 Firebase 의존 시 불가능하다. 한편 `로그_이벤트`/`로그_선수경기`는 **전 경기 보존**되어 있다.

## 목표

1. 선수 분석의 데이터 소스를 **구글 시트 단일 소스**로 통합
2. Firebase stateJSON 의존을 분석 경로에서 제거
3. 축구/풋살 양쪽 종목 지원
4. 과거 데이터 최대한 보존하며 신규 분석 구조로 이관
5. 기존 `로그_이벤트`/`로그_선수경기` 데이터 유실 없이 진행 (백업 안전망)

## 비목표

- Firebase 자체 폐기 (앱 런타임 상태 저장/복구 용도로는 유지)
- 레거시 `포인트로그`/`선수별집계기록로그` 시트 즉시 폐기 (Phase 2에서 결정)
- 축구 시간대 분석의 분(minute) 단위 도입 (추후 과제)
- 축구 상대팀 구성/상대 키퍼 기록 (구조상 불가)

---

## 아키텍처

### 신규 시트: `로그_매치`

라운드 단위 원자 정보를 보관. 종목 중립 스키마(축구/풋살 공통).

| 컬럼 | 타입 | 풋살 | 축구 | 비고 |
|---|---|---|---|---|
| `team` | string | ✓ | ✓ | 팀 네임스페이스 (예: `masterfc`) |
| `sport` | string | `풋살` | `축구` | |
| `mode` | string | `normal`/`tournament` | 동일 | |
| `tournament_id` | string? | 대회 ID | 대회 ID | 일반 세션 빈 값 |
| `date` | `YYYY-MM-DD` | ✓ | ✓ | |
| `game_id` | string | Firebase `gameId` 또는 합성 | `s_{timestamp}` | 세션 고유 키 |
| `match_idx` | integer | 세션 내 연번 | 경기 연번 | |
| `round_idx` | integer? | 1부터 | null | 풋살 전용 |
| `court_id` | integer? | 0부터 | null | 풋살 전용 |
| `match_id` | string | `R3_C0` | `"1"` | 기존 포맷 유지 |
| `our_team_name` | string | 팀명 (Team A) | 팀명 | |
| `opponent_team_name` | string | 팀명 | 상대팀명 | |
| `our_members_json` | JSON array | 출전자 전원 (GK 포함) | 선발 + 교체 투입 전원 | P1 방침 |
| `opponent_members_json` | JSON array | 상대팀 출전자 | `[]` (축구는 모름) | |
| `our_score` | integer | ✓ | ✓ | |
| `opponent_score` | integer | ✓ | ✓ | |
| `our_gk` | string | ✓ | ✓ | 멤버에 포함된 GK 명 |
| `opponent_gk` | string | ✓ | `""` (축구 모름) | |
| `formation` | string? | null | `4-4-2` 등 | 축구 전용 |
| `our_defenders_json` | JSON array? | null | DF 선발 | 축구 전용 (클린시트 판정) |
| `is_extra` | boolean | | | 추가 경기 여부 |
| `input_time` | timestamp | ✓ | ✓ | 확정 시각 |

**설계 원칙:**
- `game_id + match_id` 복합 키로 라운드 유니크 식별
- `home_members_json`은 "경기/라운드에 1분이라도 뛴 우리팀 전원"
- 축구 교체 이벤트는 `로그_이벤트`의 `event_type="sub"`에 기록 (중복 저장 안 함)
- 셀 크기 50K 제한 여유 확보 (members JSON은 보통 100~500자)

### `로그_이벤트` 변경

신규 컬럼 추가 + event_type 표준화.

**추가 컬럼:**
| 컬럼 | 비고 |
|---|---|
| `game_id` | Firebase gameId 또는 합성 ID. 기존 행은 Migration 시 UPDATE |

**event_type 표준화:**
| Before | After |
|---|---|
| `goal` | `goal` (무변경) |
| `ownGoal` | `owngoal` |
| `opponentGoal` | `concede` |
| `concede` (풋살) | `concede` (무변경) |
| `sub` | `sub` (무변경) |

**축구 `sub` 이벤트 규약:**
```
event_type     = "sub"
player         = playerIn
related_player = playerOut
position       = "GK" | "DF" | "MF" | "FW"
```

### `로그_선수경기` 변경

**없음.** 스키마/데이터 모두 불변. 시즌레이스/선수카드가 계속 직접 사용.

### 데이터 흐름

```
앱 경기 확정
  ├── Firebase games/{team}/finalized/_states/{gameId} 저장 (런타임 백업)
  └── Apps Script API 호출
       ├── 로그_매치 append (신규)
       ├── 로그_이벤트 append (game_id 포함, 표준 event_type)
       └── 로그_선수경기 append (기존 로직 그대로)

분석 (PlayerAnalytics)
  ├── 시너지/득점콤비/시간대/🍀🌶️/수비력/승리기여
  │     ← 로그_매치 + 로그_이벤트 (game_id로 조인)
  ├── 골든콤비/키퍼킬러
  │     ← 로그_이벤트 (Phase 1은 기존 포인트로그 병행 가능)
  └── 시즌레이스/선수카드 개인스탯
        ← 로그_선수경기
```

---

## 구현 컴포넌트

### 1. Apps Script (`apps-script/Code.js`)

**신규 함수:**
- `_writeRoundLog(sessionData)` — `로그_매치` append. 멱등 체크 (`game_id + match_id` DISTINCT)
- `_ensureEventLogHasGameId()` — `로그_이벤트` 헤더에 `game_id` 컬럼 없으면 뒤에 추가
- `_backupSheet(sheetName)` — 해당 시트를 `{name}_백업_{YYYYMMDD_HHMM}` 로 duplicate
- `migrateEventTypes()` — 1회성 event_type 표준화 UPDATE
- `backfillMatchLogFromLegacy()` — 로그_이벤트 + 로그_선수경기 기반 `로그_매치` 재구성
- `overwriteMatchLogFromFirebase(rows)` — Firebase stateJSON 기반 정확 덮어쓰기 수신

**수정 함수:**
- `_writeRawEventLog` — `game_id` 필드 저장, 표준 event_type 값만 허용
- `_finalizeGameState` 후속 — 확정 시 `_writeRoundLog` 호출 추가

**멱등성 보장:**
- `로그_매치`: `(game_id, match_id)` 이미 있으면 skip
- `로그_이벤트 UPDATE`: `game_id` 빈 값인 행만 대상

### 2. 앱 측 (`src/`)

**`src/utils/rawLogBuilders.js` 확장:**
```js
buildRoundRows(stateJSON) 
// → [{ team, sport, game_id, round_idx, court_id, match_id,
//      our_team_name, opponent_team_name,
//      our_members_json, opponent_members_json,
//      our_score, opponent_score, our_gk, opponent_gk,
//      formation, our_defenders_json, is_extra, input_time }, ...]
```

**기존 `buildEventRows` 수정:**
- `game_id` 필드 포함
- event_type 표준화 (`ownGoal`→`owngoal`, `opponentGoal`→`concede`)

**`src/services/appSync.js` 확장:**
```js
AppSync.getMatchLog({ team, sport, dateFrom, dateTo })  // 로그_매치 fetch
AppSync.getEventLog({ team, sport, dateFrom, dateTo })  // 기존 확장 (game_id 포함)
```

**`src/utils/gameRecordBuilder.js` 신설:**
```js
buildGameRecordsFromLogs(matchRows, eventRows)
// → GameRecord[] (기존 parseGameHistory() 출력과 동일 스키마)
//    계산 함수 재사용 가능 (calcDefenseStats, calcSynergy, ...)
```

**`src/components/dashboard/PlayerAnalytics.jsx` 수정:**
- `FirebaseSync.loadFinalizedAll()` 호출 제거
- `AppSync.getMatchLog()` + `AppSync.getEventLog()` 사용
- `isSoccer` 분기: 시너지/득점콤비/시간대 축구 노출 (키퍼킬러/🍀🌶️만 숨김)

**`src/services/firebaseSync.js`:**
- `loadFinalizedAll()` 보존 (Phase 1). PlayerAnalytics 호출 제거
- Phase 2에서 제거 검토

### 3. 축구 `game_id` 부여

현재 축구는 `gameId` 개념 없음. 신규 기록 시:
- 경기 시작 시 `s_{startedAt_timestamp}` 부여
- Firebase/앱 상태/로그 공통 사용

Migration 시 과거 축구 경기:
- `soccerMatch.startedAt` 있으면 `s_{startedAt}`
- 없으면 `s_{date}_{matchIdx}` 폴백
- legacy 재구성의 경우 `legacy_{date}_{team_hash}_{match_idx}`

---

## Migration 전략

### 원칙

1. 기존 `로그_이벤트`/`로그_선수경기` **데이터 유실 제로** — 백업 안전망
2. 신규 컬럼(`game_id`)에만 UPDATE 적용 — 기존 값 덮어쓰기 없음
3. event_type 표준화 UPDATE는 기존 값 변경이지만 **백업 확보 후** 진행
4. 전 기간 최대한 복원, 완벽 불가능한 부분은 메타 표시로 고지

### 3단계 복원

#### 단계 1. 레거시 부분 복원 (로그_이벤트 + 로그_선수경기)

과거 전 기간의 `로그_매치`를 기존 통합 로그로 재구성.

```
키 추출:
  DISTINCT (date, match_id, our_team, opponent) FROM 로그_이벤트
  → 라운드 목록

각 라운드 복원:
  score       ← 해당 라운드 goal/owngoal 이벤트 수 카운트
  gk          ← concede 이벤트의 player
  home_members ← 로그_선수경기 WHERE date + session_team == our_team
  away_members ← 로그_선수경기 WHERE date + session_team == opponent
  game_id     ← `legacy_{date}_{team_hash}`
  
로그_매치 append + 로그_이벤트.game_id UPDATE (같은 라운드 이벤트에 동일 game_id)
```

**한계 (원리상 복구 불가):**
- 0:0 라운드 — 이벤트 없어 존재 자체 누락
- 세션 내 팀 이동 있는 선수 — session_team으로 유일성 불확실
- 축구 formation/defenders — 이벤트로그에 없음

이 한계를 PlayerAnalytics 메타에 "레거시 추정 경기 N건 포함 (근사치)" 로 명시.

#### 단계 2. Firebase 3일치 정확 복원 (덮어쓰기)

Firebase stateJSON 있는 최근 3일치를 정확한 데이터로 덮어쓴다.

```
Firebase games/{team}/finalized/_states/ 순회
각 stateJSON:
  - 해당 date의 로그_매치 기존 행 삭제
  - parseGameHistory → buildRoundRows → 로그_매치 append
  - 해당 date의 로그_이벤트.game_id UPDATE (정확한 Firebase gameId)
  - 0:0 라운드 포함
```

#### 단계 3. 신규 세션 (이후부터 자동)

Section 3의 `_writeRoundLog`가 확정 시 완전한 `로그_매치` 기록.

### 실행 스크립트

위치: `scripts/migrate/backfillMatchLog.mjs` (로컬 Node)

```
--dry-run: 리포트만 출력 (라운드 수, members 복원 개수, 0:0 추정 누락, 매칭 실패)
--apply: 실제 write
--team: 팀 네임스페이스 (필수)
--sport: 풋살/축구 (필수)
--phase: legacy | firebase | all (기본 all)
```

**실행 순서:**
```
1. Apps Script API 호출: _backupSheet("로그_이벤트") / _backupSheet("로그_선수경기")
2. Apps Script API 호출: _ensureEventLogHasGameId() (game_id 컬럼 추가)
3. Apps Script API 호출: migrateEventTypes() (event_type 표준화를 먼저 수행 — 이후 복원 로직이 표준값만 다룸)
4. 로그_매치 시트 신규 생성 (헤더만)
5. --dry-run 실행 및 리포트 확인 (라운드 수, members 복원 개수, 0:0 추정 누락, 매칭 실패)
6. --apply --phase=legacy (전 기간 근사 복원)
7. --apply --phase=firebase (3일치 정확 덮어쓰기)
8. 검증: 샘플 세션 수치 확인, PlayerAnalytics 기존 분석과 신규 분석 일치 여부
```

### 롤백 절차

백업 시트를 원래 이름으로 rename:
1. `로그_매치` 시트 삭제
2. `로그_이벤트` 삭제 후 `로그_이벤트_백업_YYYYMMDD_HHMM` rename
3. `로그_선수경기` 동일 처리 (실제로는 변경 없지만 안전)

### Phase 2 (앱 안정화 후)

1. 레거시 `포인트로그`, `선수별집계기록로그` 시트 폐기 결정
2. `FirebaseSync.loadFinalizedAll()` 제거
3. 백업 시트 정리

---

## PlayerAnalytics 탭별 소스 전환

| 탭 | Before | After |
|---|---|---|
| 골든콤비 | 포인트로그 | 로그_이벤트 (Phase 1은 포인트로그 병행 가능) |
| 키퍼킬러 | 포인트로그 | 로그_이벤트 |
| 시즌레이스 | 선수별집계기록로그 | 로그_선수경기 (변경 없음) |
| 득점콤비 | Firebase stateJSON | **로그_매치 + 로그_이벤트** |
| 시너지 | Firebase stateJSON | **로그_매치 + 로그_이벤트** |
| 🍀🌶️ | Firebase stateJSON | **로그_매치** (세션 팀 순위 재계산) |
| 시간대 | Firebase stateJSON | **로그_매치 + 로그_이벤트** |
| 선수카드 | Firebase + 선수별집계로그 + 대시보드CSV | **로그_매치 + 로그_이벤트 + 로그_선수경기 + 대시보드CSV** |

### 축구 탭 노출 변경

**Before (축구에서 숨김):** 키퍼킬러, 🍀🌶️, 시너지, 시간대
**After (축구에서 숨김):** 키퍼킬러 (상대 키퍼 미기록), 🍀🌶️ (세션 내 팀 순위 없음)

즉 **시너지, 득점콤비, 시간대는 축구에서도 노출**. 조건부: `로그_매치`에 해당 팀 데이터가 쌓여 있을 때만.

### 메타 표시

기존 "앱 기록 N세션 / 총 M라운드" 문구 확장:
```
분석 범위: 정확 경기 X건 / 레거시 추정 Y건 / 총 Z라운드
※ 레거시 추정 경기는 0:0 라운드와 일부 출전자 정보가 누락될 수 있습니다.
```

---

## 테스트 전략

### 단위 테스트 (신규)

- `buildRoundRows(stateJSON)`: 풋살/축구 stateJSON 각각 → 기대 rows 반환
- `buildGameRecordsFromLogs(matchRows, eventRows)`: rows → GameRecord[] 정확성
- `game_id` 조인 로직: 신규 행은 game_id 직접, 레거시는 (date, match_id, our_team) 조합
- members_json 파싱: 빈 배열, 정상 배열, 잘못된 JSON fallback

### 회귀 테스트

기존 계산 함수(`calcDefenseStats`, `calcWinContribution`, `calcSynergy`, `calcCombo2`, `calcCrovaGuma`, `calcTimePattern`)는 입력 스키마 불변. 테스트 수정 불필요.

### 검증 (Migration 후)

1. 특정 `game_id` 샘플로 Firebase stateJSON → `로그_매치` 변환 결과 육안 확인 (라운드 수/멤버 수/스코어)
2. PlayerAnalytics 기존 Firebase 분석 vs 신규 시트 분석 수치 일치 (최근 3일치 대상)
3. 축구/풋살 각 1팀씩 샘플 확인
4. 레거시 복원 경기: 시너지 계산이 기대대로 나오는지 (0:0 라운드 누락 영향 인지)

---

## 위험 요소

| 위험 | 완화 |
|---|---|
| 레거시 복원 부정확 | 메타 표시로 사용자 고지, Firebase 범위는 정확 덮어쓰기 |
| Apps Script 부분 실패 | 멱등 체크 (`game_id + match_id`), 재시도 API |
| 50K 셀 한도 | members_json은 보통 100~500자, 리스크 낮음. 모니터링 |
| `로그_이벤트` 데이터 손상 | `_backupSheet` 의무 실행, 롤백 절차 문서화 |
| 세션 내 팀 이동한 선수 | legacy 복원 시 1명이 여러 session_team에 등장 → members 중복 가능. dedup 처리 |
| 축구 `soccerMatches[]` 구조 다름 | 축구 전용 `buildRoundRows` 분기 구현 |

---

## 향후 과제 (본 설계 범위 외)

- 축구 이벤트 `minute` 필드 도입 → 축구 시간대 분석
- 레거시 `포인트로그`/`선수별집계기록로그` 폐기 결정 (Phase 2)
- `FirebaseSync.loadFinalizedAll()` 완전 제거 (Phase 2)
- PlayerAnalytics 메타 UI 정리 (정확/레거시 구분 표시)

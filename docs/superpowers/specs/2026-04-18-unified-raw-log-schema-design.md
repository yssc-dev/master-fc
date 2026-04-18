# 통합 로우 로그 스키마 설계 (로그_이벤트 / 로그_선수경기)

**작성일**: 2026-04-18
**상태**: 설계 확정, 구현 plan 작성 예정

---

## 1. 문제 정의

현재 로그 스키마가 3종으로 분화되어 있음:
- **풋살**(마스터FC): `포인트로그`(10열) + `선수별집계기록로그`(13열)
- **축구 기본**(하버FC): `축구_이벤트로그`(8열) + `축구_포인트로그`(8열) + `축구_선수별집계기록로그`(11열)
- **축구 대회**: `대회_{id}_이벤트로그`(7열) + `대회_{id}_대시보드`(10열)

**결과 문제**:
1. 분석 파이프라인이 종목마다 재작성됨 — 선수분석 탭이 풋살 스키마에 결합돼 축구 불가.
2. **같은 선수가 종목을 병행할 때 로그가 분산**돼 커리어 통합 조회 어려움.
3. `pointLogSheet`·`playerLogSheet`가 SHARED_KEYS라 한 팀이 두 종목을 병행하면 **동일 시트에 스키마 다른 데이터가 섞이는 버그**.
4. 대회 데이터는 매번 덮어쓰기 → 시계열 손실.
5. 하나의 스프레드시트에 팀·대회마다 시트가 계속 늘어남 (운영 부담).

## 2. 목표

- **쓰기** 경로에 통합 스키마 도입. 팀·종목·모드 무관하게 2개 시트로 수렴.
- **기존 시트는 불변**(read-only 보존). 이름·내용 절대 변경 금지 (기존 Google Sheets 수식 참조가 의존 중).
- 일회성 import로 과거 데이터 이관 (기존 시트에서 읽어 신규 시트에 변환 쓰기).
- 선수분석·대시보드는 신규 시트로 읽기 경로 전환 (후속 plan).
- 시트 추가 증식 정지: 팀·대회가 늘어도 로그 시트 수는 항상 2개.

## 3. 아키텍처 개요

```
[Google Spreadsheet (팀 공용)]
├── 포인트로그                 ← 기존 (read-only, 수식 참조 유지)
├── 선수별집계기록로그         ← 기존 (read-only)
├── 축구_이벤트로그            ← 기존 (read-only)
├── 축구_포인트로그            ← 기존 (read-only)
├── 축구_선수별집계기록로그    ← 기존 (read-only)
├── 대회_*_이벤트로그          ← 기존 (read-only)
├── 대회_*_대시보드            ← 기존 (read-only)
├── 로그_이벤트                ★ 신규 (통합 이벤트 로그, append-only)
└── 로그_선수경기              ★ 신규 (통합 선수-세션 집계, append-only)
```

**원칙**:
- 신규 시트는 append-only. 덮어쓰기 없음.
- 구분은 컬럼(`team`, `sport`, `mode`, `tournament_id`)으로만. 시트 이름에는 메타데이터를 넣지 않는다.
- 기존 시트와 동일 스프레드시트에 생성 → Apps Script 수식·참조 모두 같은 파일 내에서 동작.

## 4. 스키마

### 4.1 `로그_이벤트`

1 이벤트 = 1 row. long format.

| # | 컬럼 | 타입 | 값 / 규칙 |
|---|---|---|---|
| 1 | `team` | string | `'마스터FC'` \| `'하버FC'` … |
| 2 | `sport` | enum | `'풋살'` \| `'축구'` |
| 3 | `mode` | enum | `'기본'` \| `'대회'` |
| 4 | `tournament_id` | string | 대회 시 고유 ID(`'하버리그2026'` 등), 기본모드 시 `''` |
| 5 | `date` | date | 경기일자 `YYYY-MM-DD` |
| 6 | `match_id` | string | 세션 내 경기 식별. 풋살=matchId, 축구=matchNum 문자열 |
| 7 | `our_team` | string | 풋살=세션 내 회전팀명, 축구=우리팀명. 통상 `team`과 동일하나 풋살 세션 중에는 다름 |
| 8 | `opponent` | string | 상대팀명. 풋살 회전 상대팀, 축구 상대팀. 없으면 `''` |
| 9 | `event_type` | enum | `'goal'` \| `'ownGoal'` \| `'concede'` \| `'lineup'` \| `'sub'` |
| 10 | `player` | string | 이벤트 주체 |
| 11 | `related_player` | string | `goal`=assister, `sub`=교체아웃 선수. 없으면 `''` |
| 12 | `position` | string | 축구 `'GK'`/`'DF'`/`'FW'`, 풋살 `''` |
| 13 | `input_time` | datetime | KST 기록시각 |

**`event_type` 카탈로그**:

| 값 | 발생 | `player` | `related_player` | `position` | 비고 |
|---|---|---|---|---|---|
| `goal` | 득점 이벤트 | 득점자 | 어시스터 (없으면 `''`) | `''` | **어시는 별도 row 아님** |
| `ownGoal` | 자책골 | 자책한 선수 | `''` | `''` | |
| `concede` | 실점 (키퍼 관점) | 실점 당시 GK | `''` | `'GK'` (축구) / `''` (풋살) | 상대 득점 1건당 1 row |
| `lineup` | 경기 시작 시 출전명단 | 출전 선수 | `''` | 축구 포지션 | 축구 전용. 풋살은 출전 개념 약함 → 생략 |
| `sub` | 교체 | 투입 선수 | 빠진 선수 | 투입 포지션 | 축구 전용 |

**파생값은 이벤트에 없음** — clean sheet, 크로바/고구마/역주행은 `로그_선수경기`의 카운트 컬럼으로만 표현.

### 4.2 `로그_선수경기`

1 선수 × 1 세션(date) = 1 row. wide format.

| # | 컬럼 | 타입 | 값 / 규칙 |
|---|---|---|---|
| 1 | `team` | string | 소속 팀 |
| 2 | `sport` | enum | `'풋살'` \| `'축구'` |
| 3 | `mode` | enum | `'기본'` \| `'대회'` |
| 4 | `tournament_id` | string | 대회 시 ID, 기본 `''` |
| 5 | `date` | date | `YYYY-MM-DD` |
| 6 | `player` | string | 선수명 |
| 7 | `session_team` | string | 세션 내 소속팀 (풋살 회전팀 대응). 축구는 `team`과 동일 |
| 8 | `games` | int | 세션 내 전체 출전 경기 수 |
| 9 | `field_games` | int | 필드 출전 수 (축구). 풋살은 `games`와 동일 |
| 10 | `keeper_games` | int | GK 출전 수 |
| 11 | `goals` | int | 득점 |
| 12 | `assists` | int | 어시 |
| 13 | `owngoals` | int | 자책골 |
| 14 | `conceded` | int | 실점 (키퍼일 때) |
| 15 | `cleansheets` | int | 클린시트 경기 수 |
| 16 | `crova` | int | (풋살 전용) 세션 1위팀 소속 → 1, 아니면 0. 축구는 0 |
| 17 | `goguma` | int | (풋살 전용) 세션 꼴찌팀 소속 → 1, 아니면 0 |
| 18 | `역주행` | int | (풋살 전용) 역주행 횟수 |
| 19 | `rank_score` | number | (풋살 전용) 팀순위점수 |
| 20 | `input_time` | datetime | KST 기록시각 |

**종목별 Null 정책**: 종목에 없는 숫자 컬럼은 **`0`**, 문자 컬럼은 **`''`**. SQL/Python 분석 시 필터 가능.

### 4.3 Dedupe 키

동일 세션을 재기록·재import했을 때 중복 방지:

- **`로그_이벤트`**: `(team, sport, mode, tournament_id, date, match_id, event_type, player, related_player, input_time)` 전체 일치 시 중복.
  - 재기록 케이스(앱이 같은 경기를 2회 저장)는 `input_time`이 다를 수 있으므로, 정밀 dedupe가 필요하면 `input_time` 제외 버전을 분석 시 적용.
- **`로그_선수경기`**: `(team, sport, mode, tournament_id, date, player)` 일치 시 같은 row로 간주. import 시 기존 있으면 덮어쓰지 않고 skip.

**구현**: Apps Script는 append 시점에 해당 키로 이미 존재하는 row가 있는지 확인. 있으면 skip하고 skip 카운트 반환.

## 5. Row 생성 규칙

### 5.1 풋살 (마스터FC)

**기존** `writePointLog` 호출 시 수행하던 row 생성 로직과 **병행**하여 신규 row도 생성.

포인트 이벤트 → `로그_이벤트`:
```
입력: { gameDate, matchId, myTeam, opponentTeam, scorer, assist, ownGoalPlayer, concedingGk }
출력 (여러 row):
  scorer 있으면 →
    { event_type: 'goal', player: scorer, related_player: assist||'' }
  ownGoalPlayer 있으면 →
    { event_type: 'ownGoal', player: ownGoalPlayer }
  concedingGk 있으면 (scorer 없을 때만 상대 득점 상황) →
    { event_type: 'concede', player: concedingGk }
```

세션 종료 시 `writePlayerLog` 호출과 **병행**하여 `로그_선수경기`에도 쓰기:
```
입력: { gameDate, name, goals, assists, owngoals, conceded, cleanSheets, crova, goguma, keeperGames, rankScore, 역주행 }
출력 1 row:
  { team, sport='풋살', mode='기본', tournament_id='', date=gameDate, player=name,
    session_team=??, games=?, field_games=games(풋살은 동일), keeper_games=keeperGames,
    goals, assists, owngoals, conceded, cleansheets=cleanSheets,
    crova, goguma, 역주행, rank_score=rankScore, input_time=now }
```

`session_team` 결정 — 풋살은 세션 중 팀이 회전하므로 "마지막 소속팀" 또는 "대표 팀"을 선택. 단순화: 앱에서 세션 종료 시점 소속팀.

### 5.2 축구 기본 (하버FC)

기존 `writeSoccerPointLog` + `writeEventLog` 호출과 **병행**.

이벤트로그 row(`출전`/`골`/`자책골`/`실점`/`교체`) → `로그_이벤트` (1:1 매핑):
```
{ event:'출전',   player, position }    → { event_type:'lineup', player, position }
{ event:'골',     player, relatedPlayer, position } → { event_type:'goal', player, related_player=relatedPlayer }
{ event:'자책골', player }                → { event_type:'ownGoal', player }
{ event:'실점',   player=GK, position='GK' } → { event_type:'concede', player, position:'GK' }
{ event:'교체',   player=in, relatedPlayer=out, position } → { event_type:'sub', player, related_player, position }
```

선수별집계(`writeSoccerPlayerLog`) → `로그_선수경기`:
```
입력: { gameDate, name, games, fieldGames, keeperGames, goals, assists, cleanSheets, conceded, owngoals }
출력 1 row:
  { team, sport='축구', mode='기본', tournament_id='', date=gameDate, player=name,
    session_team=team, games, field_games=fieldGames, keeper_games=keeperGames,
    goals, assists, owngoals, conceded, cleansheets=cleanSheets,
    crova:0, goguma:0, 역주행:0, rank_score:0, input_time:now }
```

### 5.3 축구 대회

기존 `writeTournamentEventLog` + `writeTournamentPlayerRecord`와 **병행**.

**대회 데이터의 특징**:
- 기존 `대회_*_이벤트로그`에는 `경기일자`가 없음 → `로그_이벤트.date`는 대회 row별 **경기 진행일**을 기록. 없으면 대회 `startDate` 대체.
- 기존 `대회_*_대시보드`는 덮어쓰기 집계 → `로그_선수경기`는 **경기 확정 시점**에 세션(= 해당 경기일) 단위로 append.
  - 한 대회가 여러 날 경기면 각 경기일마다 per-player row 생성.
  - 집계는 선수 × 경기일 단위.

이벤트 매핑:
```
tournament event → raw_events:
  { event:'출전'/'골'/'자책골'/'실점'/'교체' }
  → 위 5.2와 동일. 단
    { team, sport='축구', mode='대회', tournament_id=tournamentId }
```

선수 집계 매핑:
```
match 확정 시 해당 date 기준으로 선수별 증분 계산 → 로그_선수경기 per-date row append.
```

**기존 덮어쓰기 시트는 유지** (현 대시보드 수식 참조 중). 신규 시트는 append-only로 병행.

## 6. 쓰기 경로 변경

Apps Script에 신규 함수 추가, 기존 함수는 변경 없음.

```js
// 신규 추가
_writeRawEvents(data)        // rows → append to 로그_이벤트
_writeRawPlayerGames(data)   // rows → append to 로그_선수경기
```

웹 앱에서 **동일 저장 트랜잭션 내에서 기존·신규 함수를 모두 호출** (dual-write):

```js
// 풋살 세션 저장 시
await Promise.all([
  AppSync.writePointLog(...),         // 기존 유지
  AppSync.writePlayerLog(...),        // 기존 유지
  AppSync.writeRawEvents(...),        // 신규
  AppSync.writeRawPlayerGames(...),   // 신규
]);
```

**실패 격리**: 신규 쓰기가 실패해도 기존 쓰기는 성공해야 함. 반대도 마찬가지. 둘 다 `Promise.allSettled`로 병렬 호출하고 각각 에러 로깅.

## 7. 읽기 경로 마이그레이션 (후속 plan)

이번 스펙 범위는 **쓰기 + import만**. 대시보드·선수분석 탭의 읽기 전환은 후속 plan으로 분리.

- 신규 시트에 충분한 데이터(기본 1시즌)가 쌓이기 전에는 **기존 시트 기반 읽기 유지**.
- 전환 시 `getPointLog`/`getPlayerLog`/`getEventLog`를 `getRawEvents`/`getRawPlayerGames`로 대체.
- 전환 후 기존 쓰기 함수는 **유지**(수식 호환 보존). Dual-write 상태 무기한 유지하거나 중단 시점 별도 논의.

## 8. 일회성 Import

### 8.1 원칙
- **기존 시트는 READ만**. 이름·내용 절대 변경 금지.
- Apps Script에 `_importLegacyToRaw()` 함수 추가. 수동 트리거 (버튼 또는 편집기 실행).
- 재실행 가능하게 dedupe 로직 필수.

### 8.2 변환 로직

**(a) `포인트로그` → `로그_이벤트` (풋살 기본)**:
```
각 row:
  scorer → { sport:'풋살', mode:'기본', tournament_id:'',
             team=teamCol, date=gameDate, match_id=matchId, our_team=myTeam, opponent=opponentTeam,
             event_type:'goal', player=scorer, related_player=assist,
             position:'', input_time=inputTime }
  ownGoalPlayer → event_type:'ownGoal'
  concedingGk (scorer 공란) → event_type:'concede'
```

**(b) `선수별집계기록로그` → `로그_선수경기` (풋살 기본)**:
```
각 row →
  { team=소속팀, sport:'풋살', mode:'기본', tournament_id:'',
    date=gameDate, player=선수명, session_team=소속팀,
    games=?(추정), field_games=games, keeper_games=키퍼경기수,
    goals, assists, owngoals=역주행 아님 주의, conceded=실점,
    cleansheets=클린시트, crova=(1위팀 소속이면 1), goguma=(꼴찌팀 소속이면 1),
    역주행=역주행, rank_score=팀순위점수, input_time=입력시간 }
```
- 풋살은 원본 `선수별집계기록로그`에 `games` 컬럼이 없고 lineup 이벤트도 없음 → import 시 `games=0`으로 기록(알려진 근사치). `field_games`는 동일 기준이므로 역시 0. 분석 시 풋살 `games`·`field_games`는 신규 기록분(dual-write 이후)만 의미 있음.

**(c) `축구_이벤트로그` → `로그_이벤트` (축구 기본)**:
```
5.2 매핑과 동일. team은 파일 내 고정 축구팀 명칭으로.
```

**(d) `축구_포인트로그`**: 이미 이벤트로그와 내용 중복이므로 **import 대상 아님** (skip).

**(e) `축구_선수별집계기록로그` → `로그_선수경기`**:
```
5.2 매핑과 동일.
```

**(f) `대회_{id}_이벤트로그` → `로그_이벤트`**:
```
date 결정: 대회 내 경기의 matchDate가 있으면 사용, 없으면 대회 schedule 참조 or 대회 startDate.
team=대회 참여팀, sport='축구', mode='대회', tournament_id={id}.
```

**(g) `대회_{id}_대시보드` → `로그_선수경기`**:
```
덮어쓰기 누적본이라 **경기일별 분할이 불가**.
→ 대회 전체를 하나의 date(대회 종료일 또는 startDate)로 묶어서 1 row 생성.
  mode='대회', tournament_id={id}.
→ 이는 근사치이며, 경기일별 데이터는 향후 raw_events 기반 재집계로 보완.
```

### 8.3 Import 진행 방식

수동 실행. Apps Script 편집기에서 `_importLegacyToRaw()`을 실행.
- 결과: `{ importedEvents, importedPlayerGames, skipped, errors }` 리포트.
- 실패 row는 `_importErrors` 시트(신규)에 로그.

## 9. 롤아웃 순서

1. **스키마 생성 Task**: `로그_이벤트`·`로그_선수경기` 시트 생성 + 헤더. Apps Script에 `_ensureRawSheets()` 추가.
2. **쓰기 함수 Task**: `_writeRawEvents`·`_writeRawPlayerGames` Apps Script 함수 + 클라이언트 `AppSync.writeRawEvents`·`writeRawPlayerGames`.
3. **풋살 dual-write 통합 Task**: `App.jsx` 세션 저장 경로에서 기존 쓰기와 함께 신규 호출.
4. **축구 기본 dual-write 통합 Task**: `SoccerApp.jsx`에서 동일.
5. **축구 대회 dual-write 통합 Task**: `TournamentMatchManager.jsx`에서 동일.
6. **일회성 import Task**: `_importLegacyToRaw()` 구현 + 검증 리포트.
7. **수동 실행 & 검증**: 각 팀에서 import 실행, row 수·합계 검증.
8. **(후속 plan)** 대시보드·선수분석 읽기 경로 전환.

**각 단계 독립 배포 가능**. 1-2 완료 후 3-5는 병렬, 6은 3-5 완료 후.

## 10. Apps Script 인터페이스

```js
// POST body: { action:'writeRawEvents', data:{ rows:[{...}] } }
function _writeRawEvents(data) → { success, count, skipped }

// POST body: { action:'writeRawPlayerGames', data:{ rows:[{...}] } }
function _writeRawPlayerGames(data) → { success, count, skipped }

// 편집기에서 수동 실행
function _importLegacyToRaw() → { importedEvents, importedPlayerGames, skipped, errors }

// 시트 초기화 (헤더만 없으면 생성)
function _ensureRawSheets() → { created: [...] }
```

`_ensureRawSheets`는 첫 쓰기 호출 시 내부에서 자동 실행되므로 수동 실행 필수 아님.

## 11. 범위 외 / 향후

- **읽기 경로 전환**: 본 스펙 범위 외. 후속 plan으로 `대시보드/선수분석 → 로그_이벤트·로그_선수경기` 경로 변경.
- **기존 쓰기 중단**: 현 수식 의존 때문에 무기한 유지. 중단 시점은 별도 판단.
- **팀 간 크로스 분석 UI**: 본 스펙은 데이터 구조만. 분석 UI는 후속.
- **실시간 집계 캐시**: 대시보드 응답 속도를 위해 `raw_player_games` 집계 캐시가 필요할 수 있으나 본 스펙 범위 외.
- **풋살 lineup 이벤트**: 풋살엔 출전명단 개념이 약해 이번 스펙에서 제외. 필요 시 차후 확장.

## 12. 리스크

- **Dual-write 중 부분 실패**: 기존 성공/신규 실패 시 데이터 비대칭. → `Promise.allSettled` + 에러 로깅, 분석 전 row 수 검증 루틴 준비.
- **Import dedupe 누락**: 재실행 시 중복. → dedupe 키 필수, 테스트 필수.
- **풋살 선수별집계 `games` 컬럼 부재**: import 시 추정 불가. → `0`으로 기록 + TODO 주석. 후속 plan에서 `로그_이벤트` lineup 재집계로 보완 가능.
- **대회 데이터 덮어쓰기 유산**: import 시 경기일별 분할 불가 → 대회 단위 1 row로 집계. 이는 알려진 근사치임을 문서화.
- **시트 row 한도 (10M cell limit)**: 추정상 수년치 쌓여도 무리 없음. 모니터링만.

# 통합 로우 로그 스키마 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 풋살·축구·대회가 공용으로 쓰는 `로그_이벤트`/`로그_선수경기` 2개 시트 + dual-write + 기존 데이터 일회성 import를 도입한다.

**Architecture:** 기존 쓰기 로직은 건드리지 않고 병행(`Promise.allSettled`) 추가. 클라이언트에는 순수 빌더 함수(종목별 3쌍)로 raw 포맷 변환. Apps Script에는 append-only 쓰기 + dedupe + legacy 시트 read-only 변환 import 함수 추가.

**Tech Stack:** React 19 + Vitest 2.x + Google Apps Script (기존 스택 그대로)

**Spec 참조:** `docs/superpowers/specs/2026-04-18-unified-raw-log-schema-design.md`

**Scope 주의:**
- 대회(mode='대회')는 **`로그_이벤트`만** dual-write. `로그_선수경기`는 이번 plan 범위 외 (append-only와 대회 증분 집계가 충돌, `로그_이벤트`로부터 파생 계산이 자연스러움). 스펙 section 11 "후속 과제"에 부합.
- 읽기 경로 전환(대시보드·선수분석)은 별도 plan.

---

## 파일 구조

**신규 생성**:
- `src/utils/rawLogBuilders.js` — 6개 순수 함수 + 2개 컬럼 상수
- `src/utils/__tests__/rawLogBuilders.test.js` — 단위 테스트

**수정**:
- `src/services/appSync.js` — `writeRawEvents`, `writeRawPlayerGames` 메서드 추가
- `src/App.jsx` — 풋살 세션 저장 dual-write
- `src/SoccerApp.jsx` — 축구 기본 저장 dual-write
- `src/components/tournament/TournamentMatchManager.jsx` — 대회 match 저장 dual-write
- `apps-script/Code.js` — `_ensureRawSheets`, `_writeRawEvents`, `_writeRawPlayerGames`, `_importLegacyToRaw` + doPost action 라우팅

---

## Task 1: rawLogBuilders 스캐폴드 + 컬럼 상수

**Files:**
- Create: `src/utils/rawLogBuilders.js`
- Create: `src/utils/__tests__/rawLogBuilders.test.js`

- [ ] **Step 1: 빈 파일 + 컬럼 상수 작성**

`src/utils/rawLogBuilders.js`:
```js
// 통합 로우 로그 (로그_이벤트, 로그_선수경기) 쓰기용 row 빌더 모음.
// React/DOM 의존성 없음. Apps Script 스키마와 1:1 대응.

export const RAW_EVENT_COLUMNS = [
  "team", "sport", "mode", "tournament_id",
  "date", "match_id", "our_team", "opponent",
  "event_type", "player", "related_player", "position",
  "input_time",
];

export const RAW_PLAYER_GAME_COLUMNS = [
  "team", "sport", "mode", "tournament_id", "date",
  "player", "session_team",
  "games", "field_games", "keeper_games",
  "goals", "assists", "owngoals", "conceded", "cleansheets",
  "crova", "goguma", "역주행", "rank_score",
  "input_time",
];
```

- [ ] **Step 2: 테스트 파일 초기화 (컬럼 상수 검증)**

`src/utils/__tests__/rawLogBuilders.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS } from '../rawLogBuilders';

describe('raw log column constants', () => {
  it('RAW_EVENT_COLUMNS: 13개, 스펙 순서대로', () => {
    expect(RAW_EVENT_COLUMNS).toHaveLength(13);
    expect(RAW_EVENT_COLUMNS[0]).toBe('team');
    expect(RAW_EVENT_COLUMNS[8]).toBe('event_type');
    expect(RAW_EVENT_COLUMNS[12]).toBe('input_time');
  });

  it('RAW_PLAYER_GAME_COLUMNS: 20개, 풋살 전용 필드 포함', () => {
    expect(RAW_PLAYER_GAME_COLUMNS).toHaveLength(20);
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('crova');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('goguma');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('역주행');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('rank_score');
  });
});
```

- [ ] **Step 3: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: `Tests 2 passed`

- [ ] **Step 4: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "raw log builders 스캐폴드 + 컬럼 상수"
```

---

## Task 2: 풋살 이벤트 빌더 `buildRawEventsFromFutsal`

**Files:**
- Modify: `src/utils/rawLogBuilders.js`
- Modify: `src/utils/__tests__/rawLogBuilders.test.js`

**입력 형태** (App.jsx의 `pointEvents` 포맷):
```js
{
  team,                  // 팀 컨텍스트 team (예: '마스터FC')
  gameDate,              // 'YYYY-MM-DD'
  inputTime,             // 한국시간 문자열
  events: [{             // 기존 pointEvents row 스키마
    gameDate, matchId, myTeam, opponentTeam,
    scorer, assist, ownGoalPlayer, concedingGk,
    inputTime,
  }]
}
```

**출력**: `RAW_EVENT_COLUMNS` 스키마를 따르는 row 객체 배열. 1 pointEvent → 1~3 row (scorer/ownGoal/concede 분해).

- [ ] **Step 1: 실패 테스트 작성**

`src/utils/__tests__/rawLogBuilders.test.js`에 추가:
```js
import { buildRawEventsFromFutsal } from '../rawLogBuilders';

describe('buildRawEventsFromFutsal', () => {
  const base = {
    team: '마스터FC',
    events: [{
      gameDate: '2026-04-10', matchId: '1라운드 A구장',
      myTeam: '블루', opponentTeam: '레드',
      scorer: '홍길동', assist: '김철수',
      ownGoalPlayer: '', concedingGk: '',
      inputTime: '2026-04-10 20:00:00',
    }],
  };

  it('득점 이벤트 → goal row 1개 (assist는 related_player)', () => {
    const rows = buildRawEventsFromFutsal(base);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '',
      date: '2026-04-10', match_id: '1라운드 A구장',
      our_team: '블루', opponent: '레드',
      event_type: 'goal', player: '홍길동', related_player: '김철수',
      position: '', input_time: '2026-04-10 20:00:00',
    });
  });

  it('자책골 이벤트 → ownGoal row', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '이영수', concedingGk: '',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('ownGoal');
    expect(rows[0].player).toBe('이영수');
    expect(rows[0].related_player).toBe('');
  });

  it('실점 (scorer 공란, concedingGk 있음) → concede row', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '', concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].player).toBe('박지성');
  });

  it('한 event에 goal + concedingGk 동시 → goal만 생성 (scorer 우선)', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '홍길동', assist: '', ownGoalPlayer: '', concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('goal');
  });

  it('빈 events → 빈 배열', () => {
    expect(buildRawEventsFromFutsal({ team: 'X', events: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: FAIL with `buildRawEventsFromFutsal is not a function` 또는 유사

- [ ] **Step 3: 빌더 구현**

`src/utils/rawLogBuilders.js`에 추가:
```js
/**
 * 풋살 pointEvents → 로그_이벤트 rows
 * @param {{ team:string, events:Array<object> }} input
 * @returns {Array<object>} RAW_EVENT_COLUMNS 스키마 row 배열
 */
export function buildRawEventsFromFutsal({ team, events }) {
  const out = [];
  (events || []).forEach(e => {
    const common = {
      team, sport: '풋살', mode: '기본', tournament_id: '',
      date: e.gameDate, match_id: e.matchId,
      our_team: e.myTeam || '', opponent: e.opponentTeam || '',
      position: '', input_time: e.inputTime || '',
    };
    if (e.scorer) {
      out.push({ ...common, event_type: 'goal', player: e.scorer, related_player: e.assist || '' });
    } else if (e.ownGoalPlayer) {
      out.push({ ...common, event_type: 'ownGoal', player: e.ownGoalPlayer, related_player: '' });
    } else if (e.concedingGk) {
      out.push({ ...common, event_type: 'concede', player: e.concedingGk, related_player: '' });
    }
  });
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: all pass

- [ ] **Step 5: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "buildRawEventsFromFutsal"
```

---

## Task 3: 풋살 선수경기 빌더 `buildRawPlayerGamesFromFutsal`

**Files:**
- Modify: `src/utils/rawLogBuilders.js`
- Modify: `src/utils/__tests__/rawLogBuilders.test.js`

**입력**: App.jsx의 `playerData` 포맷:
```js
{
  team, inputTime,
  players: [{
    gameDate, name,
    goals, assists, owngoals, conceded, cleanSheets,
    crova, goguma, keeperGames, rankScore,
    역주행 = 0,    // 현재 playerData엔 없을 수 있음 → 0 기본
    playerTeam,   // 세션 내 최종 소속팀 (호출부에서 채움)
  }]
}
```

- [ ] **Step 1: 실패 테스트 작성**

`src/utils/__tests__/rawLogBuilders.test.js`에 추가:
```js
import { buildRawPlayerGamesFromFutsal } from '../rawLogBuilders';

describe('buildRawPlayerGamesFromFutsal', () => {
  it('플레이어 1명 → 1 row, 스키마 맞음', () => {
    const rows = buildRawPlayerGamesFromFutsal({
      team: '마스터FC', inputTime: '2026-04-10 21:00:00',
      players: [{
        gameDate: '2026-04-10', name: '홍길동',
        goals: 3, assists: 1, owngoals: 0, conceded: 0, cleanSheets: 1,
        crova: 1, goguma: 0, keeperGames: 1, rankScore: 4,
        역주행: 0, playerTeam: '블루',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '',
      date: '2026-04-10', player: '홍길동', session_team: '블루',
      games: 0, field_games: 0,       // 풋살은 games 원본 없음 → 0 기본
      keeper_games: 1,
      goals: 3, assists: 1, owngoals: 0, conceded: 0, cleansheets: 1,
      crova: 1, goguma: 0, 역주행: 0, rank_score: 4,
      input_time: '2026-04-10 21:00:00',
    });
  });

  it('역주행 기본 0', () => {
    const rows = buildRawPlayerGamesFromFutsal({
      team: '마스터FC', inputTime: 't',
      players: [{ gameDate: '2026-04-10', name: 'A', goals:0, assists:0, owngoals:0,
                  conceded:0, cleanSheets:0, crova:0, goguma:0, keeperGames:0, rankScore:0,
                  playerTeam:'블루' }],
    });
    expect(rows[0].역주행).toBe(0);
  });

  it('빈 players → 빈 배열', () => {
    expect(buildRawPlayerGamesFromFutsal({ team: 'X', players: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: FAIL

- [ ] **Step 3: 빌더 구현**

`src/utils/rawLogBuilders.js`에 추가:
```js
/**
 * 풋살 playerData → 로그_선수경기 rows
 */
export function buildRawPlayerGamesFromFutsal({ team, inputTime, players }) {
  return (players || []).map(p => ({
    team, sport: '풋살', mode: '기본', tournament_id: '',
    date: p.gameDate, player: p.name, session_team: p.playerTeam || '',
    games: 0, field_games: 0, keeper_games: Number(p.keeperGames) || 0,
    goals: Number(p.goals) || 0,
    assists: Number(p.assists) || 0,
    owngoals: Number(p.owngoals) || 0,
    conceded: Number(p.conceded) || 0,
    cleansheets: Number(p.cleanSheets) || 0,
    crova: Number(p.crova) || 0,
    goguma: Number(p.goguma) || 0,
    역주행: Number(p.역주행) || 0,
    rank_score: Number(p.rankScore) || 0,
    input_time: inputTime || '',
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: pass

- [ ] **Step 5: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "buildRawPlayerGamesFromFutsal"
```

---

## Task 4: 축구 이벤트 빌더 `buildRawEventsFromSoccer`

**Files:**
- Modify: `src/utils/rawLogBuilders.js`
- Modify: `src/utils/__tests__/rawLogBuilders.test.js`

**입력**: `buildEventLogRows` 결과(축구 이벤트 row 배열) + team 정보:
```js
{
  team, mode = '기본', tournamentId = '',
  events: [{                // buildEventLogRows 반환 스키마
    gameDate, matchNum, opponent,
    event: '출전'|'골'|'자책골'|'실점'|'교체',
    player, relatedPlayer, position, inputTime,
  }]
}
```

- [ ] **Step 1: 실패 테스트 작성**

```js
import { buildRawEventsFromSoccer } from '../rawLogBuilders';

describe('buildRawEventsFromSoccer', () => {
  const mk = (ev) => ({
    team: '하버FC', mode: '기본', tournamentId: '',
    events: [{ gameDate: '2026-04-10', matchNum: 1, opponent: '상대A', ...ev }],
  });

  it('출전 → lineup', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '출전', player: 'A', relatedPlayer: '', position: 'GK', inputTime: 't' }));
    expect(rows[0]).toMatchObject({
      team: '하버FC', sport: '축구', mode: '기본', tournament_id: '',
      date: '2026-04-10', match_id: '1', our_team: '하버FC', opponent: '상대A',
      event_type: 'lineup', player: 'A', related_player: '', position: 'GK', input_time: 't',
    });
  });

  it('골 → goal (relatedPlayer 유지)', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '골', player: 'B', relatedPlayer: 'C', position: '', inputTime: 't' }));
    expect(rows[0].event_type).toBe('goal');
    expect(rows[0].player).toBe('B');
    expect(rows[0].related_player).toBe('C');
  });

  it('자책골 → ownGoal', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '자책골', player: 'D', relatedPlayer: '', position: '', inputTime: 't' }));
    expect(rows[0].event_type).toBe('ownGoal');
  });

  it('실점 → concede, position GK', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '실점', player: 'E', relatedPlayer: '', position: 'GK', inputTime: 't' }));
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].position).toBe('GK');
  });

  it('교체 → sub (playerIn/playerOut)', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '교체', player: 'IN', relatedPlayer: 'OUT', position: 'FW', inputTime: 't' }));
    expect(rows[0].event_type).toBe('sub');
    expect(rows[0].player).toBe('IN');
    expect(rows[0].related_player).toBe('OUT');
  });

  it('대회모드 → mode="대회", tournament_id 세팅', () => {
    const rows = buildRawEventsFromSoccer({
      team: '하버FC', mode: '대회', tournamentId: '하버리그2026',
      events: [{ gameDate: '2026-05-01', matchNum: 3, opponent: 'X', event: '골', player: 'Y', relatedPlayer: '', position: '', inputTime: 't' }],
    });
    expect(rows[0].mode).toBe('대회');
    expect(rows[0].tournament_id).toBe('하버리그2026');
  });

  it('알 수 없는 event → 스킵', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '경고', player: 'A', relatedPlayer: '', position: '', inputTime: 't' }));
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: FAIL

- [ ] **Step 3: 빌더 구현**

```js
const SOCCER_EVENT_MAP = {
  '출전': 'lineup',
  '골': 'goal',
  '자책골': 'ownGoal',
  '실점': 'concede',
  '교체': 'sub',
};

/**
 * 축구 이벤트로그 row → 로그_이벤트 rows (기본/대회 공통)
 * @param {{ team, mode, tournamentId, events }} input
 */
export function buildRawEventsFromSoccer({ team, mode = '기본', tournamentId = '', events }) {
  const out = [];
  (events || []).forEach(e => {
    const type = SOCCER_EVENT_MAP[e.event];
    if (!type) return;
    out.push({
      team, sport: '축구', mode, tournament_id: tournamentId || '',
      date: e.gameDate, match_id: String(e.matchNum ?? ''),
      our_team: team, opponent: e.opponent || '',
      event_type: type,
      player: e.player || '', related_player: e.relatedPlayer || '',
      position: e.position || '', input_time: e.inputTime || '',
    });
  });
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: pass

- [ ] **Step 5: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "buildRawEventsFromSoccer (기본+대회 공용)"
```

---

## Task 5: 축구 선수경기 빌더 `buildRawPlayerGamesFromSoccer`

**Files:**
- Modify: `src/utils/rawLogBuilders.js`
- Modify: `src/utils/__tests__/rawLogBuilders.test.js`

**입력**: `buildPlayerLogRows` 결과 + 메타:
```js
{
  team, inputTime,          // 축구 기본 전용 (대회는 raw_player_games 쓰지 않음)
  players: [{
    gameDate, name,
    games, fieldGames, keeperGames,
    goals, assists, cleanSheets, conceded, owngoals,
  }]
}
```

- [ ] **Step 1: 실패 테스트 작성**

```js
import { buildRawPlayerGamesFromSoccer } from '../rawLogBuilders';

describe('buildRawPlayerGamesFromSoccer', () => {
  it('매핑 정확', () => {
    const rows = buildRawPlayerGamesFromSoccer({
      team: '하버FC', inputTime: 't',
      players: [{ gameDate: '2026-04-10', name: 'A',
                  games: 3, fieldGames: 2, keeperGames: 1,
                  goals: 2, assists: 1, cleanSheets: 1, conceded: 3, owngoals: 0 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '하버FC', sport: '축구', mode: '기본', tournament_id: '',
      date: '2026-04-10', player: 'A', session_team: '하버FC',
      games: 3, field_games: 2, keeper_games: 1,
      goals: 2, assists: 1, owngoals: 0, conceded: 3, cleansheets: 1,
      crova: 0, goguma: 0, 역주행: 0, rank_score: 0,
      input_time: 't',
    });
  });

  it('빈 players → 빈 배열', () => {
    expect(buildRawPlayerGamesFromSoccer({ team: 'X', players: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: FAIL

- [ ] **Step 3: 빌더 구현**

```js
/**
 * 축구 기본 playerLogRows → 로그_선수경기 rows.
 * 대회 모드는 append-only와 증분 집계가 충돌하므로 이 함수로 생성하지 않음.
 */
export function buildRawPlayerGamesFromSoccer({ team, inputTime, players }) {
  return (players || []).map(p => ({
    team, sport: '축구', mode: '기본', tournament_id: '',
    date: p.gameDate, player: p.name, session_team: team,
    games: Number(p.games) || 0,
    field_games: Number(p.fieldGames) || 0,
    keeper_games: Number(p.keeperGames) || 0,
    goals: Number(p.goals) || 0,
    assists: Number(p.assists) || 0,
    owngoals: Number(p.owngoals) || 0,
    conceded: Number(p.conceded) || 0,
    cleansheets: Number(p.cleanSheets) || 0,
    crova: 0, goguma: 0, 역주행: 0, rank_score: 0,
    input_time: inputTime || '',
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: pass

- [ ] **Step 5: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "buildRawPlayerGamesFromSoccer"
```

---

## Task 6: AppSync 클라이언트 메서드 2종

**Files:**
- Modify: `src/services/appSync.js:210` 뒤

- [ ] **Step 1: `writeRawEvents` + `writeRawPlayerGames` 메서드 추가**

`src/services/appSync.js`의 `writeSoccerPlayerLog` 바로 뒤에 삽입:
```js
  async writeRawEvents(data) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeRawEvents", data: { ...data, team }, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_이벤트 저장 실패:", e.message); return null; }
  },

  async writeRawPlayerGames(data) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeRawPlayerGames", data: { ...data, team }, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_선수경기 저장 실패:", e.message); return null; }
  },
```

- [ ] **Step 2: 빌드 검증 (import 에러 없는지)**

Run: `npm run build`
Expected: `✓ built in ...`

- [ ] **Step 3: 커밋**

```bash
git add src/services/appSync.js
git commit -m "AppSync: writeRawEvents/writeRawPlayerGames 메서드"
```

---

## Task 7: Apps Script 기반 구조 (시트 생성 + 쓰기 + action 라우팅)

**Files:**
- Modify: `apps-script/Code.js`

**참고**: Apps Script는 별도 배포가 필요. 이 task 완료 후 사용자가 수동으로 배포해야 실제 작동함.

- [ ] **Step 1: 상수 + `_ensureRawSheets` 함수 추가**

`apps-script/Code.js` 파일 상단 `var PLAYER_LOG_SHEET = "선수별집계기록로그";` 바로 뒤에 추가:
```js
var RAW_EVENTS_SHEET = "로그_이벤트";
var RAW_PLAYER_GAMES_SHEET = "로그_선수경기";

var RAW_EVENTS_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","match_id","our_team","opponent",
  "event_type","player","related_player","position",
  "input_time"
];

var RAW_PLAYER_GAMES_HEADERS = [
  "team","sport","mode","tournament_id","date",
  "player","session_team",
  "games","field_games","keeper_games",
  "goals","assists","owngoals","conceded","cleansheets",
  "crova","goguma","역주행","rank_score",
  "input_time"
];

function _ensureRawSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];
  var ev = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!ev) {
    ev = ss.insertSheet(RAW_EVENTS_SHEET);
    ev.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setValues([RAW_EVENTS_HEADERS]);
    ev.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setFontWeight("bold");
    created.push(RAW_EVENTS_SHEET);
  }
  var pg = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!pg) {
    pg = ss.insertSheet(RAW_PLAYER_GAMES_SHEET);
    pg.getRange(1, 1, 1, RAW_PLAYER_GAMES_HEADERS.length).setValues([RAW_PLAYER_GAMES_HEADERS]);
    pg.getRange(1, 1, 1, RAW_PLAYER_GAMES_HEADERS.length).setFontWeight("bold");
    created.push(RAW_PLAYER_GAMES_SHEET);
  }
  return { created: created };
}
```

- [ ] **Step 2: `_writeRawEvents` 구현 (dedupe 포함)**

같은 파일, `_writeSoccerPlayerLog` 함수 바로 뒤에 추가:
```js
function _writeRawEvents(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
    var existingKeys = _loadRawEventKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = _rawEventKey(r);
      if (existingKeys[key]) { skipped++; continue; }
      existingKeys[key] = true;
      toInsert.push(_rawEventToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_EVENTS_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _rawEventKey(r) {
  return [r.team, r.sport, r.mode, r.tournament_id, r.date, r.match_id,
    r.event_type, r.player, r.related_player, r.input_time].join("|");
}

function _rawEventToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.match_id||"", r.our_team||"", r.opponent||"",
    r.event_type||"", r.player||"", r.related_player||"", r.position||"",
    r.input_time||""];
}

function _loadRawEventKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_EVENTS_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    // [team, sport, mode, tid, date, match_id, our_team, opponent, event_type, player, related_player, position, input_time]
    var key = [r[0], r[1], r[2], r[3], r[4], r[5], r[8], r[9], r[10], r[12]].join("|");
    keys[key] = true;
  }
  return keys;
}
```

- [ ] **Step 3: `_writeRawPlayerGames` 구현**

바로 뒤에 추가:
```js
function _writeRawPlayerGames(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
    var existingKeys = _loadRawPlayerGameKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = _rawPlayerGameKey(r);
      if (existingKeys[key]) { skipped++; continue; }
      existingKeys[key] = true;
      toInsert.push(_rawPlayerGameToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_PLAYER_GAMES_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _rawPlayerGameKey(r) {
  return [r.team, r.sport, r.mode, r.tournament_id, r.date, r.player].join("|");
}

function _rawPlayerGameToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.player||"", r.session_team||"",
    Number(r.games)||0, Number(r.field_games)||0, Number(r.keeper_games)||0,
    Number(r.goals)||0, Number(r.assists)||0, Number(r.owngoals)||0,
    Number(r.conceded)||0, Number(r.cleansheets)||0,
    Number(r.crova)||0, Number(r.goguma)||0, Number(r["역주행"])||0, Number(r.rank_score)||0,
    r.input_time||""];
}

function _loadRawPlayerGameKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    // [team, sport, mode, tid, date, player, session_team, ...]
    var key = [r[0], r[1], r[2], r[3], r[4], r[5]].join("|");
    keys[key] = true;
  }
  return keys;
}
```

- [ ] **Step 4: doPost 라우팅 추가**

`apps-script/Code.js`에서 기존 action 라우팅 블록(예: `writeSoccerPlayerLog` 라우팅이 있는 곳)에 추가. `apps-script/Code.js:182` 부근의 `} else if (action === "writeSoccerPlayerLog")` 블록 직후에 삽입:
```js
    } else if (action === "writeRawEvents") {
      return _jsonResponse(_writeRawEvents(body.data));
    } else if (action === "writeRawPlayerGames") {
      return _jsonResponse(_writeRawPlayerGames(body.data));
```

- [ ] **Step 5: 커밋**

```bash
git add apps-script/Code.js
git commit -m "Apps Script: 로그_이벤트/로그_선수경기 시트 + dedupe 쓰기"
```

- [ ] **Step 6 (사용자 수동): Apps Script 배포**

사용자가 Apps Script 편집기에서 새 버전으로 배포해야 실제 반영됨. 배포 전까지는 클라이언트 호출 시 이전 버전이 응답 (action 미인식으로 실패).

이 단계는 구현자가 수행 불가 — 플랜 실행 중 사용자에게 명시적으로 요청.

---

## Task 8: 풋살 dual-write 통합

**Files:**
- Modify: `src/App.jsx:584-595` (handleFinalize try 블록)

- [ ] **Step 1: import 추가**

`src/App.jsx` 상단 import 블록에 추가:
```js
import { buildRawEventsFromFutsal, buildRawPlayerGamesFromFutsal } from './utils/rawLogBuilders';
```

- [ ] **Step 2: dual-write 로직 교체**

`src/App.jsx:584-595`을 다음으로 교체:
```js
    const team = teamContext?.team || '';
    const rawEvents = buildRawEventsFromFutsal({ team, events: pointEvents });
    const rawPlayerGames = buildRawPlayerGamesFromFutsal({
      team, inputTime,
      players: playerData.map(p => ({ ...p, playerTeam: getPlayerTeamName(p.name) })),
    });

    try {
      const results = await Promise.allSettled([
        AppSync.writePointLog({ events: pointEvents }, ES.pointLogSheet),
        AppSync.writePlayerLog({ players: playerData }, ES.playerLogSheet),
        AppSync.writeRawEvents({ rows: rawEvents }),
        AppSync.writeRawPlayerGames({ rows: rawPlayerGames }),
      ]);
      const [r1, r2, r3, r4] = results;
      const legacyOk = r1.status === 'fulfilled' && r2.status === 'fulfilled';
      if (!legacyOk) throw new Error('기존 시트 저장 실패');
      await AppSync.finalizeState(gameId);
      await FirebaseSync.clearState(teamContext?.team, gameId);
      const r1v = r1.value, r2v = r2.value;
      const r3v = r3.status === 'fulfilled' ? r3.value : null;
      const r4v = r4.status === 'fulfilled' ? r4.value : null;
      alert(`기록 확정 완료!\n\n포인트로그: ${r1v?.count || 0}건\n선수별집계: ${r2v?.count || 0}명\n로그_이벤트: ${r3v?.count || 0}건${r3v?.skipped ? ` (skip ${r3v.skipped})` : ''}\n로그_선수경기: ${r4v?.count || 0}명${r4v?.skipped ? ` (skip ${r4v.skipped})` : ''}`);
      onBackToMenu?.();
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: `✓ built in ...`

- [ ] **Step 4: 커밋**

```bash
git add src/App.jsx
git commit -m "풋살 세션 저장 시 로그_이벤트/로그_선수경기 dual-write"
```

---

## Task 9: 축구 기본 dual-write 통합

**Files:**
- Modify: `src/SoccerApp.jsx:212-228` (handleFinalize try 블록)

- [ ] **Step 1: import 추가**

`src/SoccerApp.jsx` 상단 import 블록에 추가:
```js
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from './utils/rawLogBuilders';
```

- [ ] **Step 2: dual-write 로직 교체**

`src/SoccerApp.jsx:212-228`을 다음으로 교체:
```js
    const eventLogRows = buildEventLogRows(finished, dateStr);
    const pointLogRows = buildPointLogRows(finished, dateStr, inputTime);
    const playerLogRows = buildPlayerLogRows(finished, dateStr, inputTime);
    const team = teamContext?.team || '';
    const rawEvents = buildRawEventsFromSoccer({ team, events: eventLogRows });
    const rawPlayerGames = buildRawPlayerGamesFromSoccer({ team, inputTime, players: playerLogRows });

    try {
      const results = await Promise.allSettled([
        AppSync.writeEventLog({ events: eventLogRows }, gameSettings.eventLogSheet),
        AppSync.writeSoccerPointLog({ events: pointLogRows }, gameSettings.pointLogSheet),
        AppSync.writeSoccerPlayerLog({ players: playerLogRows }, gameSettings.playerLogSheet),
        AppSync.writeRawEvents({ rows: rawEvents }),
        AppSync.writeRawPlayerGames({ rows: rawPlayerGames }),
      ]);
      const [r1, r2, r3, r4, r5] = results;
      const legacyOk = r1.status === 'fulfilled' && r2.status === 'fulfilled' && r3.status === 'fulfilled';
      if (!legacyOk) throw new Error('기존 시트 저장 실패');
      await AppSync.finalizeState(gameId);
      await FirebaseSync.clearState(teamContext?.team, gameId);
      const r1v = r1.value, r2v = r2.value, r3v = r3.value;
      const r4v = r4.status === 'fulfilled' ? r4.value : null;
      const r5v = r5.status === 'fulfilled' ? r5.value : null;
      alert(`기록 확정 완료!\n\n이벤트로그: ${r1v?.count || 0}건\n포인트로그: ${r2v?.count || 0}건\n선수별집계: ${r3v?.count || 0}명\n로그_이벤트: ${r4v?.count || 0}건${r4v?.skipped ? ` (skip ${r4v.skipped})` : ''}\n로그_선수경기: ${r5v?.count || 0}명${r5v?.skipped ? ` (skip ${r5v.skipped})` : ''}`);
      onBackToMenu?.();
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: pass

- [ ] **Step 4: 커밋**

```bash
git add src/SoccerApp.jsx
git commit -m "축구 기본 저장 시 로그_이벤트/로그_선수경기 dual-write"
```

---

## Task 10: 축구 대회 이벤트 dual-write (로그_이벤트만)

**Files:**
- Modify: `src/components/tournament/TournamentMatchManager.jsx:126-145` (handleFinalize 본문)

**중요**: 대회는 `로그_이벤트`만 쓴다 (append-only와 대회 증분 집계가 충돌).

- [ ] **Step 1: import 추가**

`src/components/tournament/TournamentMatchManager.jsx` 상단:
```js
import { buildRawEventsFromSoccer } from '../../utils/rawLogBuilders';
```

- [ ] **Step 2: dual-write 로직 삽입**

`src/components/tournament/TournamentMatchManager.jsx:127` 줄(`const eventRows = buildEventLogRows(...)`) 바로 뒤, `await AppSync.writeTournamentEventLog(...)` 다음 줄에 추가:
```js
    const rawEvents = buildRawEventsFromSoccer({
      team: ourTeamName,
      mode: '대회',
      tournamentId: tournament.id,
      events: eventRows,
    });
    await AppSync.writeRawEvents({ rows: rawEvents });
```

위치: `await AppSync.writeTournamentEventLog(tournament.id, { events: eventRows });` 다음 줄.

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: pass

- [ ] **Step 4: 커밋**

```bash
git add src/components/tournament/TournamentMatchManager.jsx
git commit -m "축구 대회 match 저장 시 로그_이벤트 dual-write"
```

---

## Task 11: Apps Script `_importLegacyToRaw` — 풋살 포인트로그 변환

**Files:**
- Modify: `apps-script/Code.js`

**목적**: 기존 `포인트로그` 시트를 read-only로 조회해서 `로그_이벤트`로 변환·append (dedupe).

- [ ] **Step 1: 풋살 포인트로그 변환 함수 추가**

`apps-script/Code.js`의 `_writeRawPlayerGames` 함수 뒤에 추가:
```js
// ═══════════════════════════════════════════════════════════════
// 일회성 Legacy Import (기존 시트 read-only → 로그_이벤트/로그_선수경기 append)
// 재실행 가능하게 dedupe 적용됨 (기존 키 있으면 skip).
// 수동 실행: 편집기에서 _importLegacyToRaw() 실행.
// ═══════════════════════════════════════════════════════════════

function _importFutsalPointLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(POINT_LOG_SHEET);
  if (!src) return { rows: [], skipped: 0, error: POINT_LOG_SHEET + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [], skipped: 0 };
  // 컬럼: [경기일자, 경기번호, 내팀, 상대팀, 득점선수, 어시선수, 자책골, 실점키퍼명, 입력시간, 팀이름]
  var data = src.getRange(2, 1, lastRow - 1, 10).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var team = String(r[9] || "");
    var gameDate = _toDateStr(r[0]);
    var matchId = String(r[1] || "");
    var myTeam = String(r[2] || "");
    var opponent = String(r[3] || "");
    var scorer = String(r[4] || "");
    var assist = String(r[5] || "");
    var ownGoal = String(r[6] || "");
    var concedingGk = String(r[7] || "");
    var inputTime = r[8] instanceof Date ? Utilities.formatDate(r[8], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[8] || "");
    var common = { team: team, sport: "풋살", mode: "기본", tournament_id: "",
      date: gameDate, match_id: matchId, our_team: myTeam, opponent: opponent,
      position: "", input_time: inputTime };
    if (scorer) rows.push(Object.assign({}, common, { event_type: "goal", player: scorer, related_player: assist }));
    else if (ownGoal) rows.push(Object.assign({}, common, { event_type: "ownGoal", player: ownGoal, related_player: "" }));
    else if (concedingGk) rows.push(Object.assign({}, common, { event_type: "concede", player: concedingGk, related_player: "" }));
  }
  return { rows: rows };
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps-script/Code.js
git commit -m "import: 풋살 포인트로그 → 로그_이벤트 변환"
```

---

## Task 12: Apps Script import — 풋살 선수별집계 변환

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: 변환 함수 추가**

`_importFutsalPointLog` 바로 뒤에:
```js
function _importFutsalPlayerLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(PLAYER_LOG_SHEET);
  if (!src) return { rows: [], skipped: 0, error: PLAYER_LOG_SHEET + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  // 컬럼: [경기일자, 선수명, 골, 어시, 역주행, 실점, 클린시트, 크로바, 고구마, 키퍼경기수, 팀순위점수, 입력시간, 소속팀]
  var data = src.getRange(2, 1, lastRow - 1, 13).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var team = String(r[12] || "");
    var gameDate = _toDateStr(r[0]);
    var name = String(r[1] || "");
    if (!name) continue;
    var inputTime = r[11] instanceof Date ? Utilities.formatDate(r[11], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[11] || "");
    rows.push({
      team: team, sport: "풋살", mode: "기본", tournament_id: "",
      date: gameDate, player: name, session_team: "",
      games: 0, field_games: 0, keeper_games: Number(r[9]) || 0,
      goals: Number(r[2]) || 0, assists: Number(r[3]) || 0,
      owngoals: 0, conceded: Number(r[5]) || 0, cleansheets: Number(r[6]) || 0,
      crova: Number(r[7]) || 0, goguma: Number(r[8]) || 0,
      "역주행": Number(r[4]) || 0, rank_score: Number(r[10]) || 0,
      input_time: inputTime,
    });
  }
  return { rows: rows };
}
```

**주의**: 풋살 legacy 포인트 체계에서는 "자책골"이 별도 컬럼이 아니라 점수 반영된 형태라 `owngoals: 0`으로 맵 (원본에 raw count 정보 없음). 신규 기록분은 dual-write로 정확히 0/1 이 쌓임.

- [ ] **Step 2: 커밋**

```bash
git add apps-script/Code.js
git commit -m "import: 풋살 선수별집계 → 로그_선수경기 변환"
```

---

## Task 13: Apps Script import — 축구 이벤트로그 + 선수별집계 변환

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: 변환 함수 2종 추가**

```js
function _importSoccerEventLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName("축구_이벤트로그");
  if (!src) return { rows: [], error: "축구_이벤트로그 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  // 컬럼: [경기일자, 경기번호, 상대팀명, 이벤트, 선수, 관련선수, 포지션, 입력시간]
  var data = src.getRange(2, 1, lastRow - 1, 8).getValues();
  var rows = [];
  var team = "";
  try { team = _getTeamContextFromSheetName() || ""; } catch (e) {}
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var eventKor = String(r[3] || "");
    var typeMap = { "출전": "lineup", "골": "goal", "자책골": "ownGoal", "실점": "concede", "교체": "sub" };
    var eventType = typeMap[eventKor];
    if (!eventType) continue;
    var gameDate = _toDateStr(r[0]);
    var inputTime = r[7] instanceof Date ? Utilities.formatDate(r[7], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[7] || "");
    rows.push({
      team: team || String(r[2] || ""), // 팀 컨텍스트 없으면 opponent를 placeholder로는 쓰면 안됨 — 빈 처리
      sport: "축구", mode: "기본", tournament_id: "",
      date: gameDate, match_id: String(r[1] || ""),
      our_team: team || "", opponent: String(r[2] || ""),
      event_type: eventType, player: String(r[4] || ""), related_player: String(r[5] || ""),
      position: String(r[6] || ""), input_time: inputTime,
    });
  }
  return { rows: rows };
}

// 현재 스프레드시트에서 축구 팀명 추정: 간단히 빈 문자열 반환 → import 시 수동 입력 요구
function _getTeamContextFromSheetName() { return ""; }

function _importSoccerPlayerLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName("축구_선수별집계기록로그");
  if (!src) return { rows: [], error: "축구_선수별집계기록로그 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  // 컬럼: [경기일자, 선수명, 전체경기, 필드경기, 키퍼경기, 골, 어시, 클린시트, 실점, 자책골, 입력시간]
  var data = src.getRange(2, 1, lastRow - 1, 11).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var name = String(r[1] || "");
    if (!name) continue;
    var gameDate = _toDateStr(r[0]);
    var inputTime = r[10] instanceof Date ? Utilities.formatDate(r[10], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[10] || "");
    rows.push({
      team: "",  // 축구 기본 선수별집계는 팀 컬럼 없음. 수동 후처리 필요.
      sport: "축구", mode: "기본", tournament_id: "",
      date: gameDate, player: name, session_team: "",
      games: Number(r[2]) || 0, field_games: Number(r[3]) || 0, keeper_games: Number(r[4]) || 0,
      goals: Number(r[5]) || 0, assists: Number(r[6]) || 0,
      owngoals: Number(r[9]) || 0, conceded: Number(r[8]) || 0, cleansheets: Number(r[7]) || 0,
      crova: 0, goguma: 0, "역주행": 0, rank_score: 0, input_time: inputTime,
    });
  }
  return { rows: rows };
}
```

**주의**: 축구 legacy 시트엔 `team` 컬럼이 없어 변환 시 빈 문자열로 들어간다. import 후 `로그_이벤트`/`로그_선수경기`에서 빈 `team`은 수동 보정 필요 — 리포트에 명시.

- [ ] **Step 2: 커밋**

```bash
git add apps-script/Code.js
git commit -m "import: 축구 이벤트로그/선수별집계 → 신규 시트 변환"
```

---

## Task 14: Apps Script import — 대회 이벤트로그 변환 + 래퍼

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: 대회 이벤트 변환 함수**

```js
function _importTournamentEventLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var rows = [];
  var errors = [];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    var m = name.match(/^대회_(.+)_이벤트로그$/);
    if (!m) continue;
    var tid = m[1];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    // 컬럼: [경기번호, 상대팀, 이벤트, 선수, 관련선수, 포지션, 입력시간]
    var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var typeMap = { "출전": "lineup", "골": "goal", "자책골": "ownGoal", "실점": "concede", "교체": "sub" };
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      var eventType = typeMap[String(r[2] || "")];
      if (!eventType) continue;
      var inputTime = r[6] instanceof Date ? Utilities.formatDate(r[6], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[6] || "");
      // 대회 시트엔 date 컬럼 없음 → inputTime 앞부분을 date로 사용 (YYYY-MM-DD 추출)
      var date = "";
      var dm = inputTime.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dm) date = dm[1];
      rows.push({
        team: "", sport: "축구", mode: "대회", tournament_id: tid,
        date: date, match_id: String(r[0] || ""),
        our_team: "", opponent: String(r[1] || ""),
        event_type: eventType, player: String(r[3] || ""), related_player: String(r[4] || ""),
        position: String(r[5] || ""), input_time: inputTime,
      });
    }
  }
  return { rows: rows, errors: errors };
}
```

**주의**: 대회 이벤트로그는 `date` 컬럼이 없어 `input_time`에서 `YYYY-MM-DD` 부분을 추출. 형식이 다르면 빈 date. `team`도 비어있음.

- [ ] **Step 2: 통합 래퍼 함수**

```js
/**
 * 수동 실행: Apps Script 편집기에서 `_importLegacyToRaw` 선택 후 실행.
 * 결과 리포트 반환: 각 소스별 총 행수 / 실제 insert / skipped.
 */
function _importLegacyToRaw() {
  _ensureRawSheets();
  var result = { insertedEvents: 0, insertedPlayerGames: 0, skippedEvents: 0, skippedPlayerGames: 0, sources: {} };

  var sources = [
    { name: "풋살 포인트로그", kind: "events", fn: _importFutsalPointLog },
    { name: "풋살 선수별집계", kind: "playerGames", fn: _importFutsalPlayerLog },
    { name: "축구 이벤트로그", kind: "events", fn: _importSoccerEventLog },
    { name: "축구 선수별집계", kind: "playerGames", fn: _importSoccerPlayerLog },
    { name: "대회 이벤트로그", kind: "events", fn: _importTournamentEventLogs },
  ];

  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    var data;
    try { data = src.fn(); } catch (e) { result.sources[src.name] = { error: e.message }; continue; }
    var rows = data.rows || [];
    if (rows.length === 0) { result.sources[src.name] = { inserted: 0, skipped: 0, note: data.error || "빈 소스" }; continue; }
    var writeResult = src.kind === "events"
      ? _writeRawEvents({ rows: rows })
      : _writeRawPlayerGames({ rows: rows });
    result.sources[src.name] = { inserted: writeResult.count || 0, skipped: writeResult.skipped || 0 };
    if (src.kind === "events") { result.insertedEvents += writeResult.count || 0; result.skippedEvents += writeResult.skipped || 0; }
    else { result.insertedPlayerGames += writeResult.count || 0; result.skippedPlayerGames += writeResult.skipped || 0; }
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
```

- [ ] **Step 3: 커밋**

```bash
git add apps-script/Code.js
git commit -m "import: 대회 이벤트로그 + _importLegacyToRaw 래퍼"
```

- [ ] **Step 4 (사용자 수동): Apps Script 재배포**

사용자가 Apps Script 편집기에서 새 버전 배포.

---

## Task 15: 수동 QA (통합 검증)

**Files:** 없음 (수동 검증)

Apps Script 재배포 완료 후, 각 종목에서 dual-write와 import를 검증.

- [ ] **Step 1: 시트 초기화 확인**

Apps Script 편집기에서 `_ensureRawSheets()` 수동 실행 → 스프레드시트에 `로그_이벤트`, `로그_선수경기` 2개 시트가 헤더와 함께 생성되는지 확인.

- [ ] **Step 2: 풋살 dual-write 검증**

1. 웹앱에서 마스터FC 풋살 세션을 저장 (테스트용 최소 1경기)
2. 기존 `포인트로그`·`선수별집계기록로그` → 정상 append 확인
3. 신규 `로그_이벤트`·`로그_선수경기` → 같은 세션 데이터가 `sport='풋살'`, `mode='기본'`, `team='마스터FC'`로 추가되었는지 확인
4. 알림 메시지에 `로그_이벤트: N건`, `로그_선수경기: M명`이 표시되는지 확인

- [ ] **Step 3: 축구 기본 dual-write 검증**

1. 하버FC 축구 기본 세션 저장
2. 기존 `축구_이벤트로그`·`축구_포인트로그`·`축구_선수별집계기록로그` 정상 append 확인
3. `로그_이벤트`에 `sport='축구'`, `mode='기본'`으로 같은 이벤트 N건 추가
4. `로그_선수경기`에 `sport='축구'`, `mode='기본'`으로 선수별 row 추가

- [ ] **Step 4: 축구 대회 dual-write 검증**

1. 대회 모드에서 경기 1건 확정
2. 기존 `대회_{id}_이벤트로그` 정상 append
3. `로그_이벤트`에 `sport='축구'`, `mode='대회'`, `tournament_id={id}`로 이벤트 추가
4. `로그_선수경기`는 **추가되지 않아야 함** (대회는 범위 외)

- [ ] **Step 5: 일회성 import 실행**

1. Apps Script 편집기에서 `_importLegacyToRaw()` 실행
2. 실행 로그(Logger) 확인 → 각 소스별 inserted/skipped 리포트
3. `로그_이벤트` 총 row 수 = (풋살 포인트로그 이벤트 수 + 축구 이벤트로그 row 수 + 대회 이벤트로그 row 수) 근사 확인
4. `로그_선수경기` 총 row 수 = (풋살 선수별집계 row 수 + 축구 선수별집계 row 수) 근사 확인
5. 재실행 → 모두 skipped로 처리되고 insert 없음 확인 (dedupe 작동)

- [ ] **Step 6: 축구 import의 team 빈값 수동 보정**

축구 관련 import된 row들은 `team`이 빈값. Sheets 필터/정렬로 빈 team row를 찾아 하버FC 등 실제 팀명으로 수동 일괄 편집. 이는 1회성 작업.

- [ ] **Step 7: 대시보드·선수분석 영향 없음 확인**

기존 탭들 정상 동작 (기존 시트 기반 읽기 유지) — 선수분석·대시보드·축구 대시보드 모두 탭 열어서 오류/빈 상태 없는지 확인.

- [ ] **Step 8: 최종 커밋 (필요 시)**

수정 사항 없으면 커밋 없음. QA 중 발견한 버그만 hotfix 커밋.

---

## 자체 리뷰

**1. Spec 커버리지**:
- 스펙 §4.1 `로그_이벤트` 스키마 → Task 1, 7 (컬럼 상수 + 헤더)
- 스펙 §4.2 `로그_선수경기` 스키마 → Task 1, 7
- 스펙 §4.3 dedupe 키 → Task 7 (`_rawEventKey`, `_rawPlayerGameKey`)
- 스펙 §5.1 풋살 row 생성 → Task 2, 3
- 스펙 §5.2 축구 기본 row 생성 → Task 4, 5
- 스펙 §5.3 축구 대회 row 생성 (이벤트만) → Task 4 (공용 빌더), Task 10 (통합)
- 스펙 §6 dual-write + `Promise.allSettled` → Task 8, 9, 10
- 스펙 §8 일회성 import → Task 11, 12, 13, 14
- 스펙 §9 롤아웃 순서 → 이 plan의 task 순서가 대응
- 스펙 §10 Apps Script 인터페이스 → Task 7 (`_writeRawEvents`, `_writeRawPlayerGames`, `_ensureRawSheets`), Task 14 (`_importLegacyToRaw`)

**Gap**: 스펙 §5.3에서 "대회 선수집계도 per-date append"를 제안했으나 append-only와 증분 집계가 충돌. Plan 맨 앞의 **Scope 주의**에 명시하고 Task 10에서 `로그_선수경기`를 쓰지 않도록 명시.

**2. Placeholder 스캔**: 검토 완료, TBD/추정 없음. "수동 보정 필요" 표현은 사용자 작업 명시로 의도적.

**3. Type 일관성**:
- `RAW_EVENT_COLUMNS` 13개, `RAW_PLAYER_GAME_COLUMNS` 20개 — Apps Script 헤더(13/20개)와 정확히 일치
- `event_type` enum 값(`goal`/`ownGoal`/`concede`/`lineup`/`sub`) — 빌더와 import 모두 동일 매핑 사용
- `mode` enum(`'기본'`/`'대회'`) — 전 task 일관
- `sport` enum(`'풋살'`/`'축구'`) — 전 task 일관
- dedupe key 컬럼 조합 — `_writeRawEvents`와 `_loadRawEventKeys` 일치 (team, sport, mode, tid, date, match_id, event_type, player, related_player, input_time)

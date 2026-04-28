# 로그_이벤트 스키마 통합 (골+실점키퍼 한 행) 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그_이벤트의 goal/owngoal/concede 분리 행 구조를 폐기하고, 한 행 = 한 득점 사건(득점자+어시+실점키퍼 동시 보유) 형태로 되돌려 골–키퍼 매핑을 복원한다.

**Architecture:** 마스터FC 포인트 로그(진실 소스)와 동형으로 로그_이벤트를 미러링한다. 새 컬럼 `concede_gk`를 추가하고 goal/owngoal 행에 실점 GK를 함께 기록한다. concede 단독 행은 폐기한다. apps-script 변환 로직, 클라이언트 빌더, gameRecordBuilder, 테스트를 모두 새 스키마로 전환한 뒤, 모든 팀의 포인트 로그(`마스터FC 포인트 로그`, `하버FC 포인트 로그`, 축구팀 포인트 로그) 를 재집계해 로그_이벤트 전체 행을 새 스키마로 재작성한다.

**Tech Stack:** Google Apps Script (V8), JavaScript (ESM, Vite, React), Vitest, node fetch (migration scripts)

---

## 결정된 신규 스키마

```
team, sport, mode, tournament_id,
date, match_id, our_team, opponent,
event_type, player, related_player, concede_gk, position,
input_time, game_id
```

기존 대비 변경점: `concede_gk` 컬럼 1개 추가 (`related_player`와 `position` 사이).

| 사례 | event_type | player | related_player | concede_gk |
|------|------------|--------|----------------|------------|
| 우리팀 정상 골 | `goal` | 득점자 | 어시 (선택) | 상대팀 GK |
| 상대팀 정상 골 (포인트로그에 한 행으로 기록됨) | `goal` | 상대 득점자 | "" | 우리팀 GK |
| 자책골 | `owngoal` | 자책골 선수 | "" | 자책 측 GK |
| 단독 실점 (득점자 미상) | `concede` | GK | "" | (비움 — player와 동일) |
| 라인업/교체 (축구) | `lineup`/`sub` | 선수 | (대체 선수) | "" |

**핵심 규칙:** 풋살 포인트 로그 1 행 → 로그_이벤트 1 행 (지금은 1 행 → 최대 3 행). 단, `scorer == "" && ownGoal == "" && concedingGk != ""` 인 단독 실점만 별도 row 유지.

---

## File Structure

**Modify:**
- `apps-script/Code.js` — `RAW_EVENTS_HEADERS`, `_readFutsalPointSchema`, `_readSoccerPointSchema`, `_writeRawEvents`, `_rawEventKey`, `_rawEventToArray`, `_ensureEventLogHasGameId`(컬럼 폭 보정), CHANGELOG 갱신
- `src/utils/rawLogBuilders.js` — `RAW_EVENT_COLUMNS`, `buildRawEventsFromFutsal`, `buildRawEventsFromSoccer`
- `src/utils/gameRecordBuilder.js` — events 매핑 시 `concede_gk` 처리
- `src/utils/__tests__/rawLogBuilders.test.js` — 새 스키마 검증 케이스
- `src/utils/__tests__/gameRecordBuilder.test.js` — concede_gk 매핑 검증

**Create:**
- `scripts/migrate/reimportAllPointLogs.mjs` — 모든 팀(풋살+축구) 포인트 로그 → 로그_이벤트 전체 재집계 스크립트

**Apps Script 헬퍼 (이미 존재):** `_reimportFutsalPointForTeam`, `_reimportMasterFCFutsalPoint` — 본 plan에서는 변환 로직만 새 스키마로 갱신되면 자동으로 새 스키마로 재import 가능.

---

## Task 1: 신규 스키마 정의 및 apps-script 컬럼 헤더 변경

**Files:**
- Modify: `apps-script/Code.js:20-25` (`RAW_EVENTS_HEADERS`)
- Modify: `apps-script/Code.js:5` (CHANGELOG)
- Modify: `apps-script/Code.js` (`_writeRawEvents`, `_rawEventKey`, `_rawEventToArray`)

- [ ] **Step 1: CHANGELOG 항목 추가**

`apps-script/Code.js` 최상단 CHANGELOG 블록 가장 위에 추가:

```js
// 2026-04-28: 로그_이벤트 스키마 변경 — concede_gk 컬럼 추가, goal/owngoal 행에 실점 GK 통합 기록
```

- [ ] **Step 2: `RAW_EVENTS_HEADERS` 변경**

기존 (line 20-25):
```js
var RAW_EVENTS_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","match_id","our_team","opponent",
  "event_type","player","related_player","position",
  "input_time","game_id"
];
```

변경 후:
```js
var RAW_EVENTS_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","match_id","our_team","opponent",
  "event_type","player","related_player","concede_gk","position",
  "input_time","game_id"
];
```

- [ ] **Step 3: `_rawEventToArray` 갱신**

기존 (line 937 부근):
```js
function _rawEventToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.match_id||"", r.our_team||"", r.opponent||"",
    r.event_type||"", r.player||"", r.related_player||"", r.position||"",
    r.input_time||"", r.game_id||""];
}
```

변경 후 (concede_gk 삽입):
```js
function _rawEventToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.match_id||"", r.our_team||"", r.opponent||"",
    r.event_type||"", r.player||"", r.related_player||"", r.concede_gk||"", r.position||"",
    r.input_time||"", r.game_id||""];
}
```

- [ ] **Step 4: `_rawEventKey` 갱신 (dedupe 키에 concede_gk 포함)**

기존 (line 932):
```js
function _rawEventKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.match_id||"",
    r.event_type||"", r.player||"", r.related_player||"", r.input_time||"", r.game_id||""].join("|");
}
```

변경 후:
```js
function _rawEventKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.match_id||"",
    r.event_type||"", r.player||"", r.related_player||"", r.concede_gk||"", r.input_time||"", r.game_id||""].join("|");
}
```

- [ ] **Step 5: `_loadRawEventKeys` (헤더 인덱스 의존 시) 갱신 확인**

기존 코드를 검토. concede_gk 인덱스가 추가되어야 한다면 동일하게 키에 포함. (이미 `_rawEventKey`로 통일된 경우 skip)

- [ ] **Step 6: `_ensureEventLogHasGameId` 가 새 컬럼 폭(15)을 채우도록 확인**

기존 함수가 game_id 컬럼만 보장한다면, concede_gk도 보장하도록 변경. 함수 본문을 읽어 분기 추가:

```js
// 기존 컬럼 갯수가 RAW_EVENTS_HEADERS.length 보다 작으면 헤더 다시 씀
if (sheet.getLastColumn() < RAW_EVENTS_HEADERS.length) {
  sheet.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setValues([RAW_EVENTS_HEADERS]);
}
```

- [ ] **Step 7: 커밋**

```bash
git add apps-script/Code.js
git commit -m "feat: 로그_이벤트 RAW_EVENTS_HEADERS에 concede_gk 컬럼 추가"
```

---

## Task 2: apps-script `_readFutsalPointSchema` — 한 행 = 한 사건으로 변환

**Files:**
- Modify: `apps-script/Code.js:1334-1419` (`_readFutsalPointSchema`)

- [ ] **Step 1: 변환 로직 재작성**

`_readFutsalPointSchema` 의 for 루프 안 (line 1369-1417) 를 다음으로 교체:

```js
for (var i = 0; i < data.length; i++) {
  var r = data[i];
  var gameDate = _toDateStr(r[0]);
  var matchId = String(r[1] || "");
  var myTeam = String(r[2] || "");
  var opponent = String(r[3] || "");
  var scorer = String(r[4] || "");
  var assist = String(r[5] || "");
  var ownGoal = String(r[6] || "");
  var concedingGk = String(r[7] || "");
  var inputTime = r[8] instanceof Date ? Utilities.formatDate(r[8], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[8] || "");
  var common = {
    team: team, sport: "풋살", mode: "기본", tournament_id: "",
    date: gameDate, match_id: matchId, our_team: myTeam, opponent: opponent,
    position: "", input_time: inputTime
  };
  // 한 포인트로그 행 → 한 로그_이벤트 행 (concede_gk 컬럼에 실점 키퍼 통합)
  if (scorer) {
    rows.push({
      team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
      date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
      position: common.position, input_time: common.input_time,
      event_type: "goal", player: scorer, related_player: assist, concede_gk: concedingGk
    });
  } else if (ownGoal) {
    rows.push({
      team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
      date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
      position: common.position, input_time: common.input_time,
      event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: concedingGk
    });
  } else if (concedingGk) {
    // 단독 실점 (득점자 미상) — 드물지만 보존
    rows.push({
      team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
      date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
      position: common.position, input_time: common.input_time,
      event_type: "concede", player: concedingGk, related_player: "", concede_gk: concedingGk
    });
  }
}
```

기존의 `our_team/opponent` 스왑 로직 제거 (한 행에 양 팀 정보가 모두 있고 concede_gk로 키퍼 식별 가능하므로 스왑 불필요).

- [ ] **Step 2: 커밋**

```bash
git add apps-script/Code.js
git commit -m "feat: _readFutsalPointSchema 한 행=한 사건으로 변환 (concede_gk 통합)"
```

---

## Task 3: apps-script `_readSoccerPointSchema` — 동일 형태로 통합

**Files:**
- Modify: `apps-script/Code.js:1460-1526` (`_readSoccerPointSchema`)

- [ ] **Step 1: 변환 로직 재작성**

기존 분기 (line 1494-1523) 를 다음으로 교체:

```js
if (goalVal === "OG") {
  rows.push({
    team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
    date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
    position: common.position, input_time: common.input_time,
    event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: ""
  });
} else if (goalVal) {
  rows.push({
    team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
    date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
    position: common.position, input_time: common.input_time,
    event_type: "goal", player: goalVal, related_player: assist, concede_gk: ""
  });
} else if (ownGoal) {
  rows.push({
    team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
    date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
    position: common.position, input_time: common.input_time,
    event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: ""
  });
} else if (concede) {
  rows.push({
    team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
    date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
    position: common.position, input_time: common.input_time,
    event_type: "concede", player: concede, related_player: "", concede_gk: concede
  });
}
```

(축구 포인트로그는 keeper 컬럼이 없어 concede_gk를 빈 값으로 둔다. 단독 실점만 concede_gk=실점 GK = player.)

**참고:** `_readFutsalPointSchema` 와 다르게 `event_type: "owngoal"` 로 통일 (현재는 `"ownGoal"` 카멜케이스로 저장되는 버그가 있음 — 이 기회에 정상화).

- [ ] **Step 2: `event_type` 표기 정상화 검증**

기존 `gameRecordBuilder.js:14` 의 `denormalizeEventType("owngoal")` 가 `"ownGoal"` 을 반환하므로 소비자 측은 영향 없음. 단, 기존 시트에 `"ownGoal"` 행이 있다면 데이터 일관성 위해 마이그레이션 시 lower-case로 통일.

- [ ] **Step 3: 커밋**

```bash
git add apps-script/Code.js
git commit -m "feat: _readSoccerPointSchema 통합 스키마로 변환 + event_type owngoal 정규화"
```

---

## Task 4: 클라이언트 `buildRawEventsFromFutsal` 새 스키마 출력

**Files:**
- Modify: `src/utils/rawLogBuilders.js:6-11` (`RAW_EVENT_COLUMNS`)
- Modify: `src/utils/rawLogBuilders.js:26-46` (`buildRawEventsFromFutsal`)
- Test: `src/utils/__tests__/rawLogBuilders.test.js`

- [ ] **Step 1: Failing test 추가 (rawLogBuilders.test.js)**

`describe('buildRawEventsFromFutsal')` 블록 끝에 추가:

```js
it('한 포인트 이벤트(scorer + concedingGk) → 한 로그_이벤트 행 (concede_gk 컬럼)', () => {
  const events = [{
    gameDate: '2026-04-28', matchId: 'R1_C0', myTeam: 'A', opponentTeam: 'B',
    scorer: '홍길동', assist: '김철수', ownGoalPlayer: '', concedingGk: '박GK',
    inputTime: '2026-04-28 10:00:00'
  }];
  const rows = buildRawEventsFromFutsal({ team: '마스터FC', gameId: 'g1', events });
  expect(rows).toHaveLength(1);
  expect(rows[0].event_type).toBe('goal');
  expect(rows[0].player).toBe('홍길동');
  expect(rows[0].related_player).toBe('김철수');
  expect(rows[0].concede_gk).toBe('박GK');
});

it('자책골 + concedingGk → 한 owngoal 행', () => {
  const events = [{
    gameDate: '2026-04-28', matchId: 'R1_C0', myTeam: 'A', opponentTeam: 'B',
    scorer: '', assist: '', ownGoalPlayer: '나자책', concedingGk: '나GK',
    inputTime: 't'
  }];
  const rows = buildRawEventsFromFutsal({ team: '마스터FC', events });
  expect(rows).toHaveLength(1);
  expect(rows[0].event_type).toBe('owngoal');
  expect(rows[0].player).toBe('나자책');
  expect(rows[0].concede_gk).toBe('나GK');
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/utils/__tests__/rawLogBuilders.test.js
```

Expected: 위 두 테스트 FAIL (현재는 2 행으로 분리되며 concede_gk 컬럼 없음).

- [ ] **Step 3: `RAW_EVENT_COLUMNS` 갱신**

`src/utils/rawLogBuilders.js:6-11` 변경:

```js
export const RAW_EVENT_COLUMNS = [
  "team", "sport", "mode", "tournament_id",
  "date", "match_id", "our_team", "opponent",
  "event_type", "player", "related_player", "concede_gk", "position",
  "input_time", "game_id",
];
```

- [ ] **Step 4: `buildRawEventsFromFutsal` 변경**

`src/utils/rawLogBuilders.js:26-46` 의 함수 본문 교체:

```js
export function buildRawEventsFromFutsal({ team, gameId = '', events }) {
  const out = [];
  (events || []).forEach(e => {
    const common = {
      team, sport: '풋살', mode: '기본', tournament_id: '',
      date: e.gameDate || '',
      match_id: normalizeMatchId(e.matchId || '', '풋살'),
      our_team: e.myTeam || '', opponent: e.opponentTeam || '',
      position: '', input_time: e.inputTime || '',
      game_id: gameId,
    };
    if (e.scorer) {
      out.push({ ...common, event_type: 'goal', player: e.scorer, related_player: e.assist || '', concede_gk: e.concedingGk || '' });
    } else if (e.ownGoalPlayer) {
      out.push({ ...common, event_type: 'owngoal', player: e.ownGoalPlayer, related_player: '', concede_gk: e.concedingGk || '' });
    } else if (e.concedingGk) {
      out.push({ ...common, event_type: 'concede', player: e.concedingGk, related_player: '', concede_gk: e.concedingGk });
    }
  });
  return out;
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run src/utils/__tests__/rawLogBuilders.test.js
```

Expected: 새 테스트 2건 + 기존 테스트 모두 PASS.

기존 테스트 중 `event_type: 'concede'` 검증 케이스가 있다면 (예: 셋 다 동시 입력 시 3행 발생 검증) 새 동작에 맞게 수정. 구체적으로 line 70-95 부근의 "scorer/owngoal/concedingGk 동시 발생" 케이스는 1행 출력으로 변경됨.

- [ ] **Step 6: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "feat: buildRawEventsFromFutsal 통합 스키마 + concede_gk 컬럼"
```

---

## Task 5: 클라이언트 `buildRawEventsFromSoccer` concede_gk 컬럼 채움

**Files:**
- Modify: `src/utils/rawLogBuilders.js:78-95` (`buildRawEventsFromSoccer`)
- Test: `src/utils/__tests__/rawLogBuilders.test.js`

- [ ] **Step 1: Failing test 추가**

```js
it('축구 실점 이벤트는 concede_gk = player 로 채움', () => {
  const events = [{ event: '실점', gameDate: '2026-04-28', matchNum: '1', player: '박GK', opponent: 'B', inputTime: 't' }];
  const rows = buildRawEventsFromSoccer({ team: 'X', events });
  expect(rows).toHaveLength(1);
  expect(rows[0].event_type).toBe('concede');
  expect(rows[0].player).toBe('박GK');
  expect(rows[0].concede_gk).toBe('박GK');
});

it('축구 일반 이벤트는 concede_gk 빈 값', () => {
  const events = [{ event: '골', gameDate: '2026-04-28', matchNum: '1', player: '홍', relatedPlayer: '김', opponent: 'B', inputTime: 't' }];
  const rows = buildRawEventsFromSoccer({ team: 'X', events });
  expect(rows[0].concede_gk).toBe('');
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/utils/__tests__/rawLogBuilders.test.js
```

- [ ] **Step 3: 함수 본문 변경**

`src/utils/rawLogBuilders.js:78-95`:

```js
export function buildRawEventsFromSoccer({ team, mode = '기본', tournamentId = '', gameId = '', events }) {
  const out = [];
  (events || []).forEach(e => {
    const type = SOCCER_EVENT_MAP[e.event];
    if (!type) return;
    out.push({
      team, sport: '축구', mode, tournament_id: tournamentId || '',
      date: e.gameDate || '',
      match_id: normalizeMatchId(String(e.matchNum ?? ''), '축구'),
      our_team: team, opponent: e.opponent || '',
      event_type: type,
      player: e.player || '', related_player: e.relatedPlayer || '',
      concede_gk: type === 'concede' ? (e.player || '') : '',
      position: e.position || '', input_time: e.inputTime || '',
      game_id: gameId,
    });
  });
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/utils/__tests__/rawLogBuilders.test.js
```

- [ ] **Step 5: 커밋**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "feat: buildRawEventsFromSoccer concede_gk 컬럼 추가"
```

---

## Task 6: `gameRecordBuilder` concede_gk 매핑 처리

**Files:**
- Modify: `src/utils/gameRecordBuilder.js:77-87`
- Test: `src/utils/__tests__/gameRecordBuilder.test.js`

분석 코드(`calc*` 함수들) 가 events 배열에서 `event_type: 'concede'` 를 별도 행으로 기대하므로, 신규 스키마에서는 goal 행에 concede_gk가 포함된다. gameRecordBuilder 가 이를 분해해서 events에 concede 항목을 합성하도록 변경한다.

- [ ] **Step 1: Failing test (gameRecordBuilder.test.js)**

```js
it('goal 행의 concede_gk → events에 concede 항목 합성', () => {
  const matchRows = [{
    game_id: 'g1', date: '2026-04-28', match_idx: 0, match_id: 'R1_C0',
    our_team_name: 'A', opponent_team_name: 'B',
    our_members_json: '["a1"]', opponent_members_json: '["b1"]',
    our_score: 1, opponent_score: 0, our_gk: 'aGK', opponent_gk: 'bGK',
  }];
  const eventRows = [{
    game_id: 'g1', date: '2026-04-28', match_id: 'R1_C0', our_team: 'A', opponent: 'B',
    event_type: 'goal', player: 'a1', related_player: '', concede_gk: 'bGK', input_time: 't',
  }];
  const records = buildGameRecordsFromLogs(matchRows, eventRows);
  expect(records).toHaveLength(1);
  const ev = records[0].events;
  expect(ev.find(e => e.type === 'goal' && e.player === 'a1')).toBeDefined();
  expect(ev.find(e => e.type === 'concede' && e.player === 'bGK')).toBeDefined();
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/utils/__tests__/gameRecordBuilder.test.js
```

- [ ] **Step 3: events 합성 로직 추가**

`src/utils/gameRecordBuilder.js:77-87` 의 for 루프를 다음으로 교체:

```js
for (const e of merged) {
  events.push({
    type: denormalizeEventType(e.event_type),
    matchId: m.match_id,
    player: e.player,
    assist: e.related_player || '',
    timestamp: e.input_time || '',
    scoringTeam: undefined,
    concedingTeam: undefined,
  });
  // 신규 스키마: goal/owngoal 행에 concede_gk 가 포함되면 별도 concede 항목 합성
  if ((e.event_type === 'goal' || e.event_type === 'owngoal') && e.concede_gk) {
    events.push({
      type: 'concede',
      matchId: m.match_id,
      player: e.concede_gk,
      assist: '',
      timestamp: e.input_time || '',
      scoringTeam: undefined,
      concedingTeam: undefined,
    });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/utils/__tests__/gameRecordBuilder.test.js
```

- [ ] **Step 5: 커밋**

```bash
git add src/utils/gameRecordBuilder.js src/utils/__tests__/gameRecordBuilder.test.js
git commit -m "feat: gameRecordBuilder concede_gk → concede 이벤트 합성"
```

---

## Task 7: 마이그레이션 스크립트 작성 (모든 팀 포인트로그 → 로그_이벤트 재집계)

**Files:**
- Create: `scripts/migrate/reimportAllPointLogs.mjs`

- [ ] **Step 1: 스크립트 작성**

```js
#!/usr/bin/env node
// 모든 팀 포인트 로그 → 로그_이벤트 전체 재집계 (신 스키마: concede_gk 컬럼 통합)
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/reimportAllPointLogs.mjs [--dry-run]

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) { console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');

// 재집계 대상: { team, sport, pointSheet }
const TARGETS = [
  { team: '마스터FC', sport: '풋살', pointSheet: '마스터FC 포인트 로그' },
  // 하버FC 등 추가 팀 발견 시 여기에 추가
  // { team: '하버FC', sport: '풋살', pointSheet: '하버FC 포인트 로그' },
];

async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }),
  });
  return r.json();
}

(async () => {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.team} (${t.sport}) ← ${t.pointSheet} ===`);
    if (DRY) {
      const pl = await call({ action: 'getPointLog', team: t.team, pointLogSheet: t.pointSheet });
      console.log(`  pointLog 행 수: ${(pl.events || []).length}`);
      continue;
    }
    // apps-script 의 _reimportFutsalPointForTeam 을 호출 (action 추가 필요 — Task 8)
    const res = await call({ action: 'reimportPointLog', team: t.team, sport: t.sport, pointSheet: t.pointSheet });
    console.log(`  ${JSON.stringify(res)}`);
  }
  console.log('\n완료.');
})();
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/migrate/reimportAllPointLogs.mjs
git commit -m "feat: 모든 팀 포인트로그 → 로그_이벤트 재집계 스크립트 추가"
```

---

## Task 8: apps-script `reimportPointLog` 액션 추가 (HTTP 노출)

**Files:**
- Modify: `apps-script/Code.js` (action handler + 새 함수)

기존 `_reimportFutsalPointForTeam` 은 Apps Script 편집기에서만 직접 실행 가능. HTTP 액션으로 노출해 마이그레이션 스크립트에서 호출.

- [ ] **Step 1: doPost 핸들러에 action 추가**

`apps-script/Code.js:272` 부근 `writeRawEvents` 핸들러 다음에 추가:

```js
} else if (action === "reimportPointLog") {
  return _jsonResponse(_reimportPointLog(body.team, body.sport, body.pointSheet));
```

- [ ] **Step 2: `_reimportPointLog` 디스패처 함수 추가**

`_reimportFutsalPointForTeam` 위에 추가:

```js
function _reimportPointLog(team, sport, pointSheet) {
  if (!team || !sport || !pointSheet) return { success: false, error: "team/sport/pointSheet 필요" };
  if (sport === "풋살") return _reimportFutsalPointForTeam(team, pointSheet);
  if (sport === "축구") return _reimportSoccerPointForTeam(team, pointSheet);
  return { success: false, error: "지원하지 않는 sport: " + sport };
}

function _reimportSoccerPointForTeam(team, pointSheet) {
  // _reimportFutsalPointForTeam 과 동일 패턴, 단 _readSoccerPointSchema 호출
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var lastRow = sheet.getLastRow();
    var deleted = 0;
    if (lastRow >= 2) {
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var teamCol = headers.indexOf("team");
      var sportCol = headers.indexOf("sport");
      if (teamCol < 0 || sportCol < 0) return { success: false, error: "team/sport 컬럼 없음" };
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var keep = [];
      for (var i = 0; i < data.length; i++) {
        var rowTeam = String(data[i][teamCol] || "").trim();
        var rowSport = String(data[i][sportCol] || "").trim();
        if (rowTeam === team && rowSport === "축구") { deleted++; continue; }
        keep.push(data[i]);
      }
      sheet.deleteRows(2, lastRow - 1);
      if (keep.length > 0) {
        sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
      }
    }

    var pointData = _readSoccerPointSchema(pointSheet, team);
    var rows = pointData.rows || [];
    if (pointData.error) return { success: false, deleted: deleted, error: pointData.error };

    var inserted = 0;
    if (rows.length > 0) {
      var write = _writeRawEvents({ rows: rows, skipDedupe: true });
      inserted = write.count || 0;
    }
    return { success: true, deleted: deleted, inserted: inserted };
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 3: CHANGELOG 갱신**

```js
// 2026-04-28: reimportPointLog 액션 추가 (HTTP 노출, 풋살/축구 디스패치)
```

- [ ] **Step 4: 커밋**

```bash
git add apps-script/Code.js
git commit -m "feat: reimportPointLog HTTP 액션 추가 (풋살/축구 디스패치)"
```

---

## Task 9: Apps Script 배포 + 마이그레이션 실행

**Files:** (배포만 — 코드 변경 없음)

- [ ] **Step 1: 사용자에게 Apps Script 배포 요청**

작업 메시지:

> apps-script/Code.js 변경 완료. 배포 관리 → 편집 → 새 버전 으로 반영 부탁드립니다.

- [ ] **Step 2: 사용자 승인 대기 (진실 소스 시트는 read-only이지만 로그_이벤트 전체 재작성이므로 경계)**

진실 소스(`마스터FC 포인트 로그` 등) 는 변경하지 않음. 로그_이벤트는 derived 시트라 자유 변경 가능 — 다만 전체 재작성이므로 사용자에게 사전 통보.

- [ ] **Step 3: Dry-run 실행**

```bash
APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/reimportAllPointLogs.mjs --dry-run
```

Expected: 각 팀 포인트로그 행 수 출력. 에러 없음.

- [ ] **Step 4: 실제 마이그레이션 실행**

```bash
APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/reimportAllPointLogs.mjs
```

Expected: `{ success: true, deleted: N, inserted: M }` 출력. 보통 inserted ≈ pointLog 행 수, deleted 는 기존 분리 행 수 (≈ inserted × 1.5~2 추정).

- [ ] **Step 5: 검증 스크립트 실행 (간단 체크)**

```bash
APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node -e '
(async () => {
  const r = await fetch(process.env.APPS_SCRIPT_URL + "?action=getRawEvents&team=마스터FC&sport=풋살&authToken=" + process.env.AUTH_TOKEN);
  const j = await r.json();
  const ev = j.events || [];
  const goalRows = ev.filter(e => e.event_type === "goal");
  const concedeRows = ev.filter(e => e.event_type === "concede");
  console.log("goal 행:", goalRows.length, "concede 행:", concedeRows.length);
  console.log("goal 행 중 concede_gk 채워진 행:", goalRows.filter(g => g.concede_gk).length);
  // pointLog와 비교
  const r2 = await fetch(process.env.APPS_SCRIPT_URL, { method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify({ action: "getPointLog", team: "마스터FC", pointLogSheet: "마스터FC 포인트 로그", authToken: process.env.AUTH_TOKEN }) });
  const j2 = await r2.json();
  console.log("pointLog 행:", (j2.events || []).length);
})();
'
```

Expected: 로그_이벤트 행 수 ≈ pointLog 행 수 (분리 사라졌으므로 1:1). goal 행의 대부분이 concede_gk 채워짐.

---

## Task 10: 클라이언트 dual-write 검증 (재배포 없이 자동 동작)

**Files:** (검증만)

신규 경기 종료 후 dual-write가 새 스키마로 잘 들어가는지 확인.

- [ ] **Step 1: Dev 서버 시동 + 신규 매치 시뮬레이션**

```bash
npm run dev
```

브라우저에서 마스터FC 임시 매치 입력 → 기록 확정.

- [ ] **Step 2: 시트에서 새 행 검증**

`로그_이벤트` 시트의 새 행에 `concede_gk` 컬럼이 채워졌는지, 동일 input_time의 분리 행이 없는지 확인.

- [ ] **Step 3: 커밋 (필요 시 fix)**

문제 발견 시 별도 fix 커밋. 정상이면 skip.

---

## Task 11: 사용자 보고 + 메모리 갱신

- [ ] **Step 1: 사용자에게 결과 보고**

> 로그_이벤트 스키마 통합 완료.
> - concede_gk 컬럼 추가, goal/owngoal 행에 실점 GK 통합 기록
> - 마스터FC 풋살: pointLog N행 → 로그_이벤트 N행 (이전 M행에서 정정)
> - 골–키퍼 매핑 복원

- [ ] **Step 2: 메모리 업데이트 (필요 시)**

`feedback_player_log_edit.md` 또는 신규 메모리에 "로그_이벤트는 한 행 = 한 사건 (concede_gk 컬럼 포함)" 기록.

---

## 검증 체크리스트 (전체 완료 시)

- [ ] vitest 전체 PASS (`npm test`)
- [ ] `로그_이벤트` 행 수 ≈ `마스터FC 포인트 로그` 행 수
- [ ] goal 행의 concede_gk 채워진 비율 ≥ 95% (pointLog의 입력 빈칸 제외)
- [ ] 신규 매치 dual-write가 concede_gk 포함해 새 스키마로 기록됨
- [ ] PlayerAnalytics 화면 — 골/어시/실점 통계 회귀 없음
- [ ] 분석 V2 (있다면) — 골–키퍼 매핑 신규 지표 활용 가능

---

## Self-Review

**Spec coverage:**
- ✅ apps-script 스키마 변경 (Task 1)
- ✅ 풋살 변환 로직 (Task 2)
- ✅ 축구 변환 로직 (Task 3)
- ✅ 클라이언트 빌더 풋살 (Task 4)
- ✅ 클라이언트 빌더 축구 (Task 5)
- ✅ 소비자 (gameRecordBuilder) 호환 (Task 6)
- ✅ 마이그레이션 스크립트 (Task 7-9)
- ✅ Dual-write 검증 (Task 10)

**Placeholder scan:** 모든 step에 코드 또는 명확한 명령 포함. TBD/TODO 없음.

**Type consistency:** `concede_gk` 명칭 전체 통일. `RAW_EVENTS_HEADERS` (apps-script) ↔ `RAW_EVENT_COLUMNS` (client) 동일 순서.

**리스크:**
- 기존 분리 행을 보존하는 분석 코드가 더 있을 수 있음 — Task 6 외에 `event_type === 'concede'` 검색 필요. 발견 시 보조 task로 처리.
- Dedupe 키 변경 — 같은 행을 다시 쓸 때 새 키와 기존 키 충돌 → 마이그레이션이 _reimport (전체 삭제 후 재작성) 라 문제 없음.

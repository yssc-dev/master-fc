# 로그 소스 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 분석 데이터 소스를 Firebase stateJSON 의존에서 벗어나 `로그_매치` + `로그_이벤트` + `로그_선수경기` 3개 시트 단일 소스로 통합한다.

**Architecture:** 라운드 단위 원자 정보를 담는 신규 `로그_매치` 시트를 도입하고, `로그_이벤트`에 `game_id` 컬럼과 event_type/match_id 표준화를 더한다. 앱 측에 정규화 유틸과 GameRecord 빌더를 신설해 기존 계산 함수 재사용. Migration은 3단계: legacy 근사 복원 → Firebase 3일치 정확 덮어쓰기 → 이후 자동.

**Tech Stack:** React 19 / Vite / Vitest, Google Apps Script (Sheets 백엔드), Firebase Realtime Database (앱 런타임 상태만 유지), Node 스크립트 (migration).

**Spec:** `docs/superpowers/specs/2026-04-21-log-source-unification-design.md`

---

## File Structure

### 신규 파일

| 파일 | 역할 |
|---|---|
| `src/utils/matchIdNormalizer.js` | `normalizeMatchId` / `buildStandardMatchId` 순수 함수 |
| `src/utils/matchRowBuilder.js` | `buildRoundRows(stateJSON)` — 풋살/축구 stateJSON → 로그_매치 rows |
| `src/utils/gameRecordBuilder.js` | `buildGameRecordsFromLogs(matchRows, eventRows)` — 시트 rows → GameRecord[] |
| `src/utils/__tests__/matchIdNormalizer.test.js` | 유닛 테스트 |
| `src/utils/__tests__/matchRowBuilder.test.js` | 유닛 테스트 |
| `src/utils/__tests__/gameRecordBuilder.test.js` | 유닛 테스트 |
| `scripts/migrate/backfillMatchLog.mjs` | 로컬 Node migration 스크립트 |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/utils/rawLogBuilders.js` | `RAW_EVENT_COLUMNS`에 `game_id` 추가, event_type 표준화, match_id 정규화 |
| `src/utils/__tests__/rawLogBuilders.test.js` | 위 변경 반영 |
| `src/services/appSync.js` | `getMatchLog`, `writeMatchLog` 추가 |
| `src/App.jsx` | 풋살 확정 시 matchLog 동시 기록 |
| `src/SoccerApp.jsx` | 축구 확정 시 matchLog 동시 기록 + `gameId` 부여 |
| `src/components/dashboard/PlayerAnalytics.jsx` | Firebase 제거, 시트 소스 사용, 축구 탭 조정 |
| `apps-script/Code.js` | `로그_매치` 시트, 신규/수정 함수들 |

---

## Task 1: match_id 정규화 유틸 신설

**Files:**
- Create: `src/utils/matchIdNormalizer.js`
- Test: `src/utils/__tests__/matchIdNormalizer.test.js`

- [ ] **Step 1: Write failing tests**

`src/utils/__tests__/matchIdNormalizer.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { normalizeMatchId, buildStandardMatchId } from '../matchIdNormalizer';

describe('normalizeMatchId', () => {
  it('이미 표준 풋살 포맷 R{n}_C{n}은 그대로 반환', () => {
    expect(normalizeMatchId('R3_C0', '풋살')).toBe('R3_C0');
    expect(normalizeMatchId('R12_C1', '풋살')).toBe('R12_C1');
  });

  it('"N라운드 매치M" → R{N}_C{M-1}', () => {
    expect(normalizeMatchId('3라운드 매치1', '풋살')).toBe('R3_C0');
    expect(normalizeMatchId('1라운드 매치2', '풋살')).toBe('R1_C1');
    expect(normalizeMatchId('10라운드 매치1', '풋살')).toBe('R10_C0');
  });

  it('풋살 "N경기" → R{N}_C0 (단일 코트 가정)', () => {
    expect(normalizeMatchId('3경기', '풋살')).toBe('R3_C0');
    expect(normalizeMatchId('12경기', '풋살')).toBe('R12_C0');
  });

  it('풋살 순수 숫자 → R{N}_C0', () => {
    expect(normalizeMatchId('5', '풋살')).toBe('R5_C0');
  });

  it('축구 "N경기" → "{N}" 숫자 문자열', () => {
    expect(normalizeMatchId('3경기', '축구')).toBe('3');
    expect(normalizeMatchId('1경기', '축구')).toBe('1');
  });

  it('축구 순수 숫자는 그대로 문자열', () => {
    expect(normalizeMatchId('5', '축구')).toBe('5');
  });

  it('빈 값은 빈 값 그대로', () => {
    expect(normalizeMatchId('', '풋살')).toBe('');
    expect(normalizeMatchId(null, '풋살')).toBe(null);
    expect(normalizeMatchId(undefined, '축구')).toBe(undefined);
  });

  it('인식 불가 포맷은 원본 그대로 반환', () => {
    expect(normalizeMatchId('이상한값', '풋살')).toBe('이상한값');
    expect(normalizeMatchId('friendly-match-A', '축구')).toBe('friendly-match-A');
  });
});

describe('buildStandardMatchId', () => {
  it('풋살: R{round_idx}_C{court_id}', () => {
    expect(buildStandardMatchId({ sport: '풋살', round_idx: 3, court_id: 0 })).toBe('R3_C0');
    expect(buildStandardMatchId({ sport: '풋살', round_idx: 5, court_id: 1 })).toBe('R5_C1');
  });

  it('풋살 court_id 미지정 시 C0 기본값', () => {
    expect(buildStandardMatchId({ sport: '풋살', round_idx: 2 })).toBe('R2_C0');
  });

  it('축구: String(match_idx)', () => {
    expect(buildStandardMatchId({ sport: '축구', match_idx: 3 })).toBe('3');
    expect(buildStandardMatchId({ sport: '축구', match_idx: 1 })).toBe('1');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- matchIdNormalizer`
Expected: FAIL with "Cannot find module '../matchIdNormalizer'"

- [ ] **Step 3: Create `src/utils/matchIdNormalizer.js`**

```javascript
// match_id 포맷 정규화 + 표준 match_id 생성
// 풋살 표준: R{round_idx}_C{court_id} (court 0-indexed)
// 축구 표준: String(match_idx) (1부터 시작)

export function normalizeMatchId(raw, sport) {
  if (raw === null || raw === undefined || raw === '') return raw;
  const s = String(raw).trim();

  if (/^R\d+_C\d+$/.test(s)) return s;

  const m1 = s.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m1) return `R${m1[1]}_C${parseInt(m1[2], 10) - 1}`;

  const m2 = s.match(/^(\d+)경기$/);
  const n = m2 ? m2[1] : (/^\d+$/.test(s) ? s : null);
  if (n !== null) {
    return sport === '풋살' ? `R${n}_C0` : n;
  }

  return s;
}

export function buildStandardMatchId({ sport, round_idx, court_id, match_idx }) {
  if (sport === '풋살') return `R${round_idx}_C${court_id ?? 0}`;
  return String(match_idx);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- matchIdNormalizer`
Expected: PASS all

- [ ] **Step 5: Commit**

```bash
git add src/utils/matchIdNormalizer.js src/utils/__tests__/matchIdNormalizer.test.js
git commit -m "feat: match_id 정규화 유틸 추가 (normalizeMatchId, buildStandardMatchId)"
```

---

## Task 2: `rawLogBuilders.js`에 `game_id` + event_type 표준화 반영

**Files:**
- Modify: `src/utils/rawLogBuilders.js:4-9` (RAW_EVENT_COLUMNS), `:25-43` (Futsal), `:66-93` (Soccer)
- Modify: `src/utils/__tests__/rawLogBuilders.test.js`

- [ ] **Step 1: Extend existing tests**

In `src/utils/__tests__/rawLogBuilders.test.js`, add these tests after existing describe blocks:

```javascript
describe('RAW_EVENT_COLUMNS with game_id', () => {
  it('game_id 포함, 총 14개 컬럼', () => {
    expect(RAW_EVENT_COLUMNS).toHaveLength(14);
    expect(RAW_EVENT_COLUMNS).toContain('game_id');
    expect(RAW_EVENT_COLUMNS.indexOf('game_id')).toBe(13); // 맨 뒤
  });
});

describe('buildRawEventsFromFutsal event_type 표준화 + game_id', () => {
  it('ownGoal → owngoal 표준값 사용, game_id 포함', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      gameId: 'g_1713000000000',
      events: [{
        gameDate: '2026-04-10', matchId: 'R1_C0',
        myTeam: '블루', opponentTeam: '레드',
        ownGoalPlayer: '홍길동', inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows[0].event_type).toBe('owngoal');
    expect(rows[0].game_id).toBe('g_1713000000000');
  });

  it('match_id 이미 표준 포맷이면 그대로 유지', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      gameId: 'g_1',
      events: [{
        gameDate: '2026-04-10', matchId: '3라운드 매치1',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '홍길동', inputTime: '',
      }],
    });
    expect(rows[0].match_id).toBe('R3_C0'); // 정규화됨
  });
});

describe('buildRawEventsFromSoccer event_type 표준화 + game_id', () => {
  it('자책골 → owngoal, 실점 → concede', () => {
    const rows = buildRawEventsFromSoccer({
      team: 'FC테스트',
      gameId: 's_1713000000000',
      events: [
        { event: '자책골', player: 'A', gameDate: '2026-04-10', matchNum: 1, inputTime: '' },
        { event: '실점', player: 'B', gameDate: '2026-04-10', matchNum: 1, inputTime: '' },
      ],
    });
    expect(rows[0].event_type).toBe('owngoal');
    expect(rows[1].event_type).toBe('concede');
    expect(rows[0].game_id).toBe('s_1713000000000');
    expect(rows[1].game_id).toBe('s_1713000000000');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- rawLogBuilders`
Expected: FAIL on new tests (14 != 13, game_id undefined, event_type === 'ownGoal' 등)

- [ ] **Step 3: Modify `src/utils/rawLogBuilders.js`**

Replace the file contents with:

```javascript
import { normalizeMatchId } from './matchIdNormalizer';

export const RAW_EVENT_COLUMNS = [
  "team", "sport", "mode", "tournament_id",
  "date", "match_id", "our_team", "opponent",
  "event_type", "player", "related_player", "position",
  "input_time", "game_id",
];

export const RAW_PLAYER_GAME_COLUMNS = [
  "team", "sport", "mode", "tournament_id", "date",
  "player", "session_team",
  "games", "field_games", "keeper_games",
  "goals", "assists", "owngoals", "conceded", "cleansheets",
  "crova", "goguma", "역주행", "rank_score",
  "input_time",
];

/**
 * 풋살 pointEvents → 로그_이벤트 rows
 * @param {{ team, gameId, events }} input
 */
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
      out.push({ ...common, event_type: 'goal', player: e.scorer, related_player: e.assist || '' });
    } else if (e.ownGoalPlayer) {
      out.push({ ...common, event_type: 'owngoal', player: e.ownGoalPlayer, related_player: '' });
    } else if (e.concedingGk) {
      out.push({ ...common, event_type: 'concede', player: e.concedingGk, related_player: '' });
    }
  });
  return out;
}

export function buildRawPlayerGamesFromFutsal({ team, inputTime, players }) {
  return (players || []).map(p => ({
    team, sport: '풋살', mode: '기본', tournament_id: '',
    date: p.gameDate || '', player: p.name || '', session_team: p.playerTeam || '',
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

const SOCCER_EVENT_MAP = {
  '출전': 'lineup',
  '골': 'goal',
  '자책골': 'owngoal',
  '실점': 'concede',
  '교체': 'sub',
};

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
      position: e.position || '', input_time: e.inputTime || '',
      game_id: gameId,
    });
  });
  return out;
}

export function buildRawPlayerGamesFromSoccer({ team, inputTime, players }) {
  return (players || []).map(p => ({
    team, sport: '축구', mode: '기본', tournament_id: '',
    date: p.gameDate || '', player: p.name || '', session_team: team,
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

export function buildRawPlayerGamesFromTournament({ team, tournamentId, inputTime, events }) {
  const byDatePlayer = {};
  const ensure = (date, name) => {
    const k = date + '|' + name;
    if (!byDatePlayer[k]) {
      byDatePlayer[k] = { date, player: name, games: 0, field_games: 0, keeper_games: 0, goals: 0, assists: 0, owngoals: 0, conceded: 0, cleansheets: 0 };
    }
    return byDatePlayer[k];
  };
  (events || []).forEach(e => {
    const d = e.gameDate || '';
    if (e.event === '출전') {
      const s = ensure(d, e.player); s.games++;
      if (e.position === 'GK') s.keeper_games++; else s.field_games++;
    } else if (e.event === '골') {
      ensure(d, e.player).goals++;
      if (e.relatedPlayer) ensure(d, e.relatedPlayer).assists++;
    } else if (e.event === '자책골') {
      ensure(d, e.player).owngoals++;
    } else if (e.event === '실점' && e.player) {
      ensure(d, e.player).conceded++;
    } else if (e.event === '교체') {
      const s = ensure(d, e.player); s.games++;
      if (e.position === 'GK') s.keeper_games++; else s.field_games++;
    }
  });
  Object.values(byDatePlayer).forEach(s => {
    s.cleansheets = (s.keeper_games > 0 && s.conceded === 0) ? 1 : 0;
  });
  return Object.values(byDatePlayer).map(s => ({
    team, sport: '축구', mode: '대회', tournament_id: tournamentId || '',
    date: s.date, player: s.player, session_team: team,
    games: s.games, field_games: s.field_games, keeper_games: s.keeper_games,
    goals: s.goals, assists: s.assists, owngoals: s.owngoals,
    conceded: s.conceded, cleansheets: s.cleansheets,
    crova: 0, goguma: 0, 역주행: 0, rank_score: 0,
    input_time: inputTime || '',
  }));
}
```

- [ ] **Step 4: Fix existing test expectations**

기존 테스트 중 `event_type: 'ownGoal'` 을 기대하는 케이스가 있다면 `'owngoal'` 로 업데이트. `matchId: '1라운드 A구장'` 기대가 있으면 `'1라운드 A구장'`은 인식 불가 포맷이라 그대로 남음 (정규식 `\d+라운드 매치\d+`에만 매칭) — 현재 테스트의 match_id 기대값이 그대로면 그대로 통과해야 함. 만약 `matchId: '3라운드 매치1'` 같은 인식 포맷이면 `'R3_C0'`로 정규화 기대로 수정.

- [ ] **Step 5: Run all tests**

Run: `npm test -- rawLogBuilders`
Expected: PASS all

- [ ] **Step 6: Commit**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "feat: 로그_이벤트 game_id 컬럼 + event_type 표준화 + match_id 정규화"
```

---

## Task 3: `buildRoundRows` 유틸 신설 (풋살 stateJSON → 로그_매치 rows)

**Files:**
- Create: `src/utils/matchRowBuilder.js`
- Test: `src/utils/__tests__/matchRowBuilder.test.js`

- [ ] **Step 1: Write failing tests (풋살 케이스)**

`src/utils/__tests__/matchRowBuilder.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { buildRoundRowsFromFutsal, RAW_MATCH_COLUMNS } from '../matchRowBuilder';

describe('RAW_MATCH_COLUMNS', () => {
  it('필수 컬럼 순서', () => {
    expect(RAW_MATCH_COLUMNS).toEqual([
      'team', 'sport', 'mode', 'tournament_id',
      'date', 'game_id', 'match_idx',
      'round_idx', 'court_id', 'match_id',
      'our_team_name', 'opponent_team_name',
      'our_members_json', 'opponent_members_json',
      'our_score', 'opponent_score',
      'our_gk', 'opponent_gk',
      'formation', 'our_defenders_json',
      'is_extra', 'input_time',
    ]);
  });
});

describe('buildRoundRowsFromFutsal', () => {
  const baseState = {
    gameId: 'g_1713000000000',
    teams: [
      ['김성태', '이준호', '박민', '최영', '홍길동'],
      ['강백호', '서태웅', '정대만', '송태섭', '채치수'],
    ],
    teamNames: ['Team A', 'Team B'],
    completedMatches: [
      {
        matchId: 'R1_C0',
        homeIdx: 0, awayIdx: 1,
        homeTeam: 'Team A', awayTeam: 'Team B',
        homeScore: 3, awayScore: 1,
        homeGk: '김성태', awayGk: '강백호',
        isExtra: false,
      },
    ],
  };

  it('1라운드 → 1 row 반환', () => {
    const rows = buildRoundRowsFromFutsal({
      team: 'masterfc', mode: '기본', date: '2026-04-10',
      stateJSON: baseState, inputTime: '2026-04-10T20:00:00',
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.team).toBe('masterfc');
    expect(r.sport).toBe('풋살');
    expect(r.mode).toBe('기본');
    expect(r.game_id).toBe('g_1713000000000');
    expect(r.date).toBe('2026-04-10');
    expect(r.match_id).toBe('R1_C0');
    expect(r.round_idx).toBe(1);
    expect(r.court_id).toBe(0);
    expect(r.match_idx).toBe(1);
    expect(r.our_team_name).toBe('Team A');
    expect(r.opponent_team_name).toBe('Team B');
    expect(r.our_score).toBe(3);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('김성태');
    expect(r.opponent_gk).toBe('강백호');
    expect(JSON.parse(r.our_members_json)).toEqual(['김성태', '이준호', '박민', '최영', '홍길동']);
    expect(JSON.parse(r.opponent_members_json)).toEqual(['강백호', '서태웅', '정대만', '송태섭', '채치수']);
    expect(r.is_extra).toBe(false);
    expect(r.formation).toBe('');
    expect(JSON.parse(r.our_defenders_json)).toEqual([]);
  });

  it('match_id 파싱으로 round_idx / court_id 추출', () => {
    const state = {
      ...baseState,
      completedMatches: [{ ...baseState.completedMatches[0], matchId: 'R5_C1' }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].round_idx).toBe(5);
    expect(rows[0].court_id).toBe(1);
  });

  it('is_extra 경기도 포함 (is_extra=true)', () => {
    const state = {
      ...baseState,
      completedMatches: [{ ...baseState.completedMatches[0], isExtra: true }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].is_extra).toBe(true);
  });

  it('completedMatches 비어있으면 빈 배열', () => {
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: { ...baseState, completedMatches: [] }, inputTime: '' });
    expect(rows).toEqual([]);
  });

  it('match_idx는 배열 순서대로 1부터', () => {
    const state = {
      ...baseState,
      completedMatches: [
        { ...baseState.completedMatches[0], matchId: 'R1_C0' },
        { ...baseState.completedMatches[0], matchId: 'R2_C0' },
        { ...baseState.completedMatches[0], matchId: 'R3_C0' },
      ],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows.map(r => r.match_idx)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- matchRowBuilder`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Create `src/utils/matchRowBuilder.js`**

```javascript
// Firebase stateJSON → 로그_매치 rows 빌더.
// 풋살 / 축구 공통 스키마로 정규화.

export const RAW_MATCH_COLUMNS = [
  'team', 'sport', 'mode', 'tournament_id',
  'date', 'game_id', 'match_idx',
  'round_idx', 'court_id', 'match_id',
  'our_team_name', 'opponent_team_name',
  'our_members_json', 'opponent_members_json',
  'our_score', 'opponent_score',
  'our_gk', 'opponent_gk',
  'formation', 'our_defenders_json',
  'is_extra', 'input_time',
];

function parseMatchIdFutsal(matchId) {
  const m = String(matchId || '').match(/^R(\d+)_C(\d+)$/);
  if (!m) return { round_idx: null, court_id: null };
  return { round_idx: parseInt(m[1], 10), court_id: parseInt(m[2], 10) };
}

/**
 * 풋살 stateJSON → 로그_매치 rows.
 * @param {{ team, mode, tournamentId, date, stateJSON, inputTime }} input
 */
export function buildRoundRowsFromFutsal({ team, mode = '기본', tournamentId = '', date, stateJSON, inputTime }) {
  if (!stateJSON || !Array.isArray(stateJSON.completedMatches)) return [];
  const teams = stateJSON.teams || [];
  const gameId = stateJSON.gameId || '';
  return stateJSON.completedMatches.map((m, idx) => {
    const { round_idx, court_id } = parseMatchIdFutsal(m.matchId);
    const home = teams[m.homeIdx] || [];
    const away = teams[m.awayIdx] || [];
    return {
      team, sport: '풋살', mode, tournament_id: tournamentId,
      date: date || '',
      game_id: gameId,
      match_idx: idx + 1,
      round_idx, court_id,
      match_id: m.matchId || '',
      our_team_name: m.homeTeam || '',
      opponent_team_name: m.awayTeam || '',
      our_members_json: JSON.stringify(home),
      opponent_members_json: JSON.stringify(away),
      our_score: Number(m.homeScore) || 0,
      opponent_score: Number(m.awayScore) || 0,
      our_gk: m.homeGk || '',
      opponent_gk: m.awayGk || '',
      formation: '',
      our_defenders_json: JSON.stringify([]),
      is_extra: !!m.isExtra,
      input_time: inputTime || '',
    };
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- matchRowBuilder`
Expected: PASS all 풋살 케이스

- [ ] **Step 5: Commit**

```bash
git add src/utils/matchRowBuilder.js src/utils/__tests__/matchRowBuilder.test.js
git commit -m "feat: buildRoundRowsFromFutsal 유틸 추가 (stateJSON → 로그_매치 rows)"
```

---

## Task 4: `buildRoundRowsFromSoccer` 추가

**Files:**
- Modify: `src/utils/matchRowBuilder.js`
- Modify: `src/utils/__tests__/matchRowBuilder.test.js`

- [ ] **Step 1: Write failing soccer tests**

Append to `matchRowBuilder.test.js`:
```javascript
import { buildRoundRowsFromSoccer } from '../matchRowBuilder';

describe('buildRoundRowsFromSoccer', () => {
  const baseSoccerState = {
    soccerMatches: [
      {
        matchIdx: 1,
        opponent: '라이벌FC',
        lineup: [
          { player: '손흥민', position: 'FW' },
          { player: '김민재', position: 'DF' },
          { player: '이강인', position: 'MF' },
          { player: '조현우', position: 'GK' },
          { player: '황희찬', position: 'FW' },
          { player: '황인범', position: 'MF' },
          { player: '김영권', position: 'DF' },
          { player: '이재성', position: 'MF' },
          { player: '정우영', position: 'MF' },
          { player: '김진수', position: 'DF' },
          { player: '송민규', position: 'FW' },
        ],
        formation: '4-3-3',
        gk: '조현우',
        defenders: ['김민재', '김영권', '김진수'],
        events: [
          { type: 'sub', playerIn: '오현규', playerOut: '황희찬', position: 'FW' },
        ],
        ourScore: 2, opponentScore: 1,
        status: 'completed',
        startedAt: 1713000000000,
      },
    ],
  };

  it('풋살과 동일 스키마, 축구 전용 필드 채움', () => {
    const rows = buildRoundRowsFromSoccer({
      team: 'FC테스트', mode: '기본', date: '2026-04-10',
      stateJSON: baseSoccerState, inputTime: '2026-04-10T22:00:00',
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.sport).toBe('축구');
    expect(r.game_id).toBe('s_1713000000000');
    expect(r.match_id).toBe('1');
    expect(r.match_idx).toBe(1);
    expect(r.round_idx).toBe(null);
    expect(r.court_id).toBe(null);
    expect(r.our_team_name).toBe('FC테스트');
    expect(r.opponent_team_name).toBe('라이벌FC');
    expect(r.our_score).toBe(2);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('조현우');
    expect(r.opponent_gk).toBe('');
    expect(r.formation).toBe('4-3-3');
    expect(JSON.parse(r.our_defenders_json)).toEqual(['김민재', '김영권', '김진수']);
    const ourMembers = JSON.parse(r.our_members_json);
    expect(ourMembers).toContain('손흥민');
    expect(ourMembers).toContain('오현규'); // sub-in 포함
    expect(ourMembers).toContain('황희찬'); // sub-out도 포함 (P1 방침: 전원)
    expect(JSON.parse(r.opponent_members_json)).toEqual([]);
  });

  it('startedAt 없으면 s_{date}_{matchIdx} 폴백', () => {
    const state = { soccerMatches: [{ ...baseSoccerState.soccerMatches[0], startedAt: null }] };
    const rows = buildRoundRowsFromSoccer({ team: 'T', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].game_id).toBe('s_2026-04-10_1');
  });

  it('soccerMatches 없으면 빈 배열', () => {
    expect(buildRoundRowsFromSoccer({ team: 'T', mode: '기본', date: '2026-04-10', stateJSON: {}, inputTime: '' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- matchRowBuilder`
Expected: FAIL "buildRoundRowsFromSoccer is not a function"

- [ ] **Step 3: Add to `src/utils/matchRowBuilder.js`**

Append:
```javascript
/**
 * 축구 stateJSON → 로그_매치 rows.
 * @param {{ team, mode, tournamentId, date, stateJSON, inputTime }} input
 */
export function buildRoundRowsFromSoccer({ team, mode = '기본', tournamentId = '', date, stateJSON, inputTime }) {
  if (!stateJSON || !Array.isArray(stateJSON.soccerMatches)) return [];
  return stateJSON.soccerMatches.map(m => {
    const startedAt = m.startedAt;
    const gameId = startedAt ? `s_${startedAt}` : `s_${date}_${m.matchIdx}`;
    // our_members_json: 선발 + 교체 투입 전원 (sub-out도 남김 - P1 방침)
    const startingPlayers = (m.lineup || []).map(l => l.player).filter(Boolean);
    const subInPlayers = (m.events || [])
      .filter(e => e.type === 'sub' && e.playerIn)
      .map(e => e.playerIn);
    const allMembers = Array.from(new Set([...startingPlayers, ...subInPlayers]));
    return {
      team, sport: '축구', mode, tournament_id: tournamentId,
      date: date || '',
      game_id: gameId,
      match_idx: m.matchIdx,
      round_idx: null, court_id: null,
      match_id: String(m.matchIdx),
      our_team_name: team,
      opponent_team_name: m.opponent || '',
      our_members_json: JSON.stringify(allMembers),
      opponent_members_json: JSON.stringify([]),
      our_score: Number(m.ourScore) || 0,
      opponent_score: Number(m.opponentScore) || 0,
      our_gk: m.gk || '',
      opponent_gk: '',
      formation: m.formation || '',
      our_defenders_json: JSON.stringify(m.defenders || []),
      is_extra: false,
      input_time: inputTime || '',
    };
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- matchRowBuilder`
Expected: PASS all

- [ ] **Step 5: Commit**

```bash
git add src/utils/matchRowBuilder.js src/utils/__tests__/matchRowBuilder.test.js
git commit -m "feat: buildRoundRowsFromSoccer 추가 (축구 stateJSON 지원)"
```

---

## Task 5: `buildGameRecordsFromLogs` 유틸 신설 (분석 소스 변환)

**Files:**
- Create: `src/utils/gameRecordBuilder.js`
- Test: `src/utils/__tests__/gameRecordBuilder.test.js`

- [ ] **Step 1: Write failing tests**

`src/utils/__tests__/gameRecordBuilder.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { buildGameRecordsFromLogs } from '../gameRecordBuilder';

describe('buildGameRecordsFromLogs', () => {
  it('같은 game_id의 매치들을 한 GameRecord로 그룹핑', () => {
    const matchRows = [
      {
        game_id: 'g_1', date: '2026-04-10', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'Team A', opponent_team_name: 'Team B',
        our_members_json: JSON.stringify(['A1','A2','A3','A4','A5']),
        opponent_members_json: JSON.stringify(['B1','B2','B3','B4','B5']),
        our_score: 2, opponent_score: 1,
        our_gk: 'A1', opponent_gk: 'B1',
        is_extra: false,
      },
      {
        game_id: 'g_1', date: '2026-04-10', sport: '풋살', match_idx: 2,
        match_id: 'R2_C0', round_idx: 2, court_id: 0,
        our_team_name: 'Team A', opponent_team_name: 'Team C',
        our_members_json: JSON.stringify(['A1','A2','A3','A4','A5']),
        opponent_members_json: JSON.stringify(['C1','C2','C3','C4','C5']),
        our_score: 0, opponent_score: 0,
        our_gk: 'A1', opponent_gk: 'C1',
        is_extra: false,
      },
    ];
    const eventRows = [
      { game_id: 'g_1', match_id: 'R1_C0', event_type: 'goal', player: 'A2', related_player: 'A3' },
      { game_id: 'g_1', match_id: 'R1_C0', event_type: 'goal', player: 'A4', related_player: '' },
      { game_id: 'g_1', match_id: 'R1_C0', event_type: 'concede', player: 'A1', related_player: '' },
    ];
    const records = buildGameRecordsFromLogs(matchRows, eventRows);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.gameDate).toBe('2026-04-10');
    expect(r.matches).toHaveLength(2);
    // 팀 index 매핑: Team A = 0, Team B = 1, Team C = 2
    expect(r.teamNames).toEqual(['Team A', 'Team B', 'Team C']);
    expect(r.teams[0]).toEqual(['A1','A2','A3','A4','A5']);
    expect(r.teams[1]).toEqual(['B1','B2','B3','B4','B5']);
    expect(r.teams[2]).toEqual(['C1','C2','C3','C4','C5']);
    expect(r.matches[0]).toMatchObject({
      matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
      homeScore: 2, awayScore: 1,
      homeGk: 'A1', awayGk: 'B1',
      isExtra: false,
    });
    expect(r.events).toHaveLength(3);
    expect(r.events[0]).toMatchObject({ type: 'goal', matchId: 'R1_C0', player: 'A2', assist: 'A3' });
  });

  it('레거시 매칭: game_id 없는 이벤트는 (date + match_id + our_team) 조합으로 조인', () => {
    const matchRows = [
      {
        game_id: 'legacy_2026-04-01_masterfc', date: '2026-04-01', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'Team A', opponent_team_name: 'Team B',
        our_members_json: '["A1"]', opponent_members_json: '["B1"]',
        our_score: 1, opponent_score: 0, our_gk: 'A1', opponent_gk: 'B1',
        is_extra: false,
      },
    ];
    const eventRows = [
      { game_id: '', date: '2026-04-01', match_id: 'R1_C0', our_team: 'Team A', event_type: 'goal', player: 'A1' },
    ];
    const records = buildGameRecordsFromLogs(matchRows, eventRows);
    expect(records[0].events).toHaveLength(1);
  });

  it('members_json 파싱 실패 시 빈 배열 fallback', () => {
    const matchRows = [
      {
        game_id: 'g_bad', date: '2026-04-10', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'A', opponent_team_name: 'B',
        our_members_json: 'INVALID_JSON', opponent_members_json: '',
        our_score: 0, opponent_score: 0, our_gk: '', opponent_gk: '',
        is_extra: false,
      },
    ];
    const records = buildGameRecordsFromLogs(matchRows, []);
    expect(records[0].teams[0]).toEqual([]);
    expect(records[0].teams[1]).toEqual([]);
  });

  it('매치가 없으면 빈 배열', () => {
    expect(buildGameRecordsFromLogs([], [])).toEqual([]);
  });

  it('owngoal event_type은 ownGoal로 매핑 (기존 계산 함수 호환)', () => {
    const matchRows = [
      {
        game_id: 'g_x', date: '2026-04-10', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'A', opponent_team_name: 'B',
        our_members_json: '[]', opponent_members_json: '[]',
        our_score: 0, opponent_score: 1, our_gk: '', opponent_gk: '',
        is_extra: false,
      },
    ];
    const eventRows = [
      { game_id: 'g_x', match_id: 'R1_C0', event_type: 'owngoal', player: 'A1' },
    ];
    const records = buildGameRecordsFromLogs(matchRows, eventRows);
    expect(records[0].events[0].type).toBe('ownGoal');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- gameRecordBuilder`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Create `src/utils/gameRecordBuilder.js`**

```javascript
// 시트 rows → GameRecord[] 변환.
// 출력 스키마는 gameStateAnalyzer.parseGameHistory()와 동일 (calc* 함수 재사용 위함).

function safeParseArray(str) {
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// event_type을 기존 gameStateAnalyzer 스키마로 역매핑
function denormalizeEventType(standardType) {
  if (standardType === 'owngoal') return 'ownGoal';
  return standardType;
}

export function buildGameRecordsFromLogs(matchRows, eventRows) {
  if (!Array.isArray(matchRows) || matchRows.length === 0) return [];
  // game_id → match rows
  const byGame = new Map();
  for (const m of matchRows) {
    const gid = m.game_id || `_legacy_${m.date}_${m.our_team_name}`;
    if (!byGame.has(gid)) byGame.set(gid, []);
    byGame.get(gid).push(m);
  }
  // 이벤트 인덱싱: game_id 있는 건 game_id로, 없는 건 (date, match_id, our_team)로
  const eventsByGameMatch = new Map();
  const eventsByLegacyKey = new Map();
  for (const e of eventRows || []) {
    if (e.game_id) {
      const k = `${e.game_id}|${e.match_id}`;
      if (!eventsByGameMatch.has(k)) eventsByGameMatch.set(k, []);
      eventsByGameMatch.get(k).push(e);
    } else {
      const k = `${e.date}|${e.match_id}|${e.our_team}`;
      if (!eventsByLegacyKey.has(k)) eventsByLegacyKey.set(k, []);
      eventsByLegacyKey.get(k).push(e);
    }
  }

  const records = [];
  for (const [gid, mRows] of byGame) {
    mRows.sort((a, b) => (a.match_idx || 0) - (b.match_idx || 0));
    const gameDate = mRows[0].date;
    // 팀 이름 → 인덱스
    const teamIdx = new Map();
    const teams = [];
    const teamNames = [];
    function ensureTeam(name, members) {
      if (!teamIdx.has(name)) {
        teamIdx.set(name, teams.length);
        teams.push(members);
        teamNames.push(name);
      }
      return teamIdx.get(name);
    }
    const matches = [];
    const events = [];
    for (const m of mRows) {
      const homeMembers = safeParseArray(m.our_members_json);
      const awayMembers = safeParseArray(m.opponent_members_json);
      const homeIdx = ensureTeam(m.our_team_name, homeMembers);
      const awayIdx = ensureTeam(m.opponent_team_name, awayMembers);
      matches.push({
        matchId: m.match_id,
        homeIdx, awayIdx,
        homeTeam: m.our_team_name, awayTeam: m.opponent_team_name,
        homeScore: Number(m.our_score) || 0,
        awayScore: Number(m.opponent_score) || 0,
        homeGk: m.our_gk || '',
        awayGk: m.opponent_gk || '',
        isExtra: !!m.is_extra,
      });
      // 이벤트 조인
      const byGid = eventsByGameMatch.get(`${m.game_id}|${m.match_id}`) || [];
      const byLegacy = eventsByLegacyKey.get(`${m.date}|${m.match_id}|${m.our_team_name}`) || [];
      const merged = [...byGid, ...byLegacy];
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
      }
    }
    records.push({ gameDate, teams, teamNames, attendees: [], matches, events });
  }
  return records;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- gameRecordBuilder`
Expected: PASS all

- [ ] **Step 5: Commit**

```bash
git add src/utils/gameRecordBuilder.js src/utils/__tests__/gameRecordBuilder.test.js
git commit -m "feat: buildGameRecordsFromLogs 유틸 (시트 rows → GameRecord[])"
```

---

## Task 6: Apps Script - `로그_매치` 시트 + 헤더 상수

**Files:**
- Modify: `apps-script/Code.js:14-51` (_ensureRawSheets 확장)

- [ ] **Step 1: Edit `apps-script/Code.js`**

After line 15 (`RAW_PLAYER_GAMES_SHEET`), add:
```javascript
var RAW_MATCHES_SHEET = "로그_매치";

var RAW_MATCHES_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","game_id","match_idx",
  "round_idx","court_id","match_id",
  "our_team_name","opponent_team_name",
  "our_members_json","opponent_members_json",
  "our_score","opponent_score",
  "our_gk","opponent_gk",
  "formation","our_defenders_json",
  "is_extra","input_time"
];
```

Replace `_ensureRawSheets` body to also create `로그_매치`:
```javascript
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
  var mt = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!mt) {
    mt = ss.insertSheet(RAW_MATCHES_SHEET);
    mt.getRange(1, 1, 1, RAW_MATCHES_HEADERS.length).setValues([RAW_MATCHES_HEADERS]);
    mt.getRange(1, 1, 1, RAW_MATCHES_HEADERS.length).setFontWeight("bold");
    created.push(RAW_MATCHES_SHEET);
  }
  return { created: created };
}
```

Also update `RAW_EVENTS_HEADERS` to include `game_id` at the end:
```javascript
var RAW_EVENTS_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","match_id","our_team","opponent",
  "event_type","player","related_player","position",
  "input_time","game_id"
];
```

- [ ] **Step 2: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(apps-script): 로그_매치 시트 + 로그_이벤트 game_id 컬럼"
```

---

## Task 7: Apps Script - `_ensureEventLogHasGameId` 헬퍼 (기존 시트 호환)

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: Add helper function (after `_ensureRawSheets`)**

```javascript
function _ensureEventLogHasGameId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_EVENTS_SHEET); }
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf("game_id") >= 0) {
    return { success: true, added: false };
  }
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue("game_id");
  sheet.getRange(1, newCol).setFontWeight("bold");
  return { success: true, added: true, col: newCol };
}
```

- [ ] **Step 2: Register action in `doPost` (around line 211-249)**

Inside the `action === "..."` chain, add:
```javascript
    } else if (action === "ensureEventLogHasGameId") {
      return _jsonResponse(_ensureEventLogHasGameId());
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(apps-script): _ensureEventLogHasGameId 헬퍼 (기존 시트 호환)"
```

---

## Task 8: Apps Script - `_backupSheet` 헬퍼 (안전망)

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: Add helper**

```javascript
function _backupSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { success: false, error: "시트 없음: " + sheetName };
  var stamp = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmm");
  var backupName = sheetName + "_백업_" + stamp;
  if (ss.getSheetByName(backupName)) {
    return { success: true, name: backupName, skipped: true };
  }
  var copy = src.copyTo(ss);
  copy.setName(backupName);
  return { success: true, name: backupName, skipped: false };
}
```

- [ ] **Step 2: Register action**

```javascript
    } else if (action === "backupSheet") {
      return _jsonResponse(_backupSheet(body.sheetName));
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(apps-script): _backupSheet 헬퍼 (Migration 안전망)"
```

---

## Task 9: Apps Script - `_writeRawEvents`를 `game_id`로 확장

**Files:**
- Modify: `apps-script/Code.js:818-879`

- [ ] **Step 1: Update helpers to include game_id**

Replace `_rawEventKey`:
```javascript
function _rawEventKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.match_id||"",
    r.event_type||"", r.player||"", r.related_player||"", r.input_time||"", r.game_id||""].join("|");
}
```

Replace `_rawEventToArray`:
```javascript
function _rawEventToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.match_id||"", r.our_team||"", r.opponent||"",
    r.event_type||"", r.player||"", r.related_player||"", r.position||"",
    r.input_time||"", r.game_id||""];
}
```

Replace `_loadRawEventKeys`:
```javascript
function _loadRawEventKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  // 헤더 index 조회 (game_id는 없을 수도 있음)
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var gidCol = headers.indexOf("game_id");
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gid = gidCol >= 0 ? String(r[gidCol] || "") : "";
    // [team, sport, mode, tid, date, match_id, our_team, opponent, event_type, player, related_player, position, input_time, game_id?]
    var key = [r[0], r[1], r[2], r[3], _toDateStr(r[4]), r[5], r[8], r[9], r[10], String(r[12]), gid].join("|");
    keys[key] = true;
  }
  return keys;
}
```

Update `_writeRawEvents` to write to full width (handles game_id column):
Replace line `sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_EVENTS_HEADERS.length).setValues(toInsert);` to use current sheet width:
```javascript
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      // toInsert은 14개 값, 시트가 아직 13열이면 헤더 확장 필요
      if (lastCol < RAW_EVENTS_HEADERS.length) {
        _ensureEventLogHasGameId();
      }
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_EVENTS_HEADERS.length).setValues(toInsert);
    }
```

- [ ] **Step 2: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(apps-script): _writeRawEvents game_id 컬럼 수용"
```

---

## Task 10: Apps Script - `_writeRawMatches` (로그_매치 append)

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: Add helpers and action**

```javascript
function _writeRawMatches(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
    var existingKeys = _loadRawMatchKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = (r.game_id || "") + "|" + (r.match_id || "");
      if (existingKeys[key]) { skipped++; continue; }
      existingKeys[key] = true;
      toInsert.push(_rawMatchToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_MATCHES_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _loadRawMatchKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 6, lastRow - 1, 5).getValues(); // game_id=6, match_idx=7, round_idx=8, court_id=9, match_id=10
  for (var i = 0; i < data.length; i++) {
    var key = (data[i][0] || "") + "|" + (data[i][4] || ""); // game_id + match_id
    keys[key] = true;
  }
  return keys;
}

function _rawMatchToArray(r) {
  return [
    r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.game_id||"", r.match_idx||0,
    r.round_idx===null||r.round_idx===undefined?"":r.round_idx,
    r.court_id===null||r.court_id===undefined?"":r.court_id,
    r.match_id||"",
    r.our_team_name||"", r.opponent_team_name||"",
    r.our_members_json||"[]", r.opponent_members_json||"[]",
    r.our_score||0, r.opponent_score||0,
    r.our_gk||"", r.opponent_gk||"",
    r.formation||"", r.our_defenders_json||"[]",
    r.is_extra===true, r.input_time||""
  ];
}

function _deleteRawMatchesByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_MATCHES_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}
```

Register actions:
```javascript
    } else if (action === "writeRawMatches") {
      return _jsonResponse(_writeRawMatches(body.data));
    } else if (action === "deleteRawMatchesByDate") {
      return _jsonResponse(_deleteRawMatchesByDate(body.team, body.sport, body.date));
```

- [ ] **Step 2: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(apps-script): _writeRawMatches 로그_매치 append + 날짜별 삭제"
```

---

## Task 11: Apps Script - `migrateEventTypes` / `migrateMatchIds` 1회성 스크립트

**Files:**
- Modify: `apps-script/Code.js`

- [ ] **Step 1: Add migration functions**

```javascript
function migrateEventTypes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, updated: 0 };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf("event_type") + 1;
  if (col < 1) return { success: false, error: "event_type 컬럼 없음" };
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var vals = range.getValues();
  var updated = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || "");
    var next = v;
    if (v === "ownGoal") next = "owngoal";
    else if (v === "opponentGoal") next = "concede";
    if (next !== v) { vals[i][0] = next; updated++; }
  }
  if (updated > 0) range.setValues(vals);
  return { success: true, updated: updated };
}

function migrateMatchIds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, updated: 0, unrecognized: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var midCol = headers.indexOf("match_id") + 1;
  var sportCol = headers.indexOf("sport") + 1;
  if (midCol < 1 || sportCol < 1) return { success: false, error: "match_id/sport 컬럼 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var updated = 0;
  var unrecognized = {};
  for (var i = 0; i < data.length; i++) {
    var raw = String(data[i][midCol - 1] || "").trim();
    var sport = String(data[i][sportCol - 1] || "").trim();
    var next = _normalizeMatchIdAS(raw, sport);
    if (next !== raw) {
      sheet.getRange(i + 2, midCol).setValue(next);
      updated++;
    } else if (raw && !_isStandardMatchId(raw, sport)) {
      unrecognized[raw] = (unrecognized[raw] || 0) + 1;
    }
  }
  return { success: true, updated: updated, unrecognized: unrecognized };
}

function _normalizeMatchIdAS(raw, sport) {
  if (!raw) return raw;
  var s = String(raw).trim();
  if (/^R\d+_C\d+$/.test(s)) return s;
  var m1 = s.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m1) return "R" + m1[1] + "_C" + (parseInt(m1[2], 10) - 1);
  var m2 = s.match(/^(\d+)경기$/);
  var n = m2 ? m2[1] : (/^\d+$/.test(s) ? s : null);
  if (n !== null) return sport === "풋살" ? "R" + n + "_C0" : n;
  return s;
}

function _isStandardMatchId(s, sport) {
  if (sport === "풋살") return /^R\d+_C\d+$/.test(s);
  return /^\d+$/.test(s);
}
```

Register actions:
```javascript
    } else if (action === "migrateEventTypes") {
      return _jsonResponse(migrateEventTypes());
    } else if (action === "migrateMatchIds") {
      return _jsonResponse(migrateMatchIds());
```

- [ ] **Step 2: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(apps-script): migrateEventTypes / migrateMatchIds 1회성 함수"
```

---

## Task 12: AppSync에 `writeMatchLog` / `getMatchLog` 추가

**Files:**
- Modify: `src/services/appSync.js`

- [ ] **Step 1: Locate existing AppSync shape**

Run: `grep -n "writeRawEvents\|writePointLog\|getPointLog" /Users/rh/Desktop/python_dev/footsal_webapp/src/services/appSync.js`

- [ ] **Step 2: Add two methods**

In `src/services/appSync.js`, find the pattern where existing `writeRawEvents` exists (a POST wrapper). Add the following methods with the same convention (using the same `_post`/`call` helper used by siblings):

```javascript
// Example shape — adjust to match surrounding code style
async function writeMatchLog(rows) {
  return _post({ action: 'writeRawMatches', data: { rows } });
}

async function getMatchLog({ team, sport, dateFrom = '', dateTo = '' } = {}) {
  return _post({ action: 'getRawMatches', team, sport, dateFrom, dateTo });
}

async function deleteMatchLogByDate({ team, sport, date }) {
  return _post({ action: 'deleteRawMatchesByDate', team, sport, date });
}

export const AppSync = {
  // ...기존 메서드들...
  writeMatchLog,
  getMatchLog,
  deleteMatchLogByDate,
};
```

If `AppSync` is a default export object, add the keys there instead.

- [ ] **Step 3: Add Apps Script read handler for `getRawMatches`**

In `apps-script/Code.js`, register and implement:
```javascript
    } else if (action === "getRawMatches") {
      return _jsonResponse(_getRawMatches(body.team, body.sport, body.dateFrom, body.dateTo));
```

```javascript
function _getRawMatches(team, sport, dateFrom, dateTo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_MATCHES_SHEET); }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_MATCHES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var d = _toDateStr(r[4]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var row = {};
    for (var j = 0; j < RAW_MATCHES_HEADERS.length; j++) row[RAW_MATCHES_HEADERS[j]] = r[j];
    row.date = d;
    out.push(row);
  }
  return { success: true, rows: out };
}
```

Also add `getRawEvents` in similar style:
```javascript
    } else if (action === "getRawEvents") {
      return _jsonResponse(_getRawEvents(body.team, body.sport, body.dateFrom, body.dateTo));
```

```javascript
function _getRawEvents(team, sport, dateFrom, dateTo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_EVENTS_SHEET); }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var d = _toDateStr(r[4]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = r[j];
    row.date = d;
    out.push(row);
  }
  return { success: true, rows: out };
}
```

Add `AppSync.getEventLog` mirroring `getMatchLog`:
```javascript
async function getEventLog({ team, sport, dateFrom = '', dateTo = '' } = {}) {
  return _post({ action: 'getRawEvents', team, sport, dateFrom, dateTo });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/appSync.js apps-script/Code.js
git commit -m "feat: AppSync.writeMatchLog / getMatchLog / getEventLog 추가"
```

---

## Task 13: 풋살 확정 시 `로그_매치` 동시 기록

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Locate finalize flow**

Run: `grep -n "finalize\|FirebaseSync.saveFinalized\|writeRawEvents\|writePointLog" src/App.jsx | head`

- [ ] **Step 2: Add matchLog call alongside existing writes**

Where existing finalize calls `AppSync.writeRawEvents(...)` and/or `AppSync.writePointLog(...)`, add in parallel (using the same stateJSON that was just finalized):

```javascript
import { buildRoundRowsFromFutsal } from './utils/matchRowBuilder';
// ...
const matchRows = buildRoundRowsFromFutsal({
  team: teamName,
  mode: '기본',
  tournamentId: '',
  date: gameDate,
  stateJSON: finalState,
  inputTime: inputTime,
});
if (matchRows.length > 0) {
  await AppSync.writeMatchLog(matchRows).catch(err => console.warn('writeMatchLog 실패', err));
}
```

Also when calling `buildRawEventsFromFutsal`, pass `gameId: finalState.gameId` so events carry game_id.

- [ ] **Step 3: Manual test (dev server)**

```bash
npm run dev
```
- 풋살 세션 확정
- Google Sheets `로그_매치`에 새 행 확인
- Google Sheets `로그_이벤트`의 `game_id` 컬럼이 신규 이벤트에 채워졌는지 확인

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: 풋살 확정 시 로그_매치 + 로그_이벤트.game_id 동시 기록"
```

---

## Task 14: 축구 확정 시 `로그_매치` 동시 기록 + `gameId` 부여

**Files:**
- Modify: `src/SoccerApp.jsx`

- [ ] **Step 1: Find where soccerMatch is finalized**

Run: `grep -n "finalize\|saveFinalized\|writeRawEvents" src/SoccerApp.jsx | head`

- [ ] **Step 2: Ensure soccerMatch has `startedAt`**

On match start (경기 시작 버튼 핸들러), set `startedAt: Date.now()` on the soccerMatch object if not already.

- [ ] **Step 3: Add matchLog write on finalize**

```javascript
import { buildRoundRowsFromSoccer } from './utils/matchRowBuilder';
// ...
const matchRows = buildRoundRowsFromSoccer({
  team: teamName,
  mode: isTournament ? '대회' : '기본',
  tournamentId: tournamentId || '',
  date: gameDate,
  stateJSON: finalState,
  inputTime: inputTime,
});
if (matchRows.length > 0) {
  await AppSync.writeMatchLog(matchRows).catch(err => console.warn('writeMatchLog 실패', err));
}
```

Pass `gameId: matchRows[0]?.game_id` to `buildRawEventsFromSoccer` so event rows get the same game_id.

- [ ] **Step 4: Manual test**

- 축구 경기 시작 → 종료 → 확정
- `로그_매치` 축구 행 확인
- 교체 이벤트가 `event_type="sub"`으로 `로그_이벤트`에 기록되는지 확인

- [ ] **Step 5: Commit**

```bash
git add src/SoccerApp.jsx
git commit -m "feat: 축구 확정 시 로그_매치 + gameId 부여"
```

---

## Task 15: PlayerAnalytics 소스 전환 (Firebase → 시트)

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx:7-8, 245-320, 358-365`

- [ ] **Step 1: Replace Firebase load**

Change imports:
```javascript
import { calcDefenseStats, calcWinContribution, calcSynergy, calcWinStatsFromPointLog, calcDefenseFromMembers } from '../../utils/gameStateAnalyzer';
import { buildGameRecordsFromLogs } from '../../utils/gameRecordBuilder';
```

Replace the gameRecords load effect:
```javascript
useEffect(() => {
  if (needsGameRecords.includes(tab)) {
    setLoadingGameRecords(true);
    Promise.all([
      AppSync.getMatchLog({ team: teamName, sport: isSoccer ? '축구' : '풋살' }),
      AppSync.getEventLog({ team: teamName, sport: isSoccer ? '축구' : '풋살' }),
    ])
      .then(([matchRes, eventRes]) => {
        const matchRows = matchRes?.rows || [];
        const eventRows = eventRes?.rows || [];
        setGameRecords(buildGameRecordsFromLogs(matchRows, eventRows));
      })
      .catch(() => setGameRecords([]))
      .finally(() => setLoadingGameRecords(false));
  }
}, [teamName, tab, isSoccer]);
```

Remove `FirebaseSync.loadFinalizedAll` import and call.

- [ ] **Step 2: Update 축구 탭 노출**

Find the `TAB_LIST` array (around line 358):
```javascript
const tabs = [
  { key: "playercard", label: "선수카드" },
  !isSoccer && { key: "killer", label: "키퍼킬러" },
  !isSoccer && { key: "crovaguma", label: isCrovaGogumaMode ? "🍀/🍠" : "승·꼴" },
  { key: "combo2", label: "득점콤비" },
  { key: "synergy", label: "시너지" },   // 축구도 노출 (Before: !isSoccer)
  { key: "timepattern", label: "시간대" }, // 축구도 노출 (Before: !isSoccer)
  // ... 다른 탭들
].filter(Boolean);
```

(키퍼킬러, 🍀🌶️ 는 축구에서 계속 숨김)

- [ ] **Step 3: Update 메타 문구**

Find existing "앱 기록 N세션 / 총 M라운드" 텍스트 (around line 651) and change to derive from matchRows:
```javascript
{needsGameRecords.includes(tab) && gameRecordsSummary && (
  <div className="analytics-meta">
    분석 범위: {gameRecordsSummary.sessionCount}세션 / 총 {gameRecordsSummary.roundCount}라운드
    {gameRecordsSummary.legacyCount > 0 && (
      <span className="meta-warning"> · 레거시 추정 {gameRecordsSummary.legacyCount}건 포함 (근사)</span>
    )}
  </div>
)}
```

Compute `gameRecordsSummary`:
```javascript
const gameRecordsSummary = useMemo(() => {
  if (!gameRecords || gameRecords.length === 0) return null;
  const sessionIds = new Set();
  let roundCount = 0;
  let legacyCount = 0;
  for (const gr of gameRecords) {
    const gid = gr.gameDate + '|' + (gr.teamNames[0] || '');
    sessionIds.add(gid);
    roundCount += gr.matches.length;
    if (gr.matches.some(m => String(m.matchId || '').startsWith('legacy_'))) legacyCount++;
  }
  return { sessionCount: sessionIds.size, roundCount, legacyCount };
}, [gameRecords]);
```

- [ ] **Step 4: Manual test (all tabs)**

```bash
npm run dev
```
- 풋살 팀 접속, 각 탭 정상 동작 확인
- 축구 팀 접속, 시너지/득점콤비/시간대 노출 확인
- 선수카드 수치가 이전 Firebase 기반 분석과 일치하는지 샘플 확인

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat: PlayerAnalytics 소스를 Firebase → 로그_매치+로그_이벤트 전환, 축구 탭 확장"
```

---

## Task 16: Migration 스크립트 — `backfillMatchLog.mjs` (Phase 1)

**Files:**
- Create: `scripts/migrate/backfillMatchLog.mjs`

- [ ] **Step 1: Create directory + script**

```bash
mkdir -p scripts/migrate
```

`scripts/migrate/backfillMatchLog.mjs`:
```javascript
#!/usr/bin/env node
// Migration: 로그_이벤트 + 로그_선수경기 → 로그_매치 재구성 (legacy phase)
// Firebase stateJSON이 있는 날짜는 정확한 데이터로 덮어쓰기 (firebase phase)
//
// 실행:
//   node scripts/migrate/backfillMatchLog.mjs --team masterfc --sport 풋살 --dry-run
//   node scripts/migrate/backfillMatchLog.mjs --team masterfc --sport 풋살 --apply

import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
if (!args.team || !args.sport) {
  console.error('Usage: --team <team> --sport <풋살|축구> [--phase legacy|firebase|all] [--dry-run|--apply]');
  process.exit(1);
}
const PHASE = args.phase || 'all';
const DRY_RUN = !args.apply;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
if (!APPS_SCRIPT_URL) {
  console.error('환경변수 APPS_SCRIPT_URL 필요 (Apps Script 웹앱 URL)');
  process.exit(1);
}

async function main() {
  console.log(`[migrate] team=${args.team} sport=${args.sport} phase=${PHASE} dry=${DRY_RUN}`);

  // Step 1: 백업 (dry-run 이어도 백업은 생성 권장, apply면 필수)
  if (!DRY_RUN) {
    console.log('[backup] 로그_이벤트 백업 시작');
    const b1 = await callAppsScript({ action: 'backupSheet', sheetName: '로그_이벤트' });
    console.log('[backup]', b1);
    if (!b1.success) throw new Error('백업 실패: 로그_이벤트');
    const b2 = await callAppsScript({ action: 'backupSheet', sheetName: '로그_선수경기' });
    console.log('[backup]', b2);
    if (!b2.success) throw new Error('백업 실패: 로그_선수경기');

    await callAppsScript({ action: 'ensureEventLogHasGameId' });
    await callAppsScript({ action: 'migrateEventTypes' });
    await callAppsScript({ action: 'migrateMatchIds' });
  }

  if (PHASE === 'legacy' || PHASE === 'all') {
    await runLegacyPhase();
  }
  if (PHASE === 'firebase' || PHASE === 'all') {
    await runFirebasePhase();
  }
  console.log('[migrate] 완료');
}

async function runLegacyPhase() {
  console.log('\n=== PHASE: legacy (로그_이벤트 + 로그_선수경기 → 로그_매치) ===');
  const evRes = await callAppsScript({ action: 'getRawEvents', team: args.team, sport: args.sport });
  const pgRes = await callAppsScript({ action: 'getRawPlayerGames', team: args.team, sport: args.sport });
  const events = evRes.rows || [];
  const playerGames = pgRes.rows || [];
  console.log(`  events=${events.length} playerGames=${playerGames.length}`);

  // (date, match_id, our_team, opponent) 별 고유 라운드
  const roundKey = e => `${e.date}|${e.match_id}|${e.our_team}|${e.opponent}`;
  const rounds = new Map();
  for (const e of events) {
    const k = roundKey(e);
    if (!rounds.has(k)) rounds.set(k, { date: e.date, match_id: e.match_id, our_team: e.our_team, opponent: e.opponent, events: [] });
    rounds.get(k).events.push(e);
  }
  console.log(`  고유 라운드: ${rounds.size}`);

  // session_team 멤버: date 기준
  const membersByDateTeam = new Map();
  for (const p of playerGames) {
    const k = `${p.date}|${p.session_team}`;
    if (!membersByDateTeam.has(k)) membersByDateTeam.set(k, new Set());
    membersByDateTeam.get(k).add(p.player);
  }

  // 로그_매치 rows 생성
  const matchRows = [];
  let unrecognizedMid = 0;
  for (const [, r] of rounds) {
    const mid = r.match_id;
    const roundIdx = args.sport === '풋살' ? parseInt((mid.match(/^R(\d+)_C/) || [])[1], 10) : null;
    const courtId = args.sport === '풋살' ? parseInt((mid.match(/_C(\d+)$/) || [])[1], 10) : null;
    if (args.sport === '풋살' && (isNaN(roundIdx) || isNaN(courtId))) { unrecognizedMid++; continue; }
    const home = Array.from(membersByDateTeam.get(`${r.date}|${r.our_team}`) || []);
    const away = Array.from(membersByDateTeam.get(`${r.date}|${r.opponent}`) || []);
    const ourScore = r.events.filter(e => e.event_type === 'goal').length;
    const oppOwnGoal = r.events.filter(e => e.event_type === 'owngoal').length;
    const concede = r.events.filter(e => e.event_type === 'concede');
    const gk = concede.length > 0 ? concede[0].player : '';
    matchRows.push({
      team: args.team, sport: args.sport, mode: '기본', tournament_id: '',
      date: r.date,
      game_id: `legacy_${r.date}_${args.team}`,
      match_idx: 0, // 후속 처리 없음 (정확도 낮음)
      round_idx: roundIdx ?? '', court_id: courtId ?? '',
      match_id: mid,
      our_team_name: r.our_team, opponent_team_name: r.opponent,
      our_members_json: JSON.stringify(home),
      opponent_members_json: JSON.stringify(away),
      our_score: ourScore, opponent_score: concede.length + oppOwnGoal,
      our_gk: gk, opponent_gk: '',
      formation: '', our_defenders_json: '[]',
      is_extra: false,
      input_time: new Date().toISOString(),
    });
  }
  console.log(`  생성 rows=${matchRows.length} 미인식 match_id=${unrecognizedMid}`);

  if (DRY_RUN) {
    console.log('  [DRY-RUN] 샘플 5개:', matchRows.slice(0, 5));
    return;
  }
  // 배치로 분할 append
  const BATCH = 200;
  for (let i = 0; i < matchRows.length; i += BATCH) {
    const slice = matchRows.slice(i, i + BATCH);
    const res = await callAppsScript({ action: 'writeRawMatches', data: { rows: slice } });
    console.log(`  batch ${i}-${i + slice.length}: count=${res.count} skipped=${res.skipped}`);
  }
  // 로그_이벤트 game_id backfill (같은 date + our_team이면 동일 legacy id)
  // 신규 엔드포인트 필요 — Task 16 이후 추가 과제로 남겨두고 우선 legacy rows만 기록
  console.log('  ℹ  legacy_* game_id를 로그_이벤트에 주입하려면 별도 UPDATE 엔드포인트 필요 (후속)');
}

async function runFirebasePhase() {
  console.log('\n=== PHASE: firebase (최근 3일치 정확 덮어쓰기) ===');
  // firebase-admin 쓰는 대신, 기존 src/services/firebaseSync.js를 import해서 사용 시도.
  // 이 스크립트는 ESM이고, firebaseSync가 브라우저 전용일 수 있어 별도 모듈 필요.
  console.log('  ⚠ Firebase 읽기는 브라우저 SDK 의존 — 별도 관리 UI에서 실행 권장');
  console.log('  또는 firebase-admin으로 service account 설정 후 별도 구현');
  console.log('  현재 스크립트에서는 Firebase 파트 스킵');
}

async function callAppsScript(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);
  return await res.json();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out['dry-run'] = true;
    else if (a === '--apply') out.apply = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = v;
    }
  }
  return out;
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add Apps Script `getRawPlayerGames` handler**

```javascript
    } else if (action === "getRawPlayerGames") {
      return _jsonResponse(_getRawPlayerGames(body.team, body.sport));
```

```javascript
function _getRawPlayerGames(team, sport) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!sheet) return { success: true, rows: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var row = {};
    for (var j = 0; j < RAW_PLAYER_GAMES_HEADERS.length; j++) row[RAW_PLAYER_GAMES_HEADERS[j]] = r[j];
    row.date = _toDateStr(r[4]);
    out.push(row);
  }
  return { success: true, rows: out };
}
```

- [ ] **Step 3: Dry-run execution**

```bash
APPS_SCRIPT_URL="..." node scripts/migrate/backfillMatchLog.mjs --team masterfc --sport 풋살 --dry-run
```
샘플 rows 출력 확인, 미인식 match_id 개수 확인.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate/backfillMatchLog.mjs apps-script/Code.js
git commit -m "feat: backfillMatchLog.mjs migration 스크립트 (legacy phase)"
```

---

## Task 17: Firebase phase migration (웹앱 내 관리 UI로 실행)

**Files:**
- Create/Modify: 관리자 전용 컴포넌트 (기존 위치가 있으면 사용)

- [ ] **Step 1: 관리 화면에 버튼 추가**

기존 관리 화면이 있다면 (`src/components/admin/...`), 없으면 `PlayerAnalytics` 상단에 "관리자 툴" 접기 섹션 추가:

```javascript
async function runFirebasePhaseMigration(team, sport) {
  const history = await FirebaseSync.loadFinalizedAll(team);
  const buildFn = sport === '축구' ? buildRoundRowsFromSoccer : buildRoundRowsFromFutsal;
  const datesTouched = new Set();
  const allRows = [];
  for (const h of history) {
    if (!h.stateJson) continue;
    let gs;
    try { gs = JSON.parse(h.stateJson); } catch { continue; }
    const rows = buildFn({ team, mode: '기본', tournamentId: '', date: h.gameDate, stateJSON: gs, inputTime: h.inputTime || '' });
    datesTouched.add(h.gameDate);
    allRows.push(...rows);
  }
  // 해당 date의 기존 로그_매치 삭제
  for (const date of datesTouched) {
    await AppSync.deleteMatchLogByDate({ team, sport, date });
  }
  // append
  const BATCH = 200;
  let total = 0;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const res = await AppSync.writeMatchLog(allRows.slice(i, i + BATCH));
    total += res.count || 0;
  }
  return { dates: datesTouched.size, rows: total };
}
```

버튼 핸들러에서 `confirm()`으로 확인 후 실행.

- [ ] **Step 2: 수동 실행 + 검증**

- 버튼 클릭 → 콘솔 출력 확인
- `로그_매치` 시트에서 최근 3일치가 정확한 데이터(0:0 포함)로 덮어써졌는지 확인

- [ ] **Step 3: Commit**

```bash
git add src/components/...
git commit -m "feat: 관리 UI에서 Firebase stateJSON → 로그_매치 정확 덮어쓰기"
```

---

## Task 18: 검증 및 정리

- [ ] **Step 1: 전체 테스트**

```bash
npm test
npm run lint
```
Expected: 모두 PASS

- [ ] **Step 2: 수동 검증 시나리오**

| 시나리오 | 기대 |
|---|---|
| 풋살 세션 확정 | 로그_매치 행 N개 append, 로그_이벤트 game_id 채워짐 |
| 축구 경기 확정 | 로그_매치 1행 append, 로그_이벤트 game_id 채워짐 |
| PlayerAnalytics 풋살 각 탭 | 모두 정상 렌더, 수치 합리 |
| PlayerAnalytics 축구 선수카드/시너지/득점콤비/시간대 | 노출 + 수치 나옴 |
| PlayerAnalytics 축구 키퍼킬러/🍀🌶️ | 숨김 |
| 네트워크 탭 | `loadFinalizedAll` 호출 없음, `getRawMatches`/`getRawEvents` 호출 |
| 로그_이벤트 백업 시트 | 존재 |

- [ ] **Step 3: Final commit (필요 시)**

```bash
git add -A
git commit -m "chore: 로그 소스 통합 최종 검증 + 정리"
```

---

## Self-Review Checklist

- [ ] Spec 섹션 대응 확인:
  - 로그_매치 스키마 (Task 3, 4, 6, 10)
  - 로그_이벤트 game_id + event_type 표준화 + match_id 정규화 (Task 1, 2, 7, 9, 11)
  - 로그_선수경기 불변 (건드리지 않음)
  - Apps Script 함수 세트 (Task 6-12, 16)
  - PlayerAnalytics 전환 (Task 15)
  - 축구 game_id 부여 (Task 4, 14)
  - Migration 3단계 (Task 16, 17)
  - 백업 안전망 (Task 8, Task 16 실행 순서)
- [ ] 타입/시그니처 일관성: `buildRoundRowsFromFutsal` vs `buildRoundRowsFromSoccer` 동일 스키마, `buildGameRecordsFromLogs`가 기존 `parseGameHistory` 출력과 동일 모양
- [ ] Placeholder 없음: 모든 코드 블록이 실제 실행 가능한 형태
- [ ] TDD 준수: 유틸 함수는 테스트 선작성

---

## Out of Scope (후속 과제)

- 축구 이벤트 `minute` 필드 도입 (시간대 분석 정확도)
- 레거시 `포인트로그`/`선수별집계기록로그` 폐기 (Phase 2)
- `FirebaseSync.loadFinalizedAll` 제거 (Phase 2)
- 로그_이벤트의 legacy game_id UPDATE 엔드포인트 (필요 시 추가)
- 복수 코트 풋살 세션의 레거시 복원 정확도 개선

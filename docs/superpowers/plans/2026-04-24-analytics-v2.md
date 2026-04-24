# Analytics V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통합 로그(로그_이벤트/로그_선수경기/로그_매치) 기반으로 분석탭에 신규 지표 10종을 추가하고, 기존 분석탭은 Legacy 파일로 백업.

**Architecture:** 기존 `PlayerAnalytics.jsx`를 `PlayerAnalyticsLegacy.jsx`로 복사(원본 유지). 신규 지표는 `src/utils/analyticsV2/`의 순수 함수로 분리해 vitest 단위테스트. UI는 `src/components/dashboard/analytics/` 하위 6개 탭 컴포넌트로 구성. 신규 `PlayerAnalytics.jsx`가 오케스트레이터 역할.

**Tech Stack:** React, vitest, 기존 AppSync/Firebase 인프라. 추가 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-04-24-analytics-v2-design.md`

---

## File Structure

### Create
- `src/components/dashboard/PlayerAnalyticsLegacy.jsx` ← 기존 파일 복사 (백업)
- `src/components/dashboard/analytics/PlayerCardTab.jsx`
- `src/components/dashboard/analytics/HallOfFameTab.jsx`
- `src/components/dashboard/analytics/SynergyMatrixTab.jsx`
- `src/components/dashboard/analytics/GoldenTrioTab.jsx`
- `src/components/dashboard/analytics/AwardsTab.jsx`
- `src/components/dashboard/analytics/CrovaGogumaRankTab.jsx`
- `src/utils/analyticsV2/calcTrends.js`
- `src/utils/analyticsV2/calcStreaks.js`
- `src/utils/analyticsV2/calcPersonalRecords.js`
- `src/utils/analyticsV2/calcMonthlyRanking.js`
- `src/utils/analyticsV2/calcSynergyMatrix.js`
- `src/utils/analyticsV2/calcGoldenTrio.js`
- `src/utils/analyticsV2/calcAwards.js`
- `src/utils/analyticsV2/__tests__/calcTrends.test.js`
- `src/utils/analyticsV2/__tests__/calcStreaks.test.js`
- `src/utils/analyticsV2/__tests__/calcPersonalRecords.test.js`
- `src/utils/analyticsV2/__tests__/calcMonthlyRanking.test.js`
- `src/utils/analyticsV2/__tests__/calcSynergyMatrix.test.js`
- `src/utils/analyticsV2/__tests__/calcGoldenTrio.test.js`
- `src/utils/analyticsV2/__tests__/calcAwards.test.js`

### Modify
- `src/components/dashboard/PlayerAnalytics.jsx` ← 전면 재작성 (신규 오케스트레이터)
- `src/services/appSync.js` ← `getPlayerGameLog` 메서드 추가

---

## Task 1: 기존 분석탭 백업 (Legacy 복사)

**Files:**
- Create: `src/components/dashboard/PlayerAnalyticsLegacy.jsx`

- [ ] **Step 1: 기존 파일을 Legacy로 복사**

```bash
cp src/components/dashboard/PlayerAnalytics.jsx src/components/dashboard/PlayerAnalyticsLegacy.jsx
```

- [ ] **Step 2: Legacy 파일의 export default 함수명 변경**

`src/components/dashboard/PlayerAnalyticsLegacy.jsx`에서:
```jsx
export default function PlayerAnalytics({ teamName, teamMode, initialTab, isAdmin }) {
```
을 다음으로 변경:
```jsx
export default function PlayerAnalyticsLegacy({ teamName, teamMode, initialTab, isAdmin }) {
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공 (Legacy 파일은 아직 import되지 않음 - 경고 없이 통과)

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/PlayerAnalyticsLegacy.jsx
git commit -m "chore: PlayerAnalytics를 PlayerAnalyticsLegacy로 백업

원복용. 신규 V2 분석탭 도입 전 원본 보존.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: AppSync에 로그_선수경기 reader 추가

로그_선수경기 시트를 읽는 메서드가 없어 추가한다.

**Files:**
- Modify: `src/services/appSync.js`

- [ ] **Step 1: `getPlayerGameLog` 메서드 추가**

`src/services/appSync.js` 에서 `getEventLog` 메서드 바로 아래(line ~306)에 다음을 삽입:

```js
  async getPlayerGameLog({ sport = '', dateFrom = '', dateTo = '' } = {}) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      console.log(`[sheet] GET action=getRawPlayerGames sheet="로그_선수경기" team="${team}" sport="${sport}"`);
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getRawPlayerGames", team, sport, dateFrom, dateTo, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_선수경기 조회 실패:", e.message); return null; }
  },
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/services/appSync.js
git commit -m "feat: AppSync에 getPlayerGameLog 추가

로그_선수경기 시트 reader. Analytics V2에서 사용.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: calcTrends — 월별 G/A/승률 + 이동평균

**입력/출력 계약:**
```js
// input
{
  playerName: string,
  playerLogs: [{ player, date, goals, assists }],  // 로그_선수경기
  matchLogs: [{ date, our_members_json, our_score, opponent_score }],  // 로그_매치
  maxSessions?: number = 12,
  smoothWindow?: number = 3,
}
// output
{
  points: [{ date, gpg, apg, winRate }],  // 세션 단위
  smoothed: [{ date, gpg, apg, winRate }],  // N세션 이동평균
}
```

**Files:**
- Create: `src/utils/analyticsV2/calcTrends.js`
- Create: `src/utils/analyticsV2/__tests__/calcTrends.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcTrends.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcTrends } from '../calcTrends';

describe('calcTrends', () => {
  it('returns per-session gpg/apg/winRate', () => {
    const playerLogs = [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 1 },
      { player: 'A', date: '2026-01-08', goals: 1, assists: 0 },
    ];
    const matchLogs = [
      { date: '2026-01-01', our_members_json: JSON.stringify(['A']), our_score: 3, opponent_score: 1 },
      { date: '2026-01-01', our_members_json: JSON.stringify(['A']), our_score: 2, opponent_score: 2 },
      { date: '2026-01-08', our_members_json: JSON.stringify(['A']), our_score: 1, opponent_score: 2 },
    ];
    const result = calcTrends({ playerName: 'A', playerLogs, matchLogs });
    expect(result.points).toEqual([
      { date: '2026-01-01', gpg: 1, apg: 0.5, winRate: 0.5 },
      { date: '2026-01-08', gpg: 0.5, apg: 0, winRate: 0 },
    ]);
  });

  it('caps to maxSessions most recent', () => {
    const playerLogs = Array.from({ length: 15 }, (_, i) => ({
      player: 'A', date: `2026-01-${String(i+1).padStart(2,'0')}`, goals: 1, assists: 0
    }));
    const matchLogs = playerLogs.map(p => ({
      date: p.date, our_members_json: JSON.stringify(['A']), our_score: 1, opponent_score: 0
    }));
    const result = calcTrends({ playerName: 'A', playerLogs, matchLogs, maxSessions: 12 });
    expect(result.points).toHaveLength(12);
    expect(result.points[0].date).toBe('2026-01-04');
  });

  it('3-session moving average', () => {
    const playerLogs = [
      { player: 'A', date: '2026-01-01', goals: 3, assists: 0 },
      { player: 'A', date: '2026-01-02', goals: 0, assists: 0 },
      { player: 'A', date: '2026-01-03', goals: 3, assists: 0 },
    ];
    const matchLogs = playerLogs.map(p => ({
      date: p.date, our_members_json: JSON.stringify(['A']), our_score: 1, opponent_score: 0
    }));
    const result = calcTrends({ playerName: 'A', playerLogs, matchLogs, smoothWindow: 3 });
    expect(result.smoothed[2].gpg).toBeCloseTo(2, 5);
  });

  it('returns empty arrays when player has no logs', () => {
    const result = calcTrends({ playerName: 'X', playerLogs: [], matchLogs: [] });
    expect(result.points).toEqual([]);
    expect(result.smoothed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcTrends.test.js`
Expected: FAIL — `Cannot find module '../calcTrends'`

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcTrends.js`:
```js
// 선수의 최근 세션 트렌드: 경기당 득점/어시, 팀승률 + 이동평균
export function calcTrends({ playerName, playerLogs, matchLogs, maxSessions = 12, smoothWindow = 3 }) {
  if (!playerName || !playerLogs || !matchLogs) return { points: [], smoothed: [] };

  const playerSessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (playerSessions.length === 0) return { points: [], smoothed: [] };

  const sessionMatches = {};
  for (const m of matchLogs) {
    let members;
    try { members = JSON.parse(m.our_members_json || '[]'); } catch { continue; }
    if (!members.includes(playerName)) continue;
    if (!sessionMatches[m.date]) sessionMatches[m.date] = [];
    sessionMatches[m.date].push(m);
  }

  const points = playerSessions.map(p => {
    const matches = sessionMatches[p.date] || [];
    let wins = 0, draws = 0;
    const total = matches.length;
    for (const m of matches) {
      const our = Number(m.our_score) || 0;
      const opp = Number(m.opponent_score) || 0;
      if (our > opp) wins++;
      else if (our === opp) draws++;
    }
    const winRate = total > 0 ? (wins + 0.5 * draws) / total : 0;
    const gpg = total > 0 ? (p.goals || 0) / total : 0;
    const apg = total > 0 ? (p.assists || 0) / total : 0;
    return { date: p.date, gpg, apg, winRate };
  });

  const capped = points.slice(-maxSessions);

  const smoothed = capped.map((_, i) => {
    const start = Math.max(0, i - smoothWindow + 1);
    const window = capped.slice(start, i + 1);
    const avg = (key) => window.reduce((s, w) => s + w[key], 0) / window.length;
    return { date: capped[i].date, gpg: avg('gpg'), apg: avg('apg'), winRate: avg('winRate') };
  });

  return { points: capped, smoothed };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcTrends.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcTrends.js src/utils/analyticsV2/__tests__/calcTrends.test.js
git commit -m "feat(analyticsV2): calcTrends 선수 세션 트렌드 계산

경기당 G/A + 팀승률 시계열 + N세션 이동평균.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: calcStreaks — 연속 기록

**입력/출력 계약:**
```js
// input
{
  playerName: string,
  playerLogs: [{ player, date, goals, keeper_games, conceded }],
}
// output
{
  scoringStreak: { current: number, best: number },  // 연속 득점 세션
  cleanSheetStreak: { current: number, best: number },  // GK 연속 무실점
}
```

**Files:**
- Create: `src/utils/analyticsV2/calcStreaks.js`
- Create: `src/utils/analyticsV2/__tests__/calcStreaks.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcStreaks.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcStreaks } from '../calcStreaks';

describe('calcStreaks', () => {
  it('counts current & best scoring streak', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 2, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-02', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-03', goals: 0, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-04', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-05', goals: 2, keeper_games: 0, conceded: 0 },
    ];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs });
    expect(r.scoringStreak).toEqual({ current: 2, best: 2 });
  });

  it('best > current when last session is non-scoring', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-02', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-03', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-04', goals: 0, keeper_games: 0, conceded: 0 },
    ];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs });
    expect(r.scoringStreak).toEqual({ current: 0, best: 3 });
  });

  it('clean sheet streak only counts sessions where keeper_games>0', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, keeper_games: 2, conceded: 0 },  // count
      { player: 'G', date: '2026-01-02', goals: 0, keeper_games: 0, conceded: 0 },  // skip (no gk games)
      { player: 'G', date: '2026-01-03', goals: 0, keeper_games: 1, conceded: 0 },  // count
      { player: 'G', date: '2026-01-04', goals: 0, keeper_games: 1, conceded: 1 },  // break
    ];
    const r = calcStreaks({ playerName: 'G', playerLogs: logs });
    expect(r.cleanSheetStreak).toEqual({ current: 0, best: 2 });
  });

  it('returns zeros for unknown player', () => {
    const r = calcStreaks({ playerName: 'X', playerLogs: [] });
    expect(r).toEqual({
      scoringStreak: { current: 0, best: 0 },
      cleanSheetStreak: { current: 0, best: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcStreaks.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcStreaks.js`:
```js
// 연속 기록: 득점 세션 / GK 무실점 세션
export function calcStreaks({ playerName, playerLogs }) {
  const empty = { current: 0, best: 0 };
  if (!playerName || !playerLogs) return { scoringStreak: empty, cleanSheetStreak: empty };

  const sessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 득점 스트릭: goals>=1 연속
  let curScore = 0, bestScore = 0;
  for (const s of sessions) {
    if ((s.goals || 0) >= 1) { curScore++; if (curScore > bestScore) bestScore = curScore; }
    else curScore = 0;
  }

  // 무실점 스트릭: keeper_games>0 && conceded=0 연속 (keeper_games==0 세션은 스킵)
  let curCs = 0, bestCs = 0;
  for (const s of sessions) {
    if ((s.keeper_games || 0) === 0) continue;  // GK 경기 없으면 스트릭 유지
    if ((s.conceded || 0) === 0) { curCs++; if (curCs > bestCs) bestCs = curCs; }
    else curCs = 0;
  }

  return {
    scoringStreak: { current: curScore, best: bestScore },
    cleanSheetStreak: { current: curCs, best: bestCs },
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcStreaks.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcStreaks.js src/utils/analyticsV2/__tests__/calcStreaks.test.js
git commit -m "feat(analyticsV2): calcStreaks 연속 기록 계산

연속 득점 세션 및 GK 연속 무실점 세션(현재/역대최고).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: calcPersonalRecords — PR

**입력/출력 계약:**
```js
// input
{
  playerName: string,
  playerLogs: [{ player, date, goals, assists, keeper_games, conceded, rank_score }],
}
// output
{
  mostGoals: { value, date } | null,
  mostAssists: { value, date } | null,
  longestCleanSheet: { value, startDate, endDate } | null,  // 연속 세션 수
  bestRankScore: { value, date } | null,
}
```

**Files:**
- Create: `src/utils/analyticsV2/calcPersonalRecords.js`
- Create: `src/utils/analyticsV2/__tests__/calcPersonalRecords.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcPersonalRecords.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcPersonalRecords } from '../calcPersonalRecords';

describe('calcPersonalRecords', () => {
  it('returns max goals/assists with date', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 1, keeper_games: 0, conceded: 0, rank_score: 3 },
      { player: 'A', date: '2026-01-02', goals: 5, assists: 0, keeper_games: 0, conceded: 0, rank_score: 5 },
      { player: 'A', date: '2026-01-03', goals: 1, assists: 3, keeper_games: 0, conceded: 0, rank_score: 4 },
    ];
    const r = calcPersonalRecords({ playerName: 'A', playerLogs: logs });
    expect(r.mostGoals).toEqual({ value: 5, date: '2026-01-02' });
    expect(r.mostAssists).toEqual({ value: 3, date: '2026-01-03' });
    expect(r.bestRankScore).toEqual({ value: 5, date: '2026-01-02' });
  });

  it('computes longest clean sheet streak with dates', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 1, conceded: 2, rank_score: 0 },
      { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 1, conceded: 0, rank_score: 1 },
    ];
    const r = calcPersonalRecords({ playerName: 'G', playerLogs: logs });
    expect(r.longestCleanSheet).toEqual({ value: 2, startDate: '2026-01-01', endDate: '2026-01-02' });
  });

  it('returns null records for player with no logs', () => {
    const r = calcPersonalRecords({ playerName: 'X', playerLogs: [] });
    expect(r).toEqual({
      mostGoals: null, mostAssists: null,
      longestCleanSheet: null, bestRankScore: null,
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcPersonalRecords.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcPersonalRecords.js`:
```js
// Personal Records: 단일 세션 최고치 + GK 최장 무실점
export function calcPersonalRecords({ playerName, playerLogs }) {
  const empty = { mostGoals: null, mostAssists: null, longestCleanSheet: null, bestRankScore: null };
  if (!playerName || !playerLogs) return empty;

  const sessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sessions.length === 0) return empty;

  const pickMax = (key) => {
    let best = null;
    for (const s of sessions) {
      const v = Number(s[key]) || 0;
      if (best === null || v > best.value) best = { value: v, date: s.date };
    }
    return best && best.value > 0 ? best : null;
  };

  // 최장 무실점 스트릭(날짜 포함)
  let cur = 0, curStart = null;
  let best = null;
  for (const s of sessions) {
    if ((s.keeper_games || 0) === 0) continue;
    if ((s.conceded || 0) === 0) {
      if (cur === 0) curStart = s.date;
      cur++;
      if (!best || cur > best.value) best = { value: cur, startDate: curStart, endDate: s.date };
    } else {
      cur = 0; curStart = null;
    }
  }

  return {
    mostGoals: pickMax('goals'),
    mostAssists: pickMax('assists'),
    longestCleanSheet: best,
    bestRankScore: pickMax('rank_score'),
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcPersonalRecords.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcPersonalRecords.js src/utils/analyticsV2/__tests__/calcPersonalRecords.test.js
git commit -m "feat(analyticsV2): calcPersonalRecords PR 계산

단일 세션 최다골/어시/rank_score + GK 최장 무실점 스트릭.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: calcMonthlyRanking — 월별 TOP5

**입력/출력 계약:**
```js
// input
{
  yearMonth: string,  // 'YYYY-MM'
  playerLogs: [{ player, date, goals, assists }],
  matchLogs: [{ date, our_members_json, our_score, opponent_score }],
  topN?: number = 5,
}
// output
{
  goals: [{ player, value }],
  assists: [{ player, value }],
  winRate: [{ player, value, games }],  // games>=1 필수
}
```

**Files:**
- Create: `src/utils/analyticsV2/calcMonthlyRanking.js`
- Create: `src/utils/analyticsV2/__tests__/calcMonthlyRanking.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcMonthlyRanking.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcMonthlyRanking } from '../calcMonthlyRanking';

describe('calcMonthlyRanking', () => {
  const playerLogs = [
    { player: 'A', date: '2026-01-05', goals: 3, assists: 1 },
    { player: 'A', date: '2026-01-12', goals: 2, assists: 0 },
    { player: 'B', date: '2026-01-05', goals: 1, assists: 3 },
    { player: 'A', date: '2026-02-01', goals: 10, assists: 0 },  // 타 월
  ];
  const matchLogs = [
    { date: '2026-01-05', our_members_json: '["A","B"]', our_score: 3, opponent_score: 1 },
    { date: '2026-01-12', our_members_json: '["A"]', our_score: 1, opponent_score: 2 },
    { date: '2026-02-01', our_members_json: '["A"]', our_score: 5, opponent_score: 0 },
  ];

  it('aggregates within month only', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.goals[0]).toEqual({ player: 'A', value: 5 });
    expect(r.goals.find(x => x.player === 'A').value).toBe(5);
  });

  it('ranks assists descending', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.assists[0]).toEqual({ player: 'B', value: 3 });
  });

  it('winRate uses only that month matches and includes games', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    const a = r.winRate.find(x => x.player === 'A');
    expect(a.games).toBe(2);
    expect(a.value).toBeCloseTo(0.5, 5);
  });

  it('respects topN', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs, topN: 1 });
    expect(r.goals).toHaveLength(1);
    expect(r.assists).toHaveLength(1);
  });

  it('returns empty arrays for month with no data', () => {
    const r = calcMonthlyRanking({ yearMonth: '2025-12', playerLogs, matchLogs });
    expect(r).toEqual({ goals: [], assists: [], winRate: [] });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcMonthlyRanking.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcMonthlyRanking.js`:
```js
// 특정 YYYY-MM 기준 득점/어시/승률 TOP N
export function calcMonthlyRanking({ yearMonth, playerLogs, matchLogs, topN = 5 }) {
  if (!yearMonth) return { goals: [], assists: [], winRate: [] };

  const inMonth = (d) => typeof d === 'string' && d.startsWith(yearMonth + '-');

  const goalsMap = {}, assistsMap = {};
  for (const p of playerLogs || []) {
    if (!inMonth(p.date)) continue;
    goalsMap[p.player] = (goalsMap[p.player] || 0) + (Number(p.goals) || 0);
    assistsMap[p.player] = (assistsMap[p.player] || 0) + (Number(p.assists) || 0);
  }

  const winMap = {};  // player -> { wins, draws, games }
  for (const m of matchLogs || []) {
    if (!inMonth(m.date)) continue;
    let members;
    try { members = JSON.parse(m.our_members_json || '[]'); } catch { continue; }
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const outcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');
    for (const name of members) {
      if (!winMap[name]) winMap[name] = { wins: 0, draws: 0, games: 0 };
      winMap[name].games++;
      if (outcome === 'W') winMap[name].wins++;
      else if (outcome === 'D') winMap[name].draws++;
    }
  }

  const toList = (map, valueFn) =>
    Object.entries(map)
      .map(([player, v]) => ({ player, ...valueFn(v) }))
      .filter(x => x.value > 0 || x.games > 0)
      .sort((a, b) => b.value - a.value || a.player.localeCompare(b.player, 'ko'))
      .slice(0, topN);

  return {
    goals: toList(goalsMap, v => ({ value: v })),
    assists: toList(assistsMap, v => ({ value: v })),
    winRate: toList(winMap, v => ({ value: (v.wins + 0.5 * v.draws) / v.games, games: v.games })),
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcMonthlyRanking.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcMonthlyRanking.js src/utils/analyticsV2/__tests__/calcMonthlyRanking.test.js
git commit -m "feat(analyticsV2): calcMonthlyRanking 월별 TOP N

YYYY-MM 기준 goals/assists/winRate 랭킹.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: calcSynergyMatrix — N×N 시너지 히트맵

**입력/출력 계약:**
```js
// input
{
  matchLogs: [{ our_members_json, our_score, opponent_score }],
  minRounds?: number = 5,
}
// output
{
  players: string[],  // 알파벳순
  cells: { [pair: 'A|B']: { games, wins, draws, losses, winRate } },  // 모든 쌍 + 대각선('A|A')
}
```

**Files:**
- Create: `src/utils/analyticsV2/calcSynergyMatrix.js`
- Create: `src/utils/analyticsV2/__tests__/calcSynergyMatrix.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcSynergyMatrix.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';

describe('calcSynergyMatrix', () => {
  it('returns unique sorted player list', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.players).toEqual(['A', 'B', 'C']);
  });

  it('counts wins/draws/losses per pair', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },  // win
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 1 },  // draw
      { our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },  // loss
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|B']).toEqual({ games: 3, wins: 1, draws: 1, losses: 1, winRate: (1 + 0.5) / 3 });
  });

  it('diagonal = individual overall winRate', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|A']).toEqual({ games: 2, wins: 1, draws: 0, losses: 1, winRate: 0.5 });
  });

  it('cells with games < minRounds still present but flagged via games<min', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    expect(r.cells['A|B'].games).toBe(1);
  });

  it('skips malformed our_members_json', () => {
    const matchLogs = [
      { our_members_json: 'not-json', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.players).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcSynergyMatrix.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcSynergyMatrix.js`:
```js
// N×N 시너지 매트릭스: 같은팀 출전 라운드의 팀승률
export function calcSynergyMatrix({ matchLogs, minRounds = 5 }) {
  const playerSet = new Set();
  const cells = {};  // 'A|B' (A<=B) -> { games, wins, draws, losses }
  const bump = (key, outcome) => {
    if (!cells[key]) cells[key] = { games: 0, wins: 0, draws: 0, losses: 0 };
    cells[key].games++;
    if (outcome === 'W') cells[key].wins++;
    else if (outcome === 'D') cells[key].draws++;
    else cells[key].losses++;
  };

  for (const m of matchLogs || []) {
    let members;
    try {
      const parsed = JSON.parse(m.our_members_json || '[]');
      members = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : null;
    } catch { continue; }
    if (!members || members.length === 0) continue;
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const outcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');

    members.forEach(n => playerSet.add(n));
    // 대각선
    for (const name of members) bump(`${name}|${name}`, outcome);
    // 쌍
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i], members[j]].sort((x, y) => x.localeCompare(y, 'ko'));
        bump(`${a}|${b}`, outcome);
      }
    }
  }

  // winRate 계산 + 최소 라운드 정보(필터는 UI에서)
  for (const k of Object.keys(cells)) {
    const c = cells[k];
    c.winRate = c.games > 0 ? (c.wins + 0.5 * c.draws) / c.games : 0;
  }

  return {
    players: [...playerSet].sort((a, b) => a.localeCompare(b, 'ko')),
    cells,
    minRounds,
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcSynergyMatrix.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcSynergyMatrix.js src/utils/analyticsV2/__tests__/calcSynergyMatrix.test.js
git commit -m "feat(analyticsV2): calcSynergyMatrix N×N 시너지 매트릭스

같은팀 쌍의 팀승률. 대각선은 개인 전체 승률.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: calcGoldenTrio — 3인 조합 승률 TOP5

**입력/출력 계약:**
```js
// input
{
  matchLogs: [{ our_members_json, our_score, opponent_score }],
  minRounds?: number = 3,
  topN?: number = 5,
}
// output
[{ members: [A,B,C], games, wins, draws, losses, winRate }]  // 내림차순, 최대 topN
```

**Files:**
- Create: `src/utils/analyticsV2/calcGoldenTrio.js`
- Create: `src/utils/analyticsV2/__tests__/calcGoldenTrio.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcGoldenTrio.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcGoldenTrio } from '../calcGoldenTrio';

describe('calcGoldenTrio', () => {
  it('returns trios sorted by winRate desc', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 2, opponent_score: 0 },
      { our_members_json: '["A","B","C"]', our_score: 3, opponent_score: 1 },
      { our_members_json: '["A","B","C"]', our_score: 0, opponent_score: 1 },  // 2승 1패
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 0, opponent_score: 2 },
      { our_members_json: '["A","B","D"]', our_score: 0, opponent_score: 2 },  // 1승 2패
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    expect(r[0].members).toEqual(['A', 'B', 'C']);
    expect(r[0].winRate).toBeCloseTo(2 / 3, 5);
    expect(r[1].members).toEqual(['A', 'B', 'D']);
  });

  it('filters trios below minRounds', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A","B","D"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    expect(r).toHaveLength(1);
    expect(r[0].members).toEqual(['A', 'B', 'D']);
  });

  it('teams with <3 members produce no trios', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 1, topN: 5 });
    expect(r).toEqual([]);
  });

  it('respects topN', () => {
    const mk = (members) => ({ our_members_json: JSON.stringify(members), our_score: 1, opponent_score: 0 });
    const matchLogs = [
      ...Array(3).fill(mk(['A','B','C'])),
      ...Array(3).fill(mk(['A','B','D'])),
      ...Array(3).fill(mk(['A','B','E'])),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 2 });
    expect(r).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcGoldenTrio.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcGoldenTrio.js`:
```js
// 3인 조합 승률 TOP N
export function calcGoldenTrio({ matchLogs, minRounds = 3, topN = 5 }) {
  const trios = {};  // 'A|B|C' (정렬된 key) -> { games, wins, draws, losses }
  const bump = (key, outcome) => {
    if (!trios[key]) trios[key] = { games: 0, wins: 0, draws: 0, losses: 0 };
    trios[key].games++;
    if (outcome === 'W') trios[key].wins++;
    else if (outcome === 'D') trios[key].draws++;
    else trios[key].losses++;
  };

  for (const m of matchLogs || []) {
    let members;
    try {
      const parsed = JSON.parse(m.our_members_json || '[]');
      members = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : null;
    } catch { continue; }
    if (!members || members.length < 3) continue;

    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const outcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');

    const sorted = [...members].sort((a, b) => a.localeCompare(b, 'ko'));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        for (let k = j + 1; k < sorted.length; k++) {
          bump(`${sorted[i]}|${sorted[j]}|${sorted[k]}`, outcome);
        }
      }
    }
  }

  return Object.entries(trios)
    .filter(([, v]) => v.games >= minRounds)
    .map(([key, v]) => ({
      members: key.split('|'),
      games: v.games, wins: v.wins, draws: v.draws, losses: v.losses,
      winRate: (v.wins + 0.5 * v.draws) / v.games,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, topN);
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcGoldenTrio.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcGoldenTrio.js src/utils/analyticsV2/__tests__/calcGoldenTrio.test.js
git commit -m "feat(analyticsV2): calcGoldenTrio 3인 조합 승률 TOP N

minRounds 필터 + 승률 내림차순.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: calcAwards — 불꽃/수호신/자책 랭킹

**입력/출력 계약:**
```js
// input
{
  playerLogs: [{ player, date, goals, assists, keeper_games, conceded, owngoals }],
  topN?: { fireStarter?: 5, guardian?: 5, owngoal?: 3 },
}
// output
{
  fireStarter: [{ player, count }],      // goals>=3 세션 카운트 TOP5
  guardian: [{ player, count }],         // keeper_games>=2 && conceded=0 세션 TOP5
  owngoalKings: [{ player, total }],     // owngoals 누적 TOP3 (>0만)
}
```

**Files:**
- Create: `src/utils/analyticsV2/calcAwards.js`
- Create: `src/utils/analyticsV2/__tests__/calcAwards.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/analyticsV2/__tests__/calcAwards.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { calcAwards } from '../calcAwards';

describe('calcAwards', () => {
  const logs = [
    { player: 'A', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-02', goals: 4, assists: 0, keeper_games: 0, conceded: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-03', goals: 2, assists: 0, keeper_games: 0, conceded: 0, owngoals: 1 },
    { player: 'B', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, owngoals: 0 }, // fail: keeper_games<2
    { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 3, conceded: 1, owngoals: 0 }, // fail: conceded>0
    { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 2, conceded: 0, owngoals: 0 },
    { player: 'C', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 0, conceded: 0, owngoals: 3 },
  ];

  it('fireStarter counts goals>=3 sessions', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.fireStarter).toEqual([
      { player: 'A', count: 2 },
      { player: 'B', count: 1 },
    ]);
  });

  it('guardian counts keeper_games>=2 && conceded=0 sessions', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.guardian).toEqual([{ player: 'G', count: 2 }]);
  });

  it('owngoalKings returns only players with >0 owngoals, sorted desc', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.owngoalKings).toEqual([
      { player: 'C', total: 3 },
      { player: 'A', total: 1 },
    ]);
  });

  it('respects custom topN', () => {
    const r = calcAwards({ playerLogs: logs, topN: { fireStarter: 1, guardian: 1, owngoal: 1 } });
    expect(r.fireStarter).toHaveLength(1);
    expect(r.guardian).toHaveLength(1);
    expect(r.owngoalKings).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcAwards.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal**

`src/utils/analyticsV2/calcAwards.js`:
```js
// 재미 어워드: 불꽃(해트트릭+) / 수호신(세션 내 전 GK경기 무실점) / 자책 랭킹
export function calcAwards({ playerLogs, topN = {} }) {
  const limits = {
    fireStarter: topN.fireStarter ?? 5,
    guardian: topN.guardian ?? 5,
    owngoal: topN.owngoal ?? 3,
  };

  const fire = {}, guard = {}, own = {};
  for (const p of playerLogs || []) {
    const name = p.player;
    if ((Number(p.goals) || 0) >= 3) fire[name] = (fire[name] || 0) + 1;
    if ((Number(p.keeper_games) || 0) >= 2 && (Number(p.conceded) || 0) === 0) {
      guard[name] = (guard[name] || 0) + 1;
    }
    const og = Number(p.owngoals) || 0;
    if (og > 0) own[name] = (own[name] || 0) + og;
  }

  const toList = (map, key, limit) =>
    Object.entries(map)
      .map(([player, value]) => ({ player, [key]: value }))
      .sort((a, b) => b[key] - a[key] || a.player.localeCompare(b.player, 'ko'))
      .slice(0, limit);

  return {
    fireStarter: toList(fire, 'count', limits.fireStarter),
    guardian: toList(guard, 'count', limits.guardian),
    owngoalKings: toList(own, 'total', limits.owngoal),
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run src/utils/analyticsV2/__tests__/calcAwards.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcAwards.js src/utils/analyticsV2/__tests__/calcAwards.test.js
git commit -m "feat(analyticsV2): calcAwards 재미 어워드 (불꽃/수호신/자책)

goals>=3 세션 / 세션 전 GK 무실점 / owngoals 누적 TOP N.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: 전체 테스트 일괄 실행

- [ ] **Step 1: 모든 analyticsV2 테스트 통과 확인**

Run: `npx vitest run src/utils/analyticsV2/`
Expected: 7 test files passed (29+ tests total)

기존 테스트도 깨지지 않았는지 확인:

Run: `npm test`
Expected: 전체 테스트 통과

---

## Task 11: PlayerCardTab (analytics/) — 기존 + 트렌드/스트릭 하단 확장

**Files:**
- Create: `src/components/dashboard/analytics/PlayerCardTab.jsx`

- [ ] **Step 1: 기존 PlayerCardTab 복사**

```bash
cp src/components/dashboard/PlayerCardTab.jsx src/components/dashboard/analytics/PlayerCardTab.jsx
```

- [ ] **Step 2: 신규 props 및 지표 연결**

`src/components/dashboard/analytics/PlayerCardTab.jsx` 상단 import 섹션에 추가:
```jsx
import { calcTrends } from '../../../utils/analyticsV2/calcTrends';
import { calcStreaks } from '../../../utils/analyticsV2/calcStreaks';
```

함수 시그니처를 다음으로 변경:
```jsx
export default function PlayerCardTab({ playerLog, members, defenseStats, winStats, gameRecords, playerGameLogs, matchLogs, C }) {
```

(기존 시그니처에 `playerGameLogs`, `matchLogs` 2개 추가)

- [ ] **Step 3: 선수 선택 이후 섹션에 트렌드/스트릭 계산 추가**

`const selected = selectedPlayer || players[0];` 라인 바로 다음에 삽입:

```jsx
  const trendData = useMemo(() => {
    if (!selected || !playerGameLogs || !matchLogs) return null;
    return calcTrends({ playerName: selected, playerLogs: playerGameLogs, matchLogs });
  }, [selected, playerGameLogs, matchLogs]);

  const streakData = useMemo(() => {
    if (!selected || !playerGameLogs) return null;
    return calcStreaks({ playerName: selected, playerLogs: playerGameLogs });
  }, [selected, playerGameLogs]);
```

- [ ] **Step 4: 하단 확장 UI 추가**

기존 바디(Radar + 표 + 기존 추세/상대위치 블록) 다음에, `{(!defenseStats || ...)}` 안내 박스 바로 위에 삽입:

```jsx
          {streakData && (streakData.scoringStreak.best > 0 || streakData.cleanSheetStreak.best > 0) && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, lineHeight: 1.9, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 4 }}>연속 기록</div>
              {streakData.scoringStreak.best > 0 && (
                <div>
                  <span style={{ color: C.gray }}>득점 연속: </span>
                  <span style={{ color: C.white, fontWeight: 700 }}>
                    현재 {streakData.scoringStreak.current} / 역대 {streakData.scoringStreak.best}세션
                  </span>
                </div>
              )}
              {streakData.cleanSheetStreak.best > 0 && (
                <div>
                  <span style={{ color: C.gray }}>GK 무실점 연속: </span>
                  <span style={{ color: C.white, fontWeight: 700 }}>
                    현재 {streakData.cleanSheetStreak.current} / 역대 {streakData.cleanSheetStreak.best}세션
                  </span>
                </div>
              )}
            </div>
          )}
          {trendData && trendData.points.length >= 3 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 8, textAlign: "left" }}>
                최근 {trendData.points.length}세션 추세
              </div>
              <TrendLineChart smoothed={trendData.smoothed} C={C} />
            </div>
          )}
```

- [ ] **Step 5: TrendLineChart 컴포넌트 추가**

파일 상단(PlayerCardTab 함수 선언 **앞**)에 삽입:

```jsx
function TrendLineChart({ smoothed, C }) {
  const width = 280, height = 140, padX = 24, padY = 18;
  const n = smoothed.length;
  if (n === 0) return null;
  const maxG = Math.max(1, ...smoothed.map(s => s.gpg), ...smoothed.map(s => s.apg));
  const xAt = (i) => padX + (i * (width - 2 * padX) / Math.max(1, n - 1));
  const yAtGA = (v) => height - padY - (v / maxG) * (height - 2 * padY);
  const yAtW = (v) => height - padY - v * (height - 2 * padY);
  const path = (ys) => smoothed.map((s, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${ys(s)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path(s => yAtGA(s.gpg))} stroke="#ef4444" strokeWidth={2} fill="none" />
      <path d={path(s => yAtGA(s.apg))} stroke="#3b82f6" strokeWidth={2} fill="none" />
      <path d={path(s => yAtW(s.winRate))} stroke="#22c55e" strokeWidth={2} strokeDasharray="3,3" fill="none" />
      <text x={4} y={14} fontSize={9} fill="#ef4444">G/경기</text>
      <text x={60} y={14} fontSize={9} fill="#3b82f6">A/경기</text>
      <text x={120} y={14} fontSize={9} fill="#22c55e">승률</text>
    </svg>
  );
}
```

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/analytics/PlayerCardTab.jsx
git commit -m "feat(analyticsV2): PlayerCardTab에 트렌드 라인차트 + 연속기록 추가

하단 확장: 연속 득점/GK 무실점 세션, 최근 N세션 G/A/승률 라인차트.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: HallOfFameTab — PR + 월별 랭킹

**Files:**
- Create: `src/components/dashboard/analytics/HallOfFameTab.jsx`

- [ ] **Step 1: Component 작성**

`src/components/dashboard/analytics/HallOfFameTab.jsx`:
```jsx
import { useState, useMemo } from 'react';
import { calcPersonalRecords } from '../../../utils/analyticsV2/calcPersonalRecords';
import { calcMonthlyRanking } from '../../../utils/analyticsV2/calcMonthlyRanking';

export default function HallOfFameTab({ playerGameLogs, matchLogs, C }) {
  const players = useMemo(() => {
    const set = new Set();
    (playerGameLogs || []).forEach(p => set.add(p.player));
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [playerGameLogs]);

  const months = useMemo(() => {
    const set = new Set();
    (playerGameLogs || []).forEach(p => {
      if (p.date && p.date.length >= 7) set.add(p.date.substring(0, 7));
    });
    return [...set].sort().reverse();
  }, [playerGameLogs]);

  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const effectivePlayer = selectedPlayer || players[0] || '';
  const effectiveMonth = selectedMonth || months[0] || '';

  const pr = useMemo(() =>
    effectivePlayer ? calcPersonalRecords({ playerName: effectivePlayer, playerLogs: playerGameLogs || [] }) : null
  , [effectivePlayer, playerGameLogs]);

  const ranking = useMemo(() =>
    effectiveMonth ? calcMonthlyRanking({ yearMonth: effectiveMonth, playerLogs: playerGameLogs || [], matchLogs: matchLogs || [] }) : null
  , [effectiveMonth, playerGameLogs, matchLogs]);

  const selectStyle = { width: "100%", padding: "10px 14px", borderRadius: 50, fontSize: 14, fontWeight: 480, background: "transparent", color: C.white, border: `1.2px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" };
  const sectionLabel = { fontSize: 13, fontWeight: 700, color: C.white, margin: "18px 0 8px" };
  const rowStyle = { display: "flex", justifyContent: "space-between", padding: "6px 10px", borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 };

  return (
    <div>
      <div style={sectionLabel}>개인 기록 (PR)</div>
      <select value={effectivePlayer} onChange={e => setSelectedPlayer(e.target.value)} style={selectStyle}>
        {players.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {pr && (
        <div style={{ marginTop: 10, background: C.cardLight, borderRadius: 8, padding: "10px 12px" }}>
          {pr.mostGoals ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }}>⚽ 최다골</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostGoals.value}골 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostGoals.date})</span></span>
            </div>
          ) : <div style={rowStyle}><span style={{ color: C.gray }}>⚽ 최다골</span><span style={{ color: C.gray }}>-</span></div>}
          {pr.mostAssists ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }}>🅰 최다어시</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostAssists.value}어시 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostAssists.date})</span></span>
            </div>
          ) : <div style={rowStyle}><span style={{ color: C.gray }}>🅰 최다어시</span><span style={{ color: C.gray }}>-</span></div>}
          {pr.longestCleanSheet ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }}>🧤 GK 최장 무실점</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.longestCleanSheet.value}세션 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.longestCleanSheet.startDate}~{pr.longestCleanSheet.endDate})</span></span>
            </div>
          ) : <div style={rowStyle}><span style={{ color: C.gray }}>🧤 GK 최장 무실점</span><span style={{ color: C.gray }}>-</span></div>}
          {pr.bestRankScore ? (
            <div style={rowStyle}>
              <span style={{ color: C.gray }}>🏆 최고 rank_score</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{pr.bestRankScore.value} <span style={{ color: C.gray, fontWeight: 400 }}>({pr.bestRankScore.date})</span></span>
            </div>
          ) : null}
        </div>
      )}

      <div style={sectionLabel}>월별 랭킹</div>
      <select value={effectiveMonth} onChange={e => setSelectedMonth(e.target.value)} style={selectStyle}>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {ranking && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <RankingCard title="⚽ 득점" rows={ranking.goals} suffix="골" C={C} />
          <RankingCard title="🅰 어시" rows={ranking.assists} suffix="어시" C={C} />
          <RankingCard title="🏁 승률" rows={ranking.winRate.map(x => ({ player: x.player, value: `${Math.round(x.value * 100)}%` }))} suffix="" C={C} />
        </div>
      )}
    </div>
  );
}

function RankingCard({ title, rows, suffix, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 10, color: C.gray }}>-</div>
      ) : rows.map((r, i) => (
        <div key={r.player} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.player}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/HallOfFameTab.jsx
git commit -m "feat(analyticsV2): HallOfFameTab 명예의 전당 탭

PR(개인 기록) 4종 + 월별 랭킹 TOP5.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: SynergyMatrixTab — N×N 히트맵

**Files:**
- Create: `src/components/dashboard/analytics/SynergyMatrixTab.jsx`

- [ ] **Step 1: Component 작성**

`src/components/dashboard/analytics/SynergyMatrixTab.jsx`:
```jsx
import { useMemo, useState } from 'react';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';

export default function SynergyMatrixTab({ matchLogs, C }) {
  const [hover, setHover] = useState(null);
  const data = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }

  const colorFor = (cell, isDiag) => {
    if (!cell || cell.games < data.minRounds) return isDiag ? "#3b3b3b" : "#2a2a2a";
    const wr = cell.winRate;
    if (wr >= 0.6) return `rgba(59,130,246,${0.4 + Math.min(0.5, wr - 0.6)})`;
    if (wr <= 0.4) return `rgba(239,68,68,${0.4 + Math.min(0.5, 0.4 - wr)})`;
    return "#4a4a4a";
  };

  const cellSize = 24;
  const nameColWidth = 60;

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은팀 출전 라운드의 팀승률. 파랑=고승률, 빨강=저승률, 회색=표본 부족(&lt; {data.minRounds}경기). 대각선은 개인 전체 승률.
      </div>
      {hover && (
        <div style={{ marginBottom: 8, padding: "6px 10px", background: C.cardLight, borderRadius: 6, fontSize: 11, color: C.white }}>
          <b>{hover.a} × {hover.b}</b>: {hover.cell.games}경기 {hover.cell.wins}승 {hover.cell.draws}무 {hover.cell.losses}패 · 승률 {Math.round(hover.cell.winRate * 100)}%
        </div>
      )}
      <div style={{ overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr>
              <th style={{ width: nameColWidth }}></th>
              {data.players.map(p => (
                <th key={p} style={{ width: cellSize, writingMode: "vertical-rl", transform: "rotate(180deg)", color: C.gray, fontWeight: 500, padding: 2 }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.players.map(a => (
              <tr key={a}>
                <td style={{ color: C.gray, paddingRight: 6, textAlign: "right", fontSize: 10 }}>{a}</td>
                {data.players.map(b => {
                  const sortedKey = [a, b].sort((x, y) => x.localeCompare(y, 'ko'));
                  const key = `${sortedKey[0]}|${sortedKey[1]}`;
                  const cell = data.cells[key];
                  const isDiag = a === b;
                  return (
                    <td key={b}
                      onMouseEnter={() => cell && setHover({ a, b, cell })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        width: cellSize, height: cellSize,
                        background: colorFor(cell, isDiag),
                        border: `1px solid ${C.grayDarker}`,
                        cursor: cell ? "pointer" : "default",
                      }} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/SynergyMatrixTab.jsx
git commit -m "feat(analyticsV2): SynergyMatrixTab N×N 히트맵

쌍별 팀승률 히트맵. hover시 경기수/승무패 표시.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 14: GoldenTrioTab — 3인 조합 TOP5

**Files:**
- Create: `src/components/dashboard/analytics/GoldenTrioTab.jsx`

- [ ] **Step 1: Component 작성**

`src/components/dashboard/analytics/GoldenTrioTab.jsx`:
```jsx
import { useMemo } from 'react';
import { calcGoldenTrio } from '../../../utils/analyticsV2/calcGoldenTrio';

export default function GoldenTrioTab({ matchLogs, C }) {
  const trios = useMemo(() => calcGoldenTrio({ matchLogs: matchLogs || [], minRounds: 3, topN: 5 }), [matchLogs]);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }
  if (trios.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>조건을 만족하는 3인 조합이 없습니다. (최소 3경기 동행)</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>
        같은 팀으로 3경기 이상 뛴 3인 조합의 승률 TOP 5
      </div>
      {trios.map((t, i) => (
        <div key={t.members.join('|')} style={{ background: C.cardLight, borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>#{i + 1}</div>
            <div style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>
              {t.members.join(" + ")}
            </div>
            <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
              {t.games}경기 {t.wins}승 {t.draws}무 {t.losses}패
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>
            {Math.round(t.winRate * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/GoldenTrioTab.jsx
git commit -m "feat(analyticsV2): GoldenTrioTab 3인 조합 승률 TOP5

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 15: AwardsTab — 불꽃/수호신/자책

**Files:**
- Create: `src/components/dashboard/analytics/AwardsTab.jsx`

- [ ] **Step 1: Component 작성**

`src/components/dashboard/analytics/AwardsTab.jsx`:
```jsx
import { useMemo } from 'react';
import { calcAwards } from '../../../utils/analyticsV2/calcAwards';

export default function AwardsTab({ playerGameLogs, C }) {
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [] }), [playerGameLogs]);

  if (!playerGameLogs || playerGameLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>데이터가 없습니다.</div>;
  }

  return (
    <div>
      <AwardCard
        title="🔥 불꽃"
        subtitle="해트트릭 이상 (goals≥3 세션)"
        rows={awards.fireStarter}
        valueKey="count"
        suffix="회"
        C={C}
      />
      <AwardCard
        title="🛡️ 수호신"
        subtitle="세션 내 모든 GK경기(≥2경기) 무실점"
        rows={awards.guardian}
        valueKey="count"
        suffix="회"
        C={C}
      />
      <AwardCard
        title="😅 자책 랭킹"
        subtitle="가장 친절한 상대팀 조력자"
        rows={awards.owngoalKings}
        valueKey="total"
        suffix="골"
        C={C}
      />
    </div>
  );
}

function AwardCard({ title, subtitle, rows, valueKey, suffix, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title}</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 8 }}>{subtitle}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>아직 달성자가 없습니다.</div>
      ) : rows.map((r, i) => (
        <div key={r.player} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < rows.length - 1 ? `1px dashed ${C.grayDarker}` : "none", fontSize: 12 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.player}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r[valueKey]}{suffix}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/AwardsTab.jsx
git commit -m "feat(analyticsV2): AwardsTab 재미 어워드 (불꽃/수호신/자책)

카드 3개 리스트 형식.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 16: CrovaGogumaRankTab — 🍀/🍠 랭킹 (마스터FC 전용)

기존 `calcCrovaGogumaFreq`를 재사용. 토글: 전체 누적 / 최근 3개월.

**Files:**
- Create: `src/components/dashboard/analytics/CrovaGogumaRankTab.jsx`

- [ ] **Step 1: Component 작성**

`src/components/dashboard/analytics/CrovaGogumaRankTab.jsx`:
```jsx
import { useMemo, useState } from 'react';
import { calcCrovaGogumaFreq } from '../../../utils/playerAnalyticsUtils';

export default function CrovaGogumaRankTab({ gameRecords, C }) {
  const [scope, setScope] = useState('all');  // 'all' | 'recent3'

  const filtered = useMemo(() => {
    if (!gameRecords) return [];
    if (scope === 'all') return gameRecords;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const cutoffStr = cutoff.toISOString().substring(0, 10);
    return gameRecords.filter(gr => gr.gameDate && gr.gameDate >= cutoffStr);
  }, [gameRecords, scope]);

  const freq = useMemo(() => calcCrovaGogumaFreq(filtered), [filtered]);

  const crovaTop = useMemo(() =>
    Object.entries(freq.crova)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 5)
  , [freq]);

  const gogumaTop = useMemo(() =>
    Object.entries(freq.goguma)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 5)
  , [freq]);

  const toggleBtn = (val, label) => ({
    padding: "6px 14px", borderRadius: 50, fontSize: 11, fontWeight: 600,
    background: scope === val ? C.accent : "transparent",
    color: scope === val ? C.black : C.gray,
    border: `1px solid ${scope === val ? C.accent : C.grayDarker}`,
    cursor: "pointer",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}>
        <button onClick={() => setScope('all')} style={toggleBtn('all')}>전체 누적</button>
        <button onClick={() => setScope('recent3')} style={toggleBtn('recent3')}>최근 3개월</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <RankCard title="🍀 크로바" rows={crovaTop} color="#22c55e" C={C} />
        <RankCard title="🍠 고구마" rows={gogumaTop} color="#f97316" C={C} />
      </div>
    </div>
  );
}

function RankCard({ title, rows, color, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>-</div>
      ) : rows.map((r, i) => (
        <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.name}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.count}회</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/CrovaGogumaRankTab.jsx
git commit -m "feat(analyticsV2): CrovaGogumaRankTab 🍀/🍠 랭킹 탭

전체 누적 / 최근 3개월 토글. 마스터FC 프리셋 전용.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 17: 신규 PlayerAnalytics.jsx 오케스트레이터 작성

기존 PlayerAnalytics.jsx를 **전면 재작성**. Legacy는 이미 Task 1에서 백업됨.

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx` (전면 재작성)

- [ ] **Step 1: 파일 전체 교체**

`src/components/dashboard/PlayerAnalytics.jsx` 내용을 다음으로 **완전 교체**:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import { fetchSheetData } from '../../services/sheetService';
import { getSettings, getEffectiveSettings } from '../../config/settings';
import { buildGameRecordsFromLogs } from '../../utils/gameRecordBuilder';
import { calcDefenseStats, calcWinContribution, calcWinStatsFromPointLog } from '../../utils/gameStateAnalyzer';

import PlayerCardTab from './analytics/PlayerCardTab';
import HallOfFameTab from './analytics/HallOfFameTab';
import SynergyMatrixTab from './analytics/SynergyMatrixTab';
import GoldenTrioTab from './analytics/GoldenTrioTab';
import AwardsTab from './analytics/AwardsTab';
import CrovaGogumaRankTab from './analytics/CrovaGogumaRankTab';

export default function PlayerAnalytics({ teamName, teamMode, initialTab, isAdmin }) {
  const isSoccer = teamMode === "축구";
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState(null);
  const [events, setEvents] = useState(null);
  const [playerLog, setPlayerLog] = useState(null);
  const [playerGameLogs, setPlayerGameLogs] = useState([]);
  const [matchLogs, setMatchLogs] = useState([]);
  const [gameRecords, setGameRecords] = useState([]);
  const [tab, setTab] = useState(initialTab || "playercard");

  useEffect(() => {
    const s = getSettings(teamName);
    const sport = isSoccer ? '축구' : '풋살';
    setLoading(true);
    Promise.all([
      AppSync.getPointLog(s.pointLogSheet).catch(() => []),
      AppSync.getPlayerLog(s.playerLogSheet).catch(() => []),
      fetchSheetData().catch(() => null),
      AppSync.getMatchLog({ sport }).catch(() => ({ rows: [] })),
      AppSync.getEventLog({ sport }).catch(() => ({ rows: [] })),
      AppSync.getPlayerGameLog({ sport }).catch(() => ({ rows: [] })),
    ]).then(([evts, plog, sheetData, matchRes, eventRes, pgRes]) => {
      setEvents(evts || []);
      setPlayerLog(plog || []);
      if (sheetData) setMembers(sheetData.players);
      const mRows = matchRes?.rows || [];
      const eRows = eventRes?.rows || [];
      setMatchLogs(mRows);
      setPlayerGameLogs(pgRes?.rows || []);
      setGameRecords(buildGameRecordsFromLogs(mRows, eRows));
    }).finally(() => setLoading(false));
  }, [teamName, isSoccer]);

  const settings = useMemo(() => getEffectiveSettings(teamName, isSoccer ? '축구' : '풋살'), [teamName, isSoccer]);
  const showCrovaGoguma = !isSoccer && settings?.useCrovaGoguma === true && teamName === '마스터FC';

  const defenseStats = useMemo(() => gameRecords.length > 0 ? calcDefenseStats(gameRecords) : {}, [gameRecords]);
  const winStats = useMemo(() => {
    if (gameRecords.length > 0) return calcWinContribution(gameRecords);
    if (isSoccer && events && events.length > 0) return calcWinStatsFromPointLog(events);
    return {};
  }, [gameRecords, isSoccer, events]);

  const tabs = [
    { key: "playercard", label: "선수카드" },
    { key: "halloffame", label: "명예의전당" },
    { key: "synergy", label: "시너지매트릭스" },
    { key: "trio", label: "골든트리오" },
    { key: "awards", label: "어워드" },
    showCrovaGoguma && { key: "crovaguma", label: "🍀/🍠" },
  ].filter(Boolean);

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflow: "auto", marginBottom: 14, paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px", borderRadius: 50, fontSize: 11, fontWeight: 600,
              background: tab === t.key ? C.accent : "transparent",
              color: tab === t.key ? C.black : C.gray,
              border: `1px solid ${tab === t.key ? C.accent : C.grayDarker}`,
              whiteSpace: "nowrap", cursor: "pointer",
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "playercard" && (
        <PlayerCardTab
          playerLog={playerLog || []} members={members}
          defenseStats={defenseStats} winStats={winStats} gameRecords={gameRecords}
          playerGameLogs={playerGameLogs} matchLogs={matchLogs} C={C}
        />
      )}
      {tab === "halloffame" && (
        <HallOfFameTab playerGameLogs={playerGameLogs} matchLogs={matchLogs} C={C} />
      )}
      {tab === "synergy" && <SynergyMatrixTab matchLogs={matchLogs} C={C} />}
      {tab === "trio" && <GoldenTrioTab matchLogs={matchLogs} C={C} />}
      {tab === "awards" && <AwardsTab playerGameLogs={playerGameLogs} C={C} />}
      {tab === "crovaguma" && showCrovaGoguma && (
        <CrovaGogumaRankTab gameRecords={gameRecords} C={C} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공 (기존 import 관련 경고 없음)

- [ ] **Step 3: 전체 테스트 실행**

Run: `npm test`
Expected: 전체 테스트 통과

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(analyticsV2): PlayerAnalytics 신규 오케스트레이터

6개 탭(선수카드/명예의전당/시너지매트릭스/골든트리오/어워드/🍀🍠).
통합 로그(로그_이벤트/로그_선수경기/로그_매치) 병렬 로드.
마스터FC 조건부 🍀/🍠 탭.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 18: 수동 검증 (dev 서버 확인)

- [ ] **Step 1: dev 서버 시작**

Run: `npm run dev`
브라우저에서 앱 접속.

- [ ] **Step 2: 분석탭 진입 후 각 탭 확인**

체크리스트:
- [ ] 선수카드: 레이더/PR표/트렌드 라인차트/연속기록 섹션이 나타남
- [ ] 명예의전당: PR 4종 + 월별 랭킹 3열 (득점/어시/승률)
- [ ] 시너지매트릭스: N×N 격자, 셀 hover시 상세 정보 박스 표시
- [ ] 골든트리오: TOP5 카드 목록, 승률% 표시
- [ ] 어워드: 불꽃/수호신/자책 3개 카드
- [ ] 🍀/🍠 랭킹: (마스터FC 로그인 시) 탭 나타남, 전체/최근3개월 토글 동작
- [ ] 🍀/🍠 랭킹: (표준풋살 등 다른 팀) 탭 자체가 안 보임

- [ ] **Step 3: 데이터 부족 상황 확인**

- [ ] 데이터가 거의 없는 신규 팀 계정으로 접속 → 각 탭이 "데이터 없음" 안내 또는 빈 상태로 정상 표시

---

## Self-Review

### 스펙 커버리지 체크

| 스펙 요구사항 | 구현 위치 |
|---|---|
| ① 트렌드 라인 | Task 3 (calcTrends) + Task 11 (PlayerCardTab TrendLineChart) |
| ② 연속 기록 | Task 4 (calcStreaks) + Task 11 (PlayerCardTab) |
| ③ PR | Task 5 (calcPersonalRecords) + Task 12 (HallOfFameTab) |
| ④ 월별 랭킹 | Task 6 (calcMonthlyRanking) + Task 12 (HallOfFameTab) |
| ⑤ 시너지 매트릭스 | Task 7 (calcSynergyMatrix) + Task 13 (SynergyMatrixTab) |
| ⑥ 골든 트리오 | Task 8 (calcGoldenTrio) + Task 14 (GoldenTrioTab) |
| ⑧ 불꽃 / ⑨ 수호신 / ⑪ 자책 | Task 9 (calcAwards) + Task 15 (AwardsTab) |
| ⑫ 🍀/🍠 랭킹 | Task 16 (CrovaGogumaRankTab) |
| Legacy 백업 | Task 1 |
| 오케스트레이터 | Task 17 |
| 수동 검증 | Task 18 |

### 네이밍 일관성
- 순수 함수: `calcXxx` ✓
- 탭 컴포넌트: `XxxTab` ✓
- Props: `playerGameLogs` / `matchLogs` / `playerLog`(legacy) 구분 일관 ✓

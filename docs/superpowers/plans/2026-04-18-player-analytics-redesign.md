# 선수 분석 탭 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 분석 탭 8개의 지표 유의미성을 개선하고 그룹 헤더로 우선순위(실력>구성>재미)를 드러낸다.

**Architecture:** 신규 유틸 파일 `src/utils/playerAnalyticsUtils.js`에 순수 계산 함수를 모아 TDD로 작성 후, 각 탭 컴포넌트가 유틸을 소비하는 방식. 기존 `gameStateAnalyzer.js`는 건드리지 않고 새 유틸만 추가 (회귀 위험 축소).

**Tech Stack:** React 19 · Vite 8 · Vitest (jsdom) · Firebase RTDB · Google Apps Script

**Spec:** `docs/superpowers/specs/2026-04-18-player-analytics-redesign-design.md`

**선행 태스크 (이 플랜 밖):**
1. 4/16 경기 복구 (Firebase → saveState + finalizeState)
2. `handleFinalize` 에러 surfacing + AppSync.saveState 경로 복원

위 두 가지는 별도 플랜에서 처리. 본 플랜은 UI/지표 로직만 다룸.

---

## File Structure

```
src/
  utils/
    playerAnalyticsUtils.js        ← NEW (모든 신규 계산 함수)
    __tests__/
      playerAnalyticsUtils.test.js ← NEW
    gameStateAnalyzer.js           ← 변경 없음
  components/dashboard/
    PlayerAnalytics.jsx            ← 탭 그룹 헤더, 배너 라벨, 케미→콤비 개명, 크로바 분기
    SynergyTab.jsx                 ← tie-break + 라운드 라벨
    PlayerCardTab.jsx              ← 추세·GK/필드·상대위치·출석률 추가
    TimePatternTab.jsx             ← 라운드 미드포인트 로직으로 교체
```

**책임 경계:**
- `playerAnalyticsUtils.js`: 순수 계산 (React/DOM 무관). 테스트 가능성 최우선
- 탭 컴포넌트: 데이터 읽기, 유틸 호출, 렌더링만
- `gameStateAnalyzer.js`: 기존 로직 유지 (parseGameHistory, calcSynergy 등은 재사용)

---

## Task 1: 유틸 파일 스캐폴드 + 테스트 인프라

**Files:**
- Create: `src/utils/playerAnalyticsUtils.js`
- Create: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 빈 유틸 파일 작성**

Write `src/utils/playerAnalyticsUtils.js`:
```js
// 선수 분석 탭 재설계용 순수 계산 함수 모음.
// React/DOM 의존성 없음 — 테스트 가능성 최우선.
```

- [ ] **Step 2: 테스트 파일 작성 (스모크 테스트)**

Write `src/utils/__tests__/playerAnalyticsUtils.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('playerAnalyticsUtils', () => {
  it('module loads', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (1 test)

- [ ] **Step 4: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "chore(analytics): 선수분석 유틸 스캐폴드"
```

---

## Task 2: calcTeamRanking + calcCrovaGogumaFreq

일반화된 일별 팀 순위 계산. `useCrovaGoguma=false` 팀도 1/꼴찌 판정 가능.

**Files:**
- Modify: `src/utils/playerAnalyticsUtils.js`
- Modify: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 실패 테스트 작성 (calcTeamRanking)**

Add to test file:
```js
import { calcTeamRanking, calcCrovaGogumaFreq } from '../playerAnalyticsUtils';

describe('calcTeamRanking', () => {
  it('3팀 세션에서 승-득실차-득점 순 랭크', () => {
    const record = {
      gameDate: '2026-03-20',
      teamNames: ['A', 'B', 'C'],
      matches: [
        { homeIdx: 0, awayIdx: 1, homeScore: 3, awayScore: 1, isExtra: false },
        { homeIdx: 1, awayIdx: 2, homeScore: 2, awayScore: 2, isExtra: false },
        { homeIdx: 0, awayIdx: 2, homeScore: 2, awayScore: 0, isExtra: false },
      ],
    };
    expect(calcTeamRanking(record)).toEqual(['A', 'B', 'C']);
  });

  it('isExtra 경기는 순위 계산에서 제외', () => {
    const record = {
      gameDate: '2026-03-20',
      teamNames: ['A', 'B'],
      matches: [
        { homeIdx: 0, awayIdx: 1, homeScore: 1, awayScore: 0, isExtra: false },
        { homeIdx: 0, awayIdx: 1, homeScore: 0, awayScore: 5, isExtra: true },
      ],
    };
    expect(calcTeamRanking(record)).toEqual(['A', 'B']);
  });

  it('동점 시 원래 순서 유지 (팀 이름 순)', () => {
    const record = {
      gameDate: '2026-03-20',
      teamNames: ['A', 'B'],
      matches: [{ homeIdx: 0, awayIdx: 1, homeScore: 1, awayScore: 1, isExtra: false }],
    };
    const ranking = calcTeamRanking(record);
    expect(ranking.length).toBe(2);
    expect(ranking).toContain('A');
    expect(ranking).toContain('B');
  });
});

describe('calcCrovaGogumaFreq', () => {
  it('선수별 1위/꼴찌 팀 소속 횟수 집계', () => {
    const records = [
      {
        gameDate: '2026-03-20',
        teamNames: ['A', 'B'],
        teams: [['알렉스', '본'], ['카이', '딘']],
        matches: [{ homeIdx: 0, awayIdx: 1, homeScore: 3, awayScore: 0, isExtra: false }],
      },
      {
        gameDate: '2026-03-27',
        teamNames: ['A', 'B'],
        teams: [['알렉스'], ['본']],
        matches: [{ homeIdx: 0, awayIdx: 1, homeScore: 0, awayScore: 2, isExtra: false }],
      },
    ];
    const result = calcCrovaGogumaFreq(records);
    expect(result.crova['알렉스']).toBe(1); // 3/20 1위
    expect(result.crova['본']).toBe(2);     // 3/20 1위 + 3/27 1위 (본이 B팀이었으니)
    expect(result.goguma['카이']).toBe(1);  // 3/20 꼴찌
    expect(result.goguma['딘']).toBe(1);    // 3/20 꼴찌
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: FAIL — "calcTeamRanking is not a function"

- [ ] **Step 3: 구현**

Add to `src/utils/playerAnalyticsUtils.js`:
```js
export function calcTeamRanking(record) {
  const { teamNames, matches } = record;
  const stats = {};
  teamNames.forEach(name => {
    stats[name] = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
  });
  (matches || []).forEach(m => {
    if (m.isExtra) return;
    const home = teamNames[m.homeIdx];
    const away = teamNames[m.awayIdx];
    if (!home || !away) return;
    stats[home].gf += m.homeScore;
    stats[home].ga += m.awayScore;
    stats[away].gf += m.awayScore;
    stats[away].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { stats[home].wins++; stats[away].losses++; }
    else if (m.homeScore < m.awayScore) { stats[away].wins++; stats[home].losses++; }
    else { stats[home].draws++; stats[away].draws++; }
  });
  return teamNames.slice().sort((a, b) => {
    const sa = stats[a], sb = stats[b];
    if (sb.wins !== sa.wins) return sb.wins - sa.wins;
    const da = sa.gf - sa.ga, db = sb.gf - sb.ga;
    if (db !== da) return db - da;
    return sb.gf - sa.gf;
  });
}

export function calcCrovaGogumaFreq(gameRecords) {
  const crova = {}, goguma = {};
  (gameRecords || []).forEach(record => {
    const ranking = calcTeamRanking(record);
    if (ranking.length === 0) return;
    const firstTeam = ranking[0];
    const lastTeam = ranking[ranking.length - 1];
    const firstIdx = record.teamNames.indexOf(firstTeam);
    const lastIdx = record.teamNames.indexOf(lastTeam);
    (record.teams?.[firstIdx] || []).forEach(p => {
      crova[p] = (crova[p] || 0) + 1;
    });
    if (firstIdx !== lastIdx) {
      (record.teams?.[lastIdx] || []).forEach(p => {
        goguma[p] = (goguma[p] || 0) + 1;
      });
    }
  });
  return { crova, goguma };
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (기존 1 + 신규 4 = 5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "feat(analytics): calcTeamRanking + calcCrovaGogumaFreq"
```

---

## Task 3: calcRoundMidpointTimePattern

라운드 미드포인트 기준 전반/후반 분류. 기존 "첫 골 + 1시간" 로직 대체.

**Files:**
- Modify: `src/utils/playerAnalyticsUtils.js`
- Modify: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Add to test file:
```js
import { calcRoundMidpointTimePattern } from '../playerAnalyticsUtils';

describe('calcRoundMidpointTimePattern', () => {
  it('10라운드: 0~4는 전반, 5~9는 후반', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: Array.from({ length: 10 }, (_, i) => ({ matchId: `m${i}`, isExtra: false })),
      events: [
        { type: 'goal', matchId: 'm0', player: '서라현' },
        { type: 'goal', matchId: 'm4', player: '서라현' },
        { type: 'goal', matchId: 'm5', player: '서라현' },
        { type: 'goal', matchId: 'm9', player: '조재상' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 2, late: 1, total: 3 });
    expect(result['조재상']).toEqual({ early: 0, late: 1, total: 1 });
  });

  it('isExtra 라운드는 카운트 제외', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: [
        { matchId: 'm0', isExtra: false },
        { matchId: 'm1', isExtra: false },
        { matchId: 'm2', isExtra: true },
      ],
      events: [
        { type: 'goal', matchId: 'm0', player: '서라현' },
        { type: 'goal', matchId: 'm2', player: '서라현' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 1, late: 0, total: 1 });
  });

  it('9라운드 (홀수): 0~3 전반, 4~8 후반', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: Array.from({ length: 9 }, (_, i) => ({ matchId: `m${i}`, isExtra: false })),
      events: [
        { type: 'goal', matchId: 'm3', player: '서라현' },
        { type: 'goal', matchId: 'm4', player: '서라현' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 1, late: 1, total: 2 });
  });

  it('goal 아닌 이벤트는 무시', () => {
    const records = [{
      gameDate: '2026-03-20',
      matches: [{ matchId: 'm0', isExtra: false }, { matchId: 'm1', isExtra: false }],
      events: [
        { type: 'ownGoal', matchId: 'm0', player: '서라현' },
        { type: 'goal', matchId: 'm0', player: '서라현' },
      ],
    }];
    const result = calcRoundMidpointTimePattern(records);
    expect(result['서라현']).toEqual({ early: 1, late: 0, total: 1 });
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: FAIL — "calcRoundMidpointTimePattern is not a function"

- [ ] **Step 3: 구현**

Add to `src/utils/playerAnalyticsUtils.js`:
```js
export function calcRoundMidpointTimePattern(gameRecords) {
  const stats = {};
  (gameRecords || []).forEach(record => {
    const mainMatches = (record.matches || []).filter(m => !m.isExtra);
    const N = mainMatches.length;
    if (N === 0) return;
    const midpoint = Math.floor(N / 2);
    const matchIndex = {};
    mainMatches.forEach((m, i) => { matchIndex[m.matchId] = i; });
    (record.events || []).forEach(ev => {
      if (ev.type !== 'goal') return;
      const idx = matchIndex[ev.matchId];
      if (idx === undefined) return;
      const player = ev.player;
      if (!stats[player]) stats[player] = { early: 0, late: 0, total: 0 };
      if (idx < midpoint) stats[player].early++;
      else stats[player].late++;
      stats[player].total++;
    });
  });
  return stats;
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "feat(analytics): calcRoundMidpointTimePattern 라운드 미드포인트 기준"
```

---

## Task 4: sortSynergyWithTieBreak + classifyTimeSlot

시너지 tie-break 규칙 + 시간대 태그 분류 (독립적인 짧은 2함수).

**Files:**
- Modify: `src/utils/playerAnalyticsUtils.js`
- Modify: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Add to test file:
```js
import { sortSynergyWithTieBreak, classifyTimeSlot } from '../playerAnalyticsUtils';

describe('sortSynergyWithTieBreak', () => {
  it('best 방향: 승률 desc → 라운드수 desc → 이름 asc', () => {
    const partners = [
      { name: '다연', games: 5, winRate: 0.5 },
      { name: '가연', games: 9, winRate: 0.5 },
      { name: '나연', games: 9, winRate: 0.5 },
      { name: '라연', games: 9, winRate: 0.7 },
    ];
    const sorted = sortSynergyWithTieBreak(partners, 'best');
    expect(sorted.map(p => p.name)).toEqual(['라연', '가연', '나연', '다연']);
  });

  it('worst 방향: 승률 asc → 라운드수 desc → 이름 asc', () => {
    const partners = [
      { name: '다연', games: 5, winRate: 0.3 },
      { name: '가연', games: 9, winRate: 0.3 },
      { name: '나연', games: 3, winRate: 0.1 },
    ];
    const sorted = sortSynergyWithTieBreak(partners, 'worst');
    expect(sorted.map(p => p.name)).toEqual(['나연', '가연', '다연']);
  });
});

describe('classifyTimeSlot', () => {
  it('초반 60% 이상: 초반형', () => {
    expect(classifyTimeSlot(6, 4, 10)).toEqual({ label: '초반형', emoji: '🔥' });
  });

  it('초반 40% 이하: 후반형', () => {
    expect(classifyTimeSlot(4, 6, 10)).toEqual({ label: '후반형', emoji: '⚡' });
  });

  it('초반 50%: 균형형', () => {
    expect(classifyTimeSlot(5, 5, 10)).toEqual({ label: '균형형', emoji: '⚖️' });
  });

  it('total<5: 샘플 부족 (null)', () => {
    expect(classifyTimeSlot(2, 2, 4)).toBe(null);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: FAIL — "sortSynergyWithTieBreak is not a function"

- [ ] **Step 3: 구현**

Add to `src/utils/playerAnalyticsUtils.js`:
```js
export function sortSynergyWithTieBreak(partners, direction) {
  const arr = partners.slice();
  arr.sort((a, b) => {
    const rateDiff = direction === 'worst' ? a.winRate - b.winRate : b.winRate - a.winRate;
    if (rateDiff !== 0) return rateDiff;
    if (b.games !== a.games) return b.games - a.games;
    return a.name.localeCompare(b.name, 'ko');
  });
  return arr;
}

export function classifyTimeSlot(early, late, total) {
  if (total < 5) return null;
  const earlyRate = early / total;
  if (earlyRate >= 0.6) return { label: '초반형', emoji: '🔥' };
  if (earlyRate <= 0.4) return { label: '후반형', emoji: '⚡' };
  return { label: '균형형', emoji: '⚖️' };
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (15 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "feat(analytics): sortSynergyWithTieBreak + classifyTimeSlot"
```

---

## Task 5: calcTrend

최근 5세션 이동평균 vs 시즌 누적 평균 비교.

**Files:**
- Modify: `src/utils/playerAnalyticsUtils.js`
- Modify: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Add to test file:
```js
import { calcTrend } from '../playerAnalyticsUtils';

describe('calcTrend', () => {
  it('최근 5세션 평균이 시즌 평균의 1.1배 이상이면 상승세', () => {
    const sessions = [1, 1, 1, 1, 1, 3, 3, 3, 3, 3]; // 시즌 avg 2, 최근 5 avg 3 → 1.5x
    expect(calcTrend(sessions)).toEqual({ direction: 'up', icon: '🔺', label: '상승세' });
  });

  it('최근 5세션 평균이 시즌 평균의 0.9배 이하이면 하락세', () => {
    const sessions = [5, 5, 5, 5, 5, 1, 1, 1, 1, 1]; // 시즌 avg 3, 최근 5 avg 1 → 0.33x
    expect(calcTrend(sessions)).toEqual({ direction: 'down', icon: '🔻', label: '하락세' });
  });

  it('사이면 유지', () => {
    const sessions = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]; // 동일
    expect(calcTrend(sessions)).toEqual({ direction: 'flat', icon: '➡️', label: '유지' });
  });

  it('세션 5개 미만: null', () => {
    expect(calcTrend([1, 2, 3])).toBe(null);
  });

  it('시즌 평균 0 (모두 0): 유지', () => {
    expect(calcTrend([0, 0, 0, 0, 0])).toEqual({ direction: 'flat', icon: '➡️', label: '유지' });
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

Add to `src/utils/playerAnalyticsUtils.js`:
```js
export function calcTrend(sessions) {
  if (!sessions || sessions.length < 5) return null;
  const seasonAvg = sessions.reduce((a, b) => a + b, 0) / sessions.length;
  const recent = sessions.slice(-5);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (seasonAvg === 0) return { direction: 'flat', icon: '➡️', label: '유지' };
  const ratio = recentAvg / seasonAvg;
  if (ratio >= 1.1) return { direction: 'up', icon: '🔺', label: '상승세' };
  if (ratio <= 0.9) return { direction: 'down', icon: '🔻', label: '하락세' };
  return { direction: 'flat', icon: '➡️', label: '유지' };
}
```

- [ ] **Step 4: 테스트 실행**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (20 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "feat(analytics): calcTrend 5세션 이동평균 vs 시즌 평균"
```

---

## Task 6: calcRelativePosition + calcAttendance

팀 평균 대비 상대 위치 + 세션 출석률.

**Files:**
- Modify: `src/utils/playerAnalyticsUtils.js`
- Modify: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Add to test file:
```js
import { calcRelativePosition, calcAttendance } from '../playerAnalyticsUtils';

describe('calcRelativePosition', () => {
  it('팀 평균보다 높으면 양수 %', () => {
    expect(calcRelativePosition(1.5, [1.0, 1.0, 2.0])).toBe(13); // avg 1.333, (1.5/1.333-1)*100 = 12.5 → round
  });

  it('팀 평균보다 낮으면 음수 %', () => {
    expect(calcRelativePosition(0.5, [1.0, 1.0, 1.0])).toBe(-50);
  });

  it('팀 평균 0: 0 반환 (div-by-zero 방어)', () => {
    expect(calcRelativePosition(1, [0, 0, 0])).toBe(0);
  });

  it('팀 값 리스트 비어있으면 0', () => {
    expect(calcRelativePosition(1, [])).toBe(0);
  });
});

describe('calcAttendance', () => {
  it('전체 세션 중 참석 세션 비율', () => {
    const records = [
      { gameDate: '2026-03-20', teams: [['알렉스', '본'], ['카이']] },
      { gameDate: '2026-03-27', teams: [['알렉스'], ['본']] },
      { gameDate: '2026-04-03', teams: [['카이']] },
    ];
    const result = calcAttendance(records, '알렉스');
    expect(result).toEqual({ attended: 2, total: 3, rate: 67 });
  });

  it('전체 세션 없음: 0', () => {
    expect(calcAttendance([], '알렉스')).toEqual({ attended: 0, total: 0, rate: 0 });
  });

  it('한 번도 참석 안 함: 0%', () => {
    const records = [
      { gameDate: '2026-03-20', teams: [['본']] },
    ];
    expect(calcAttendance(records, '알렉스')).toEqual({ attended: 0, total: 1, rate: 0 });
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

Add to `src/utils/playerAnalyticsUtils.js`:
```js
export function calcRelativePosition(playerValue, teamValues) {
  if (!teamValues || teamValues.length === 0) return 0;
  const avg = teamValues.reduce((a, b) => a + b, 0) / teamValues.length;
  if (avg === 0) return 0;
  return Math.round(((playerValue / avg) - 1) * 100);
}

export function calcAttendance(gameRecords, playerName) {
  const total = (gameRecords || []).length;
  if (total === 0) return { attended: 0, total: 0, rate: 0 };
  let attended = 0;
  gameRecords.forEach(record => {
    const allPlayers = (record.teams || []).flat();
    if (allPlayers.includes(playerName)) attended++;
  });
  return { attended, total, rate: Math.round((attended / total) * 100) };
}
```

- [ ] **Step 4: 테스트 실행**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (27 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "feat(analytics): calcRelativePosition + calcAttendance"
```

---

## Task 7: calcComboEfficiency

득점 조합 효율 = 조합 득점 횟수 / 같이 뛴 라운드 수.

**Files:**
- Modify: `src/utils/playerAnalyticsUtils.js`
- Modify: `src/utils/__tests__/playerAnalyticsUtils.test.js`

- [ ] **Step 1: 실패 테스트 작성**

Add to test file:
```js
import { calcComboEfficiency } from '../playerAnalyticsUtils';

describe('calcComboEfficiency', () => {
  it('pairCount와 synergyData 병합해서 효율% 계산', () => {
    const pairCount = { 'A+B': 5, 'C+D': 2, 'A+C': 1 };
    const synergyData = {
      A: { B: { games: 10 }, C: { games: 5 } },
      B: { A: { games: 10 } },
      C: { A: { games: 5 }, D: { games: 8 } },
      D: { C: { games: 8 } },
    };
    const result = calcComboEfficiency(pairCount, synergyData);
    expect(result).toContainEqual({ pair: 'A+B', goals: 5, games: 10, efficiency: 50 });
    expect(result).toContainEqual({ pair: 'C+D', goals: 2, games: 8, efficiency: 25 });
  });

  it('같이 뛴 라운드 < 3이면 제외', () => {
    const pairCount = { 'A+B': 10 };
    const synergyData = {
      A: { B: { games: 2 } },
      B: { A: { games: 2 } },
    };
    expect(calcComboEfficiency(pairCount, synergyData)).toEqual([]);
  });

  it('synergyData에 페어 없음: 제외', () => {
    const pairCount = { 'A+B': 5 };
    const synergyData = { A: {}, B: {} };
    expect(calcComboEfficiency(pairCount, synergyData)).toEqual([]);
  });

  it('효율 desc → 횟수 desc → 이름 asc 정렬', () => {
    const pairCount = { '가나+나가': 3, '다라+라다': 3, '마바+바마': 4 };
    const synergyData = {
      가나: { 나가: { games: 10 } }, 나가: { 가나: { games: 10 } },
      다라: { 라다: { games: 10 } }, 라다: { 다라: { games: 10 } },
      마바: { 바마: { games: 20 } }, 바마: { 마바: { games: 20 } },
    };
    const result = calcComboEfficiency(pairCount, synergyData);
    // 가나+나가: 30%, 다라+라다: 30%, 마바+바마: 20%
    // 동률 시 goals desc → 가나+나가와 다라+라다 모두 goals=3이니 이름 asc
    expect(result[0].pair).toBe('가나+나가');
    expect(result[1].pair).toBe('다라+라다');
    expect(result[2].pair).toBe('마바+바마');
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

Add to `src/utils/playerAnalyticsUtils.js`:
```js
export function calcComboEfficiency(pairCount, synergyData) {
  const out = [];
  Object.entries(pairCount || {}).forEach(([pair, goals]) => {
    const [a, b] = pair.split('+');
    const games = synergyData?.[a]?.[b]?.games ?? synergyData?.[b]?.[a]?.games ?? 0;
    if (games < 3) return;
    out.push({ pair, goals, games, efficiency: Math.round((goals / games) * 100) });
  });
  out.sort((x, y) => {
    if (y.efficiency !== x.efficiency) return y.efficiency - x.efficiency;
    if (y.goals !== x.goals) return y.goals - x.goals;
    return x.pair.localeCompare(y.pair, 'ko');
  });
  return out;
}
```

- [ ] **Step 4: 테스트 실행**

Run: `npx vitest run src/utils/__tests__/playerAnalyticsUtils.test.js`
Expected: PASS (31 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/playerAnalyticsUtils.js src/utils/__tests__/playerAnalyticsUtils.test.js
git commit -m "feat(analytics): calcComboEfficiency"
```

---

## Task 8: SynergyTab 통합 (tie-break + 라운드 라벨)

**Files:**
- Modify: `src/components/dashboard/SynergyTab.jsx`

- [ ] **Step 1: 현재 파일 읽기**

Read: `src/components/dashboard/SynergyTab.jsx` (58 lines)

- [ ] **Step 2: import 추가 및 정렬 교체**

Edit: replace line 13–22 block (the `partners` useMemo + top5/bottom5 slicing):

Before:
```js
const partners = useMemo(() => {
  return Object.entries(synergyData[selected])
    .filter(([, s]) => s.games >= 2)
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.winRate - a.winRate);
}, [selected, synergyData]);

const top5 = partners.slice(0, 5);
const bottom5 = [...partners].sort((a, b) => a.winRate - b.winRate).slice(0, 5);
```

After:
```js
import { sortSynergyWithTieBreak } from '../../utils/playerAnalyticsUtils';
// (이 import는 파일 상단의 기존 import 블록 옆에 추가)

const partners = useMemo(() => {
  if (!synergyData[selected]) return [];
  return Object.entries(synergyData[selected])
    .filter(([, s]) => s.games >= 2)
    .map(([name, s]) => ({ name, ...s }));
}, [selected, synergyData]);

const top5 = useMemo(() => sortSynergyWithTieBreak(partners, 'best').slice(0, 5), [partners]);
const bottom5 = useMemo(() => sortSynergyWithTieBreak(partners, 'worst').slice(0, 5), [partners]);
```

- [ ] **Step 3: 행 라벨 "N경기" → "N라운드 중"으로 변경**

Inside the list rendering (rows showing "N경기 X승 Y무 Z패"), change the display text. Find the JSX around line 35–50 that renders each partner row. The exact string currently reads like `{p.games}경기 {p.wins}승 {p.draws}무 {p.losses}패`. Replace with:
```jsx
{p.games}라운드 중 {p.wins}승 {p.draws}무 {p.losses}패
```

If there are multiple occurrences (Best and Worst), change both.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공 (no TypeScript/import errors). SynergyTab 정상 컴파일.

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/SynergyTab.jsx
git commit -m "feat(synergy): tie-break 규칙 + 라운드 단위 라벨"
```

---

## Task 9: PlayerAnalytics 배너 + 탭 그룹 헤더

"N세션 / 총 N라운드" 배너 + 3개 그룹 헤더.

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx`

- [ ] **Step 1: 배너 라벨 변경**

Read: `src/components/dashboard/PlayerAnalytics.jsx` around lines 600–603 (the banner).

Before:
```jsx
앱 기록 {gameRecordsSummary.count}경기 기준 ({gameRecordsSummary.from} ~ {gameRecordsSummary.to}) · 수비력/승리기여/시너지는 앱 기록 경기만 분석
```

After:
```jsx
앱 기록 {gameRecordsSummary.count}세션 / 총 {gameRecordsSummary.totalRounds}라운드 기준 ({gameRecordsSummary.from} ~ {gameRecordsSummary.to}) · 수비력/승리기여/시너지는 앱 기록 경기만 분석
```

- [ ] **Step 2: gameRecordsSummary에 totalRounds 필드 추가**

Find where `gameRecordsSummary` is computed (grep for `gameRecordsSummary` in the same file — likely a `useMemo` around the top of the component). Add `totalRounds`:

```js
const gameRecordsSummary = useMemo(() => {
  if (!gameRecords || gameRecords.length === 0) return null;
  const dates = gameRecords.map(r => r.gameDate).sort();
  const totalRounds = gameRecords.reduce(
    (sum, r) => sum + (r.matches || []).filter(m => !m.isExtra).length,
    0,
  );
  return {
    count: gameRecords.length,
    totalRounds,
    from: dates[0],
    to: dates[dates.length - 1],
  };
}, [gameRecords]);
```

(If the existing object shape differs, adapt but keep `count/from/to` fields and add `totalRounds`.)

- [ ] **Step 3: 탭 그룹 헤더 추가**

Find the chip render block (uses `allTabs.map(...)` somewhere around line 320+). Replace single-row chip rendering with 3 grouped rows.

Before (approximate):
```jsx
<div className="..." style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
  {allTabs.map(t => (
    <button key={t.key} ...>{t.label}</button>
  ))}
</div>
```

After:
```jsx
{(() => {
  const groups = [
    { title: '개인 분석', keys: ['playercard', 'race', 'killer'] },
    { title: '조합 분석', keys: ['synergy', 'combo', 'combo2'] },
    { title: '재미', keys: ['crovaguma', 'timepattern'] },
  ];
  const rendered = new Set();
  return groups.map(g => {
    const tabsInGroup = allTabs.filter(t => g.keys.includes(t.key));
    if (tabsInGroup.length === 0) return null;
    tabsInGroup.forEach(t => rendered.add(t.key));
    return (
      <div key={g.title} style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 4, fontWeight: 600 }}>{g.title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabsInGroup.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: tab === t.key ? C.accent : C.cardLight,
                color: tab === t.key ? C.white : C.gray,
                border: `1px solid ${tab === t.key ? C.accent : C.grayDark}`,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    );
  }).concat(
    // 그룹에 속하지 않은 탭 (예: dualteam)은 하단에 별도 행
    allTabs.filter(t => !rendered.has(t.key)).length > 0 ? (
      <div key="_other" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {allTabs.filter(t => !rendered.has(t.key)).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: tab === t.key ? C.accent : C.cardLight,
              color: tab === t.key ? C.white : C.gray,
              border: `1px solid ${tab === t.key ? C.accent : C.grayDark}`,
            }}>
            {t.label}
          </button>
        ))}
      </div>
    ) : null,
  );
})()}
```

Note: the chip button styling should match whatever the existing code uses. Inspect the current `<button>` styles first and reuse them verbatim. If styles are extracted into a className or helper, reuse that instead of inlining.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공. 탭 칩 3개 그룹으로 렌더.

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(analytics): 탭 그룹 헤더 3개 + 배너 세션/라운드 단위"
```

---

## Task 10: 케미 → 득점콤비 개명 + 효율 표시

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx`

- [ ] **Step 1: allTabs의 chemistry 키를 combo2로 개명, 라벨 "득점콤비"**

Find `allTabs` array (around line 320–331). Change:
```js
{ key: "chemistry",   label: "케미" },
```
to:
```js
{ key: "combo2",      label: "득점콤비" },
```

**중요**: 기존 `combo`는 골든콤비이므로 다른 키(`combo2`)를 사용. 향후 외부 저장이 생길 경우 안전.

- [ ] **Step 2: chemistry 탭 렌더 조건을 combo2로 교체**

Grep inside PlayerAnalytics.jsx for `tab === "chemistry"`. 교체: `tab === "combo2"`.

- [ ] **Step 3: 효율 표시 로직 추가**

Find where `topChemistry` (from `analyzeData`) is rendered as a list. The current list shows `조재상+서라현 5회` style entries.

Before importing/computing efficiency data:
```js
// Add near other data calculations (analyzeData output)
import { calcComboEfficiency } from '../../utils/playerAnalyticsUtils';
import { calcSynergy } from '../../utils/gameStateAnalyzer';

const comboEfficiency = useMemo(() => {
  if (!gameRecords) return null;
  const synergyData = calcSynergy(gameRecords);
  // pairCount는 analyzeData() 내부의 계산 결과. export되어있지 않다면
  // analyzeData()를 수정해서 pairCount도 반환하도록 변경
  return calcComboEfficiency(analyzedData.pairCount || {}, synergyData);
}, [gameRecords, analyzedData]);
```

`analyzeData()`가 현재 `pairCount`를 export하지 않는다면, return 객체에 `pairCount`를 추가:
```js
return {
  goldenCombos, keeperKillers, topChemistry, keeperStats,
  pairCount,  // ← 추가
};
```

- [ ] **Step 4: 렌더 교체**

Replace the combo2 tab content block (formerly chemistry):

Before (approximate):
```jsx
{tab === "combo2" && topChemistry.map(c => (
  <div key={c.pair}>{c.pair} {c.count}회</div>
))}
```

After:
```jsx
{tab === "combo2" && (
  comboEfficiency === null ? (
    <div style={{ textAlign: 'center', padding: 20, color: C.gray }}>
      앱 기록 데이터 로딩 중...
    </div>
  ) : comboEfficiency.length === 0 ? (
    <div style={{ textAlign: 'center', padding: 20, color: C.gray }}>
      같이 뛴 라운드가 3회 이상인 페어가 없습니다
    </div>
  ) : (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>
        효율% = 득점 조합 횟수 / 같이 뛴 라운드 (최소 3라운드)
      </div>
      {comboEfficiency.slice(0, 15).map((c, i) => (
        <div key={c.pair} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.grayDarker}` }}>
          <span style={{ width: 30, color: C.gray, fontWeight: 700 }}>{i + 1}</span>
          <span style={{ flex: 1, color: C.white, fontWeight: 600, fontSize: 13 }}>{c.pair.replace('+', ' · ')}</span>
          <span style={{ width: 100, textAlign: 'right', fontSize: 11, color: C.gray }}>
            {c.goals}회 / {c.games}경기
          </span>
          <span style={{ width: 50, textAlign: 'right', fontWeight: 700, color: C.accent }}>
            {c.efficiency}%
          </span>
        </div>
      ))}
    </div>
  )
)}
```

- [ ] **Step 5: combo2 탭도 gameRecords lazy-load 대상에 추가**

Find the useEffect around line 279–291:
```js
if (tab === "playercard" || tab === "synergy" || tab === "timepattern") {
```
Change to:
```js
if (tab === "playercard" || tab === "synergy" || tab === "timepattern" || tab === "combo2") {
```

동일 조건으로 배너 노출도 combo2 포함시킴 (lines ~600):
```js
{(tab === "playercard" || tab === "synergy" || tab === "timepattern" || tab === "combo2") && gameRecordsSummary && (
```

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(analytics): 케미 → 득점콤비 개명 + 효율% 정렬"
```

---

## Task 11: 크로바/고구마 일반화 + UI 라벨 분기

gameRecords 기반 집계 + useCrovaGoguma 플래그에 따른 라벨 변화.

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx`

- [ ] **Step 1: getEffectiveSettings import 확인**

Check if `getEffectiveSettings` is already imported in PlayerAnalytics.jsx. If not, add:
```js
import { getEffectiveSettings } from '../../config/settings';
```

- [ ] **Step 2: useCrovaGoguma 플래그 읽기**

Near the top of the component, after `teamName` is available:
```js
const isCrovaGogumaMode = useMemo(() => {
  return getEffectiveSettings(teamName, '풋살').useCrovaGoguma === true;
}, [teamName]);
```

- [ ] **Step 3: crova/goguma 집계를 gameRecords 기반으로 교체**

Find `analyzeTeams()` (lines 148–240). Locate where `crovaTeams` / `gogumaTeams` are built from `playerLog` (lines 156–168). Remove that block and replace with:
```js
import { calcCrovaGogumaFreq } from '../../utils/playerAnalyticsUtils';

// analyzeTeams 내부 또는 PlayerAnalytics 내 별도 useMemo로:
const { crova: crovaFreq, goguma: gogumaFreq } = useMemo(() => {
  if (!gameRecords) return { crova: {}, goguma: {} };
  return calcCrovaGogumaFreq(gameRecords);
}, [gameRecords]);

// 기존 crovaTop / gogumaTop 계산은 crovaFreq/gogumaFreq 기반으로:
const crovaTop = useMemo(() =>
  Object.entries(crovaFreq)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
, [crovaFreq]);

const gogumaTop = useMemo(() =>
  Object.entries(gogumaFreq)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
, [gogumaFreq]);
```

- [ ] **Step 4: 크로바/고구마 탭도 gameRecords lazy-load 대상에 추가**

Update the useEffect from Task 10 (or add `crovaguma`):
```js
if (tab === "playercard" || tab === "synergy" || tab === "timepattern" || tab === "combo2" || tab === "crovaguma") {
```

- [ ] **Step 5: UI 라벨 분기**

Find the crova/goguma section (where `crovaTop` / `gogumaTop` are rendered, inside `tab === "crovaguma"` block). Change section headings:

Before:
```jsx
<h3>Best 크로바 TOP5</h3>
{/* ... */}
<h3>Best 고구마 TOP5</h3>
```

After:
```jsx
<h3>{isCrovaGogumaMode ? 'Best 🍀 크로바 TOP5' : '승리팀 단골 TOP5'}</h3>
{/* ... */}
<h3>{isCrovaGogumaMode ? 'Best 🍠 고구마 TOP5' : '꼴찌팀 단골 TOP5'}</h3>
```

(실제 heading JSX 구조에 맞춰 style 유지.)

- [ ] **Step 6: 탭 라벨도 분기**

In `allTabs` (around line 320+):

Before:
```js
!isSoccer && { key: "crovaguma",  label: "🍀/🍠" },
```

After:
```js
!isSoccer && { key: "crovaguma",  label: isCrovaGogumaMode ? "🍀/🍠" : "승·꼴" },
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(analytics): 크로바/고구마 gameRecords 기반 일반화 + UI 분기"
```

---

## Task 12: PlayerCardTab 4가지 지표 추가

**Files:**
- Modify: `src/components/dashboard/PlayerCardTab.jsx`

- [ ] **Step 1: 필요한 props 추가 검토**

PlayerCardTab에 `gameRecords` (출석률, 추세), `teamAverages` (상대 위치) 접근이 필요. 기존 props: `playerLog`, `members`, `defenseStats`, `winStats`, `C`.

PlayerAnalytics.jsx에서 PlayerCardTab 마운트 부분(라인 ~605–609)을 찾아:
```jsx
<PlayerCardTab playerLog={playerLog} members={...} defenseStats={defenseStats} winStats={winStats} gameRecords={gameRecords} C={C} />
```
추가 prop `gameRecords={gameRecords}` 전달.

- [ ] **Step 2: 유틸 import 추가**

At top of `src/components/dashboard/PlayerCardTab.jsx`:
```js
import { calcTrend, calcRelativePosition, calcAttendance } from '../../utils/playerAnalyticsUtils';
```

- [ ] **Step 3: props에 gameRecords 추가**

```js
export default function PlayerCardTab({ playerLog, members, defenseStats, winStats, gameRecords, C }) {
```

- [ ] **Step 4: 추세 계산 추가**

Inside component, after `getPlayerData`:
```js
const getTrend = (name, field) => {
  // field: 'goals' | 'assists'
  const playerSessions = playerLog.filter(p => p.name === name).sort((a, b) => a.date.localeCompare(b.date));
  const values = playerSessions.map(p => (p[field] || 0));
  return calcTrend(values);
};
```

- [ ] **Step 5: 상대 위치 계산**

```js
const getRelativePosition = (name) => {
  const s = playerSummary[name];
  if (!s || s.games === 0) return null;
  const allGoalsPerGame = players
    .map(n => playerSummary[n])
    .filter(ps => ps.games > 0)
    .map(ps => ps.goals / ps.games);
  const allAssistsPerGame = players
    .map(n => playerSummary[n])
    .filter(ps => ps.games > 0)
    .map(ps => ps.assists / ps.games);
  return {
    goals: calcRelativePosition(s.goals / s.games, allGoalsPerGame),
    assists: calcRelativePosition(s.assists / s.games, allAssistsPerGame),
  };
};
```

- [ ] **Step 6: 출석률 계산**

```js
const getAttendance = (name) => {
  return calcAttendance(gameRecords || [], name);
};
```

- [ ] **Step 7: GK/필드 분리 계산**

```js
const getGkFieldSplit = (name) => {
  const s = playerSummary[name];
  if (!s) return null;
  const keeperGames = s.keeperGames || 0;
  const fieldGames = s.games - keeperGames;
  return {
    keeper: { games: keeperGames, conceded: s.conceded || 0 },
    field: { games: fieldGames, goals: s.goals || 0, assists: s.assists || 0 },
  };
};
```

(현재 코드의 `s.conceded`는 keeper 경기 실점으로 가정. `defenseStats[name]`의 `fieldMatches/totalConceded`가 필드 출전 정보.)

- [ ] **Step 8: 렌더링에 4가지 추가 표시**

Player detail 테이블 아래(map이 끝난 곳)에 새 section 추가:
```jsx
{selected && (() => {
  const trendGoals = getTrend(selected, 'goals');
  const trendAssists = getTrend(selected, 'assists');
  const relPos = getRelativePosition(selected);
  const att = getAttendance(selected);
  const split = getGkFieldSplit(selected);
  return (
    <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: C.cardLight, fontSize: 11, lineHeight: 1.8 }}>
      {trendGoals && (
        <div>
          <span style={{ color: C.gray }}>득점 추세: </span>
          <span style={{ color: C.white, fontWeight: 600 }}>{trendGoals.icon} {trendGoals.label}</span>
        </div>
      )}
      {trendAssists && (
        <div>
          <span style={{ color: C.gray }}>도움 추세: </span>
          <span style={{ color: C.white, fontWeight: 600 }}>{trendAssists.icon} {trendAssists.label}</span>
        </div>
      )}
      {relPos && (
        <div>
          <span style={{ color: C.gray }}>팀 평균 대비: </span>
          <span style={{ color: relPos.goals >= 0 ? C.accent : '#ef4444', fontWeight: 600 }}>
            득점 {relPos.goals >= 0 ? '+' : ''}{relPos.goals}%
          </span>
          <span style={{ color: C.gray }}> · </span>
          <span style={{ color: relPos.assists >= 0 ? C.accent : '#ef4444', fontWeight: 600 }}>
            도움 {relPos.assists >= 0 ? '+' : ''}{relPos.assists}%
          </span>
        </div>
      )}
      <div>
        <span style={{ color: C.gray }}>출석: </span>
        <span style={{ color: C.white, fontWeight: 600 }}>{att.attended}/{att.total}세션 ({att.rate}%)</span>
      </div>
      {split && split.keeper.games > 0 && split.field.games > 0 && (
        <div>
          <span style={{ color: C.gray }}>GK/필드: </span>
          <span style={{ color: C.white }}>
            GK {split.keeper.games}경기 {split.keeper.conceded}실 · 필드 {split.field.games}경기 {split.field.goals}골 {split.field.assists}어시
          </span>
        </div>
      )}
    </div>
  );
})()}
```

- [ ] **Step 9: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 10: 커밋**

```bash
git add src/components/dashboard/PlayerCardTab.jsx src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(playercard): 추세·GK/필드·상대위치·출석률 4지표 추가"
```

---

## Task 13: TimePatternTab 라운드 미드포인트 재작성

**Files:**
- Modify: `src/components/dashboard/TimePatternTab.jsx`
- Modify: `src/components/dashboard/PlayerAnalytics.jsx` (데이터 소스 교체)

- [ ] **Step 1: PlayerAnalytics에서 새 함수 사용**

Find `timeStats` 계산부 in PlayerAnalytics.jsx (likely uses `calcTimePattern` from gameStateAnalyzer). Replace:

Before:
```js
import { calcTimePattern } from '../../utils/gameStateAnalyzer';
const timeStats = useMemo(() => gameRecords ? calcTimePattern(gameRecords) : {}, [gameRecords]);
```

After:
```js
import { calcRoundMidpointTimePattern } from '../../utils/playerAnalyticsUtils';
const timeStats = useMemo(() => gameRecords ? calcRoundMidpointTimePattern(gameRecords) : {}, [gameRecords]);
```

(오래된 `calcTimePattern` import는 이제 이 파일에서 사용 안 하면 제거. 다른 곳에서 쓰면 그대로 둠.)

- [ ] **Step 2: TimePatternTab 헤더 문구 변경**

In `src/components/dashboard/TimePatternTab.jsx`, line ~17:

Before:
```jsx
<div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>
  경기 시작 후 1시간 기준 전반/후반 분류 (2시간 경기 기준)
</div>
```

After:
```jsx
<div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>
  당일 총 라운드의 전반/후반 기준 분류 · 태그는 총 5골 이상부터
</div>
```

- [ ] **Step 3: classifyTimeSlot import + 태그 표시 추가**

At top:
```js
import { classifyTimeSlot } from '../../utils/playerAnalyticsUtils';
```

Inside the row map (each player), add a tag before the numeric cells:
```jsx
const tag = classifyTimeSlot(p.early, p.late, p.total);
// ... 렌더 내부
<span style={{ minWidth: 70, fontSize: 10, fontWeight: 700, color: tag ? '#fbbf24' : C.gray }}>
  {tag ? `${tag.emoji} ${tag.label}` : '샘플부족'}
</span>
```

(layout을 크게 바꾸지 말 것. 기존 row 구조 안에 한 span만 추가.)

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: 전체 테스트 재실행**

Run: `npx vitest run`
Expected: 모든 기존 테스트 + 신규 유틸 테스트 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/TimePatternTab.jsx src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(timepattern): 라운드 미드포인트 기반 재정의 + 태그"
```

---

## Task 14: 최종 통합 점검

**Files:** (변경 없음, 수동 QA)

- [ ] **Step 1: dev 서버 기동**

Run: `npm run dev`
Expected: `http://localhost:5173` 접근 가능.

- [ ] **Step 2: 선수 분석 탭 수동 점검**

브라우저에서 마스터FC → 선수 분석 탭 접근. 다음 8개 확인:
1. 개인 분석 / 조합 분석 / 재미 세 개 그룹 헤더 노출
2. 선수카드 탭: 추세/GK필드/상대위치/출석률 4지표 아래에 표시
3. 시즌레이스: 변경 없이 정상
4. 키퍼킬러: 변경 없이 정상
5. 시너지: 헤더 "N세션 / 총 N라운드", 행 "N라운드 중"
6. 골든콤비: 변경 없이 정상
7. 득점콤비 (케미 아님): `조재상 · 서라현  5회 / 12경기  42%` 형식
8. 크로바/고구마: 마스터FC는 🍀/🍠 라벨, TOP5 이름·빈도 정상
9. 시간대: "당일 총 라운드의 전반/후반" 헤더 + 초반형/후반형/균형형 태그

- [ ] **Step 3: useCrovaGoguma=false 팀 확인**

다른 팀(useCrovaGoguma=false)으로 전환해 선수 분석 탭 확인:
- 탭 라벨이 "🍀/🍠" 대신 "승·꼴"
- Section headings "승리팀 단골 TOP5" / "꼴찌팀 단골 TOP5"
- 데이터는 gameRecords 기반으로 집계되어 표시됨

(테스트 팀 없으면 `useCrovaGoguma=false` 상태 확인 안 되므로 스킵하고 향후 QA에서 보완 가능)

- [ ] **Step 4: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 전체 PASS.

- [ ] **Step 5: 최종 커밋 없음 (수동 QA만)**

이 태스크는 코드 변경 없음. 문제 발견 시 해당 태스크로 돌아가 수정.

---

## 구현 순서 요약

1. Task 1–7: 유틸 TDD (계산 로직 모두 `playerAnalyticsUtils.js`에 완성)
2. Task 8: SynergyTab
3. Task 9: PlayerAnalytics 공통 (배너 + 그룹)
4. Task 10: 득점콤비 (ex-케미)
5. Task 11: 크로바/고구마 일반화
6. Task 12: PlayerCardTab 4지표
7. Task 13: TimePatternTab
8. Task 14: QA

---

## 명시적 비목표

- 기존 `gameStateAnalyzer.js` 수정 없음 (회귀 위험 축소)
- 신규 탭 없음
- 데이터 파이프라인 변경 없음 (별도 플랜)
- Storybook/E2E 테스트 없음 (단위 테스트 + 수동 QA만)

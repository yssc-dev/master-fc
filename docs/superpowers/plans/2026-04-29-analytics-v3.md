# 분석탭 V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분석 탭을 선수 중심 통합 구조로 재배치하고 신규 6지표(P3 라운드분포 / P4 단독골비율 / C2 역시너지정렬 / C3 어시페어 / C4 GK케미 / C5 나의짝꿍)를 추가한다.

**Architecture:** V2 패턴(`src/utils/analyticsV2/calc*.js` 순수 함수 + `src/components/dashboard/analytics/*Tab.jsx` 프레젠테이션)을 그대로 유지. 신규 calc 5종은 TDD로 작성하고 vitest fixture로 검증. 컴포넌트는 V2 스타일 SVG/도넛/리스트 패턴 재사용. 탭 키 매핑(`PlayerAnalytics.jsx`)만 V2→V3로 갈아끼우고, V2 컴포넌트 일부(`PlayerCardTab.jsx`/`HallOfFameTab.jsx`)는 V3 통합 컴포넌트(`PersonalAnalysisTab.jsx`)로 흡수 후 삭제.

**Tech Stack:** React (functional, hooks), Vitest, ESM, 순수 JS (TS 없음). 기존 데이터 fetch(`AppSync.getMatchLog`/`getEventLog`/`getPlayerGameLog`)와 schema(`로그_매치`/`로그_이벤트`/`로그_선수경기`) 그대로.

**Spec:** `docs/superpowers/specs/2026-04-29-analytics-v3-design.md`

---

## File Structure

### 신규 파일 (calc utilities)

```
src/utils/analyticsV2/
  calcRoundSlope.js        — P3: 라운드별 G+A 회귀선 기울기
  calcSoloGoalRatio.js     — P4: 단독골/받아먹은골 비율
  calcAssistPairs.js       — C3: (어시제공자→득점자) 페어 카운트
  calcGkChemistry.js       — C4: (GK, 필드멤버) 무실점률
  calcPersonalSynergy.js   — C5: 시너지매트릭스 본인 row 발췌

src/utils/analyticsV2/__tests__/
  calcRoundSlope.test.js
  calcSoloGoalRatio.test.js
  calcAssistPairs.test.js
  calcGkChemistry.test.js
  calcPersonalSynergy.test.js
```

### 신규 파일 (components)

```
src/components/dashboard/analytics/
  PersonalAnalysisTab.jsx   — V2 PlayerCardTab + HallOfFameTab + P3/P4/C5 통합
  RoundDistribution.jsx     — P3 본인 view
  SoloGoalDonut.jsx         — P4 본인 view
  PersonalSynergyCard.jsx   — C5 본인 짝꿍
  ChemistryTab.jsx          — sub-tab 래퍼 (golden trio | assist pair | gk chem)
  GoldenTrioView.jsx        — 기존 GoldenTrioTab 본문을 sub-tab 컴포넌트로 분리
  AssistPairList.jsx        — C3 view
  GkChemistryView.jsx       — C4 view
```

### 변경 파일

```
src/components/dashboard/PlayerAnalytics.jsx          — 탭 키 매핑 V2→V3
src/components/dashboard/analytics/AwardsTab.jsx       — 후반폭격기/혼자박는자 카드 추가
src/components/dashboard/analytics/SynergyMatrixTab.jsx — 정렬 토글 + 행/열 재배치
```

### 삭제 파일

```
src/components/dashboard/analytics/PlayerCardTab.jsx   — PersonalAnalysisTab으로 흡수
src/components/dashboard/analytics/HallOfFameTab.jsx   — PersonalAnalysisTab으로 흡수
src/components/dashboard/analytics/GoldenTrioTab.jsx   — GoldenTrioView로 분리 흡수
```

---

## Phase A — Calc Utilities (TDD)

### Task 1: calcRoundSlope (P3)

**Files:**
- Create: `src/utils/analyticsV2/calcRoundSlope.js`
- Test:   `src/utils/analyticsV2/__tests__/calcRoundSlope.test.js`

**Spec ref:** §6.1

**API:**
```js
calcRoundSlope({ eventLogs, threshold = 10 }) → {
  perPlayer: {
    [player]: {
      points: [{ date, round_idx, ga }],   // ga ≥ 1 인 라운드만
      sampleCount: number,                  // points.length
      slope: number | null,                 // sampleCount < 2 면 null
      meanByRound: { [round_idx]: number }, // 라운드별 평균 G+A (활동 라운드만)
    }
  },
  ranking: {
    lateBloomers: [{ player, slope, sampleCount }],  // slope > 0, sampleCount ≥ threshold, slope desc
    earlyBirds:   [{ player, slope, sampleCount }],  // slope < 0, sampleCount ≥ threshold, slope asc
  }
}
```

`round_idx`는 `match_id`("R1_C0")의 `R(\d+)_` 그룹에서 정수로 파싱. `ga = goal_count + assist_count_for_player_in_round`.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/analyticsV2/__tests__/calcRoundSlope.test.js
import { describe, it, expect } from 'vitest';
import { calcRoundSlope } from '../calcRoundSlope';

describe('calcRoundSlope', () => {
  it('returns empty result for no events', () => {
    const r = calcRoundSlope({ eventLogs: [], threshold: 10 });
    expect(r.perPlayer).toEqual({});
    expect(r.ranking.lateBloomers).toEqual([]);
    expect(r.ranking.earlyBirds).toEqual([]);
  });

  it('counts goal as ga=1 and goal+assist as ga=2 in same round', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal',  player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal',  player: 'A', related_player: 'B' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    // A: 2 goals in R1 → ga=2
    expect(r.perPlayer.A.points).toEqual([{ date: '2026-04-01', round_idx: 1, ga: 2 }]);
    // B: 1 assist in R1 → ga=1
    expect(r.perPlayer.B.points).toEqual([{ date: '2026-04-01', round_idx: 1, ga: 1 }]);
  });

  it('positive slope when activity grows with round', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 3 });
    expect(r.perPlayer.A.sampleCount).toBe(3);
    expect(r.perPlayer.A.slope).toBeGreaterThan(0);
    expect(r.ranking.lateBloomers[0].player).toBe('A');
    expect(r.ranking.earlyBirds).toEqual([]);
  });

  it('negative slope when activity decays with round', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 3 });
    expect(r.perPlayer.A.slope).toBeLessThan(0);
    expect(r.ranking.earlyBirds[0].player).toBe('A');
    expect(r.ranking.lateBloomers).toEqual([]);
  });

  it('threshold filters out players with sampleCount < threshold', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 10 });
    expect(r.perPlayer.A.sampleCount).toBe(2);
    expect(r.ranking.lateBloomers).toEqual([]);  // 미달
  });

  it('skips events with malformed match_id', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'BAD', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.points).toHaveLength(1);
  });

  it('owngoal does not count toward player ga', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'owngoal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer).toEqual({});
  });

  it('meanByRound averages across sessions for same round_idx', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-08', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.meanByRound[1]).toBeCloseTo(1.5, 5); // (2 + 1) / 2 sessions
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rh/Desktop/python_dev/footsal_webapp && npx vitest run src/utils/analyticsV2/__tests__/calcRoundSlope.test.js
```
Expected: FAIL — `Failed to resolve import "../calcRoundSlope"`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/analyticsV2/calcRoundSlope.js
// P3: 선수별 라운드 G+A 회귀선 기울기.
// 활동(ga≥1) 라운드만 표본으로 사용. 활동하지 않은 라운드는 표본 제외(풋살 출전 미확정 보정).

const ROUND_RX = /^R(\d+)_/;

function parseRoundIdx(matchId) {
  if (typeof matchId !== 'string') return null;
  const m = matchId.match(ROUND_RX);
  return m ? Number(m[1]) : null;
}

function linearSlope(points) {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0, sumY = 0;
  for (const p of points) { sumX += p.round_idx; sumY += p.ga; }
  const mx = sumX / n, my = sumY / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.round_idx - mx) * (p.ga - my);
    den += (p.round_idx - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function calcRoundSlope({ eventLogs, threshold = 10 }) {
  // (player, date, round_idx) → ga (goal=1 점수자, assist=1 어시제공자, owngoal 무시)
  const tally = {};   // tally[player][`${date}|${round_idx}`] = ga
  const dateOf = {};  // dateOf[player][`${date}|${round_idx}`] = date

  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;          // owngoal은 제외
    const ridx = parseRoundIdx(e.match_id);
    if (ridx == null) continue;
    const date = e.date || '';
    const key = `${date}|${ridx}`;

    const scorer = e.player;
    if (scorer) {
      if (!tally[scorer]) { tally[scorer] = {}; dateOf[scorer] = {}; }
      tally[scorer][key] = (tally[scorer][key] || 0) + 1;
      dateOf[scorer][key] = date;
    }
    const assist = e.related_player;
    if (assist) {
      if (!tally[assist]) { tally[assist] = {}; dateOf[assist] = {}; }
      tally[assist][key] = (tally[assist][key] || 0) + 1;
      dateOf[assist][key] = date;
    }
  }

  const perPlayer = {};
  for (const player of Object.keys(tally)) {
    const points = Object.entries(tally[player]).map(([key, ga]) => {
      const round_idx = Number(key.split('|')[1]);
      return { date: dateOf[player][key], round_idx, ga };
    });
    points.sort((a, b) => (a.date.localeCompare(b.date)) || (a.round_idx - b.round_idx));

    const sumByRound = {}, cntByRound = {};
    for (const p of points) {
      sumByRound[p.round_idx] = (sumByRound[p.round_idx] || 0) + p.ga;
      cntByRound[p.round_idx] = (cntByRound[p.round_idx] || 0) + 1;
    }
    const meanByRound = {};
    for (const r of Object.keys(sumByRound)) meanByRound[r] = sumByRound[r] / cntByRound[r];

    perPlayer[player] = {
      points,
      sampleCount: points.length,
      slope: linearSlope(points),
      meanByRound,
    };
  }

  const lateBloomers = [];
  const earlyBirds = [];
  for (const player of Object.keys(perPlayer)) {
    const { slope, sampleCount } = perPlayer[player];
    if (sampleCount < threshold || slope == null) continue;
    if (slope > 0) lateBloomers.push({ player, slope, sampleCount });
    else if (slope < 0) earlyBirds.push({ player, slope, sampleCount });
  }
  lateBloomers.sort((a, b) => b.slope - a.slope || a.player.localeCompare(b.player, 'ko'));
  earlyBirds.sort((a, b) => a.slope - b.slope || a.player.localeCompare(b.player, 'ko'));

  return { perPlayer, ranking: { lateBloomers, earlyBirds } };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcRoundSlope.test.js
```
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcRoundSlope.js src/utils/analyticsV2/__tests__/calcRoundSlope.test.js
git commit -m "feat(analyticsV3): calcRoundSlope (P3 라운드 분포)"
```

---

### Task 2: calcSoloGoalRatio (P4)

**Files:**
- Create: `src/utils/analyticsV2/calcSoloGoalRatio.js`
- Test:   `src/utils/analyticsV2/__tests__/calcSoloGoalRatio.test.js`

**Spec ref:** §6.2

**API:**
```js
calcSoloGoalRatio({ eventLogs, threshold = 10 }) → {
  perPlayer: { [player]: { solo: number, assisted: number, total: number, soloRatio: number } },
  ranking: { soloHeroes: [{ player, soloRatio, total }] }   // total ≥ threshold, soloRatio desc
}
```

`solo` = `event_type='goal' && !related_player`. `assisted` = `event_type='goal' && related_player`. owngoal 제외.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/analyticsV2/__tests__/calcSoloGoalRatio.test.js
import { describe, it, expect } from 'vitest';
import { calcSoloGoalRatio } from '../calcSoloGoalRatio';

describe('calcSoloGoalRatio', () => {
  it('returns empty for no events', () => {
    const r = calcSoloGoalRatio({ eventLogs: [], threshold: 10 });
    expect(r.perPlayer).toEqual({});
    expect(r.ranking.soloHeroes).toEqual([]);
  });

  it('counts solo and assisted goals separately', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'A', related_player: '' },
      { event_type: 'goal', player: 'A', related_player: 'B' },
      { event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A).toEqual({ solo: 2, assisted: 1, total: 3, soloRatio: 2 / 3 });
  });

  it('owngoal excluded', () => {
    const eventLogs = [
      { event_type: 'owngoal', player: 'A', related_player: '' },
      { event_type: 'goal',    player: 'A', related_player: '' },
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.total).toBe(1);
    expect(r.perPlayer.A.solo).toBe(1);
  });

  it('threshold filters ranking', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'A', related_player: '' },
      { event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 10 });
    expect(r.perPlayer.A.total).toBe(2);
    expect(r.ranking.soloHeroes).toEqual([]);
  });

  it('ranking sorts by soloRatio desc, ties by name', () => {
    const eventLogs = [
      ...Array(8).fill({ event_type: 'goal', player: 'A', related_player: '' }),
      ...Array(2).fill({ event_type: 'goal', player: 'A', related_player: 'X' }),
      ...Array(5).fill({ event_type: 'goal', player: 'B', related_player: '' }),
      ...Array(5).fill({ event_type: 'goal', player: 'B', related_player: 'X' }),
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 10 });
    expect(r.ranking.soloHeroes[0].player).toBe('A');  // 0.8
    expect(r.ranking.soloHeroes[1].player).toBe('B');  // 0.5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcSoloGoalRatio.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/analyticsV2/calcSoloGoalRatio.js
// P4: 단독골(어시 없음) vs 받아먹은 골(어시 있음). owngoal 제외.

export function calcSoloGoalRatio({ eventLogs, threshold = 10 }) {
  const perPlayer = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const player = e.player;
    if (!player) continue;
    if (!perPlayer[player]) perPlayer[player] = { solo: 0, assisted: 0, total: 0, soloRatio: 0 };
    if (e.related_player) perPlayer[player].assisted += 1;
    else perPlayer[player].solo += 1;
  }
  for (const p of Object.keys(perPlayer)) {
    const v = perPlayer[p];
    v.total = v.solo + v.assisted;
    v.soloRatio = v.total > 0 ? v.solo / v.total : 0;
  }

  const soloHeroes = Object.entries(perPlayer)
    .filter(([, v]) => v.total >= threshold)
    .map(([player, v]) => ({ player, soloRatio: v.soloRatio, total: v.total }))
    .sort((a, b) => b.soloRatio - a.soloRatio || a.player.localeCompare(b.player, 'ko'));

  return { perPlayer, ranking: { soloHeroes } };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcSoloGoalRatio.test.js
```
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcSoloGoalRatio.js src/utils/analyticsV2/__tests__/calcSoloGoalRatio.test.js
git commit -m "feat(analyticsV3): calcSoloGoalRatio (P4 단독골 비율)"
```

---

### Task 3: calcAssistPairs (C3)

**Files:**
- Create: `src/utils/analyticsV2/calcAssistPairs.js`
- Test:   `src/utils/analyticsV2/__tests__/calcAssistPairs.test.js`

**Spec ref:** §6.4

**API:**
```js
calcAssistPairs({ eventLogs, threshold = 3, topN = 10 }) → [
  { assister: string, scorer: string, count: number }   // count desc, threshold ≥ filter
]
```

- [ ] **Step 1: Write the failing test**

```js
// src/utils/analyticsV2/__tests__/calcAssistPairs.test.js
import { describe, it, expect } from 'vitest';
import { calcAssistPairs } from '../calcAssistPairs';

describe('calcAssistPairs', () => {
  it('returns empty for no events', () => {
    expect(calcAssistPairs({ eventLogs: [] })).toEqual([]);
  });

  it('counts (assister, scorer) pairs', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'B' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10 });
    expect(r).toEqual([{ assister: 'A', scorer: 'S', count: 3 }]);
  });

  it('order matters (A→S != S→A)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10 });
    expect(r).toHaveLength(2);
    expect(r.find(x => x.assister === 'A' && x.scorer === 'S').count).toBe(3);
    expect(r.find(x => x.assister === 'S' && x.scorer === 'A').count).toBe(3);
  });

  it('skips solo goals (no related_player)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: '' },
    ];
    expect(calcAssistPairs({ eventLogs, threshold: 1 })).toEqual([]);
  });

  it('skips owngoal', () => {
    const eventLogs = [
      { event_type: 'owngoal', player: 'S', related_player: 'A' },
    ];
    expect(calcAssistPairs({ eventLogs, threshold: 1 })).toEqual([]);
  });

  it('topN limits result length', () => {
    const eventLogs = [];
    for (let i = 0; i < 15; i++) {
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
    }
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 5 });
    expect(r).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcAssistPairs.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/analyticsV2/calcAssistPairs.js
// C3: (어시제공자 → 득점자) 페어 누적 횟수 TOP.

export function calcAssistPairs({ eventLogs, threshold = 3, topN = 10 }) {
  const counts = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const scorer = e.player;
    const assister = e.related_player;
    if (!scorer || !assister) continue;
    const key = `${assister}\u0000${scorer}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, c]) => c >= threshold)
    .map(([key, count]) => {
      const [assister, scorer] = key.split('\u0000');
      return { assister, scorer, count };
    })
    .sort((a, b) =>
      b.count - a.count ||
      a.assister.localeCompare(b.assister, 'ko') ||
      a.scorer.localeCompare(b.scorer, 'ko')
    )
    .slice(0, topN);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcAssistPairs.test.js
```
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcAssistPairs.js src/utils/analyticsV2/__tests__/calcAssistPairs.test.js
git commit -m "feat(analyticsV3): calcAssistPairs (C3 어시 페어 TOP)"
```

---

### Task 4: calcGkChemistry (C4)

**Files:**
- Create: `src/utils/analyticsV2/calcGkChemistry.js`
- Test:   `src/utils/analyticsV2/__tests__/calcGkChemistry.test.js`

**Spec ref:** §6.5

**API:**
```js
calcGkChemistry({ matchLogs, threshold = 5 }) → {
  gks: string[],   // GK로 등장한 선수 목록 (정렬)
  byGk: {
    [gkName]: {
      pairs: [{ field: string, rounds: number, cleanSheets: number, cleanRate: number }],  // rounds ≥ threshold만, cleanRate desc
      worst: [{ field: string, rounds: number, cleanSheets: number, cleanRate: number }],  // rounds ≥ threshold만, cleanRate asc
    }
  }
}
```

각 `로그_매치` 행 = 한 라운드. `our_gk`가 있을 때 `our_members_json` 안 멤버 (단, GK 본인 제외) 각각에 대해 동행 라운드 1 카운트, `opponent_score === 0`이면 cleanSheets 1 카운트.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/analyticsV2/__tests__/calcGkChemistry.test.js
import { describe, it, expect } from 'vitest';
import { calcGkChemistry } from '../calcGkChemistry';

describe('calcGkChemistry', () => {
  it('returns empty for no logs', () => {
    const r = calcGkChemistry({ matchLogs: [], threshold: 1 });
    expect(r.gks).toEqual([]);
    expect(r.byGk).toEqual({});
  });

  it('counts rounds with same GK + same field member', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A","B"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A","B"]', opponent_score: 1 },
      { our_gk: 'G', our_members_json: '["G","A","C"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    const gA = r.byGk.G.pairs.find(p => p.field === 'A');
    expect(gA).toEqual({ field: 'A', rounds: 3, cleanSheets: 2, cleanRate: 2 / 3 });
    const gB = r.byGk.G.pairs.find(p => p.field === 'B');
    expect(gB).toEqual({ field: 'B', rounds: 2, cleanSheets: 1, cleanRate: 1 / 2 });
    const gC = r.byGk.G.pairs.find(p => p.field === 'C');
    expect(gC).toEqual({ field: 'C', rounds: 1, cleanSheets: 1, cleanRate: 1 });
  });

  it('excludes GK from own pair list', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.byGk.G.pairs.find(p => p.field === 'G')).toBeUndefined();
  });

  it('skips rows with empty our_gk', () => {
    const matchLogs = [
      { our_gk: '', our_members_json: '["A","B"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.gks).toEqual([]);
  });

  it('threshold filters pairs below rounds', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 5 });
    expect(r.byGk.G.pairs).toEqual([]);
    expect(r.byGk.G.worst).toEqual([]);
  });

  it('worst is sorted by cleanRate asc, pairs by desc', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","B"]', opponent_score: 1 },
      { our_gk: 'G', our_members_json: '["G","B"]', opponent_score: 1 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 2 });
    expect(r.byGk.G.pairs[0].field).toBe('A');
    expect(r.byGk.G.worst[0].field).toBe('B');
  });

  it('skips malformed our_members_json', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: 'bad-json', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.byGk.G.pairs.find(p => p.field === 'A').rounds).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcGkChemistry.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/analyticsV2/calcGkChemistry.js
// C4: GK + 같은 라운드 우리팀 필드 멤버 페어 무실점률.
// 한계: 라운드별 5인 필드 출전이 없어 "그날 같은 팀 로스터"로 근사.

function parseMembers(s) {
  try {
    const parsed = JSON.parse(s || '[]');
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}

export function calcGkChemistry({ matchLogs, threshold = 5 }) {
  const tally = {};   // tally[gk][field] = { rounds, cleanSheets }
  for (const m of matchLogs || []) {
    const gk = m.our_gk;
    if (!gk) continue;
    const members = parseMembers(m.our_members_json);
    if (members.length === 0) continue;
    const opp = Number(m.opponent_score) || 0;
    const isClean = opp === 0;
    if (!tally[gk]) tally[gk] = {};
    for (const field of members) {
      if (field === gk) continue;
      if (!tally[gk][field]) tally[gk][field] = { rounds: 0, cleanSheets: 0 };
      tally[gk][field].rounds += 1;
      if (isClean) tally[gk][field].cleanSheets += 1;
    }
  }

  const byGk = {};
  for (const gk of Object.keys(tally)) {
    const allPairs = Object.entries(tally[gk])
      .map(([field, { rounds, cleanSheets }]) => ({
        field, rounds, cleanSheets,
        cleanRate: rounds > 0 ? cleanSheets / rounds : 0,
      }))
      .filter(p => p.rounds >= threshold);

    const pairs = [...allPairs].sort((a, b) =>
      b.cleanRate - a.cleanRate ||
      b.rounds - a.rounds ||
      a.field.localeCompare(b.field, 'ko')
    );
    const worst = [...allPairs].sort((a, b) =>
      a.cleanRate - b.cleanRate ||
      b.rounds - a.rounds ||
      a.field.localeCompare(b.field, 'ko')
    );
    byGk[gk] = { pairs, worst };
  }

  return {
    gks: Object.keys(byGk).sort((a, b) => a.localeCompare(b, 'ko')),
    byGk,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcGkChemistry.test.js
```
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcGkChemistry.js src/utils/analyticsV2/__tests__/calcGkChemistry.test.js
git commit -m "feat(analyticsV3): calcGkChemistry (C4 GK-필드 무실점률)"
```

---

### Task 5: calcPersonalSynergy (C5)

**Files:**
- Create: `src/utils/analyticsV2/calcPersonalSynergy.js`
- Test:   `src/utils/analyticsV2/__tests__/calcPersonalSynergy.test.js`

**Spec ref:** §6.6

**API:**
```js
calcPersonalSynergy({ matrix, player, topN = 3 }) → {
  best: [{ partner, games, wins, draws, losses, winRate }],
  worst: [{ partner, games, wins, draws, losses, winRate }]
}
```

`matrix`는 `calcSynergyMatrix({matchLogs, minRounds})`의 반환값. `cells['A|B']` (정렬된 키) 구조라서, player와 다른 모든 player에 대해 키 lookup. `games < matrix.minRounds` 페어는 제외.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/analyticsV2/__tests__/calcPersonalSynergy.test.js
import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';
import { calcPersonalSynergy } from '../calcPersonalSynergy';

describe('calcPersonalSynergy', () => {
  it('returns empty for unknown player', () => {
    const matrix = calcSynergyMatrix({ matchLogs: [], minRounds: 1 });
    const r = calcPersonalSynergy({ matrix, player: 'X' });
    expect(r).toEqual({ best: [], worst: [] });
  });

  it('extracts row of player, sorted best/worst', () => {
    const matchLogs = [
      // A,B 같이 5경기 5승
      ...Array(5).fill({ our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 }),
      // A,C 같이 5경기 0승 5패
      ...Array(5).fill({ our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 }),
      // A,D 같이 5경기 3승 2패
      ...Array(3).fill({ our_members_json: '["A","D"]', our_score: 1, opponent_score: 0 }),
      ...Array(2).fill({ our_members_json: '["A","D"]', our_score: 0, opponent_score: 1 }),
    ];
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 3 });
    expect(r.best.map(p => p.partner)).toEqual(['B', 'D', 'C']);
    expect(r.worst.map(p => p.partner)).toEqual(['C', 'D', 'B']);
  });

  it('excludes diagonal (self pair)', () => {
    const matchLogs = [
      ...Array(5).fill({ our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 }),
    ];
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 5 });
    expect(r.best.find(p => p.partner === 'A')).toBeUndefined();
  });

  it('filters pairs below matrix.minRounds', () => {
    const matchLogs = [
      // A,B 1경기만
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 3 });
    expect(r.best).toEqual([]);
    expect(r.worst).toEqual([]);
  });

  it('topN slices results', () => {
    const matchLogs = [];
    for (const partner of ['B', 'C', 'D', 'E', 'F']) {
      for (let i = 0; i < 5; i++) {
        matchLogs.push({ our_members_json: `["A","${partner}"]`, our_score: 1, opponent_score: 0 });
      }
    }
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 2 });
    expect(r.best).toHaveLength(2);
    expect(r.worst).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcPersonalSynergy.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/analyticsV2/calcPersonalSynergy.js
// C5: 시너지매트릭스 본인 row 발췌. 베스트/워스트 페어.

export function calcPersonalSynergy({ matrix, player, topN = 3 }) {
  if (!matrix || !matrix.cells || !player) return { best: [], worst: [] };
  const minRounds = matrix.minRounds ?? 1;
  const partners = [];
  for (const other of matrix.players || []) {
    if (other === player) continue;
    const [a, b] = [player, other].sort((x, y) => x.localeCompare(y, 'ko'));
    const cell = matrix.cells[`${a}|${b}`];
    if (!cell) continue;
    if (cell.games < minRounds) continue;
    partners.push({
      partner: other,
      games: cell.games,
      wins: cell.wins,
      draws: cell.draws,
      losses: cell.losses,
      winRate: cell.winRate,
    });
  }
  const best = [...partners].sort((a, b) =>
    b.winRate - a.winRate ||
    b.games - a.games ||
    a.partner.localeCompare(b.partner, 'ko')
  ).slice(0, topN);
  const worst = [...partners].sort((a, b) =>
    a.winRate - b.winRate ||
    b.games - a.games ||
    a.partner.localeCompare(b.partner, 'ko')
  ).slice(0, topN);
  return { best, worst };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/analyticsV2/__tests__/calcPersonalSynergy.test.js
```
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/analyticsV2/calcPersonalSynergy.js src/utils/analyticsV2/__tests__/calcPersonalSynergy.test.js
git commit -m "feat(analyticsV3): calcPersonalSynergy (C5 나의 짝꿍)"
```

---

## Phase B — View Components

### Task 6: RoundDistribution (P3 view)

**Files:**
- Create: `src/components/dashboard/analytics/RoundDistribution.jsx`

**Spec ref:** §5 item 4, §6.1

**Props:** `{ data, ranking, totalEligible, C }`
- `data`: `perPlayer[player]` 객체 (`{ points, sampleCount, slope, meanByRound }`)
- `ranking`: `{ lateBloomers, earlyBirds }` (어워드 랭킹, 본인 위치 캡션용)
- `totalEligible`: 임계값 통과한 전체 선수 수 (캡션 분모)
- `C`: 테마 컬러

**View:** 라운드별 평균 G+A 막대그래프 + 회귀선 + 캡션. 데이터 없으면 안내 메시지.

- [ ] **Step 1: Write the implementation**

```jsx
// src/components/dashboard/analytics/RoundDistribution.jsx
import { useMemo } from 'react';

export default function RoundDistribution({ data, player, ranking, C }) {
  const stats = useMemo(() => {
    if (!data || data.sampleCount === 0) return null;
    const rounds = Object.keys(data.meanByRound).map(Number).sort((a, b) => a - b);
    const maxR = rounds[rounds.length - 1];
    const minR = rounds[0];
    const maxV = Math.max(...rounds.map(r => data.meanByRound[r]));
    return { rounds, maxR, minR, maxV: maxV || 1 };
  }, [data]);

  const caption = useMemo(() => {
    if (!ranking) return null;
    const late = ranking.lateBloomers.findIndex(x => x.player === player);
    if (late >= 0) return `🏃 후반 폭격기 ${ranking.lateBloomers.length}명 중 ${late + 1}위`;
    const early = ranking.earlyBirds.findIndex(x => x.player === player);
    if (early >= 0) return `🎯 초반 강자 ${ranking.earlyBirds.length}명 중 ${early + 1}위`;
    return null;
  }, [ranking, player]);

  if (!stats) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        라운드 분포 데이터 없음 (활동 라운드 표본 부족)
      </div>
    );
  }

  const { rounds, maxR, minR, maxV } = stats;
  const W = 280, H = 120, padL = 24, padR = 8, padT = 8, padB = 18;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xOf = (r) => padL + (maxR === minR ? innerW / 2 : ((r - minR) / (maxR - minR)) * innerW);
  const yOf = (v) => padT + innerH - (v / maxV) * innerH;
  const barW = Math.max(8, innerW / Math.max(rounds.length * 1.5, 1));

  // 회귀선 — slope*x + intercept (slope null이면 그리지 않음)
  let regLine = null;
  if (data.slope != null && rounds.length >= 2) {
    const n = data.points.length;
    const meanX = data.points.reduce((s, p) => s + p.round_idx, 0) / n;
    const meanY = data.points.reduce((s, p) => s + p.ga, 0) / n;
    const intercept = meanY - data.slope * meanX;
    const x1 = minR, y1 = data.slope * x1 + intercept;
    const x2 = maxR, y2 = data.slope * x2 + intercept;
    regLine = { x1: xOf(x1), y1: yOf(Math.max(0, Math.min(maxV, y1))), x2: xOf(x2), y2: yOf(Math.max(0, Math.min(maxV, y2))) };
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>📊 라운드 분포</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke={C.grayDarker} strokeWidth={0.5} />
        {rounds.map(r => {
          const v = data.meanByRound[r];
          const x = xOf(r) - barW / 2;
          const y = yOf(v);
          return (
            <g key={r}>
              <rect x={x} y={y} width={barW} height={padT + innerH - y} fill={C.accent} fillOpacity={0.6} />
              <text x={xOf(r)} y={H - 4} textAnchor="middle" fill={C.gray} fontSize={9}>R{r}</text>
            </g>
          );
        })}
        {regLine && (
          <line x1={regLine.x1} y1={regLine.y1} x2={regLine.x2} y2={regLine.y2} stroke={C.orange} strokeWidth={1.5} strokeDasharray="3 2" />
        )}
      </svg>
      <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>
        활동 라운드 {data.sampleCount}회 · 기울기 {data.slope == null ? '—' : data.slope.toFixed(2)}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontWeight: 600 }}>{caption}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: SUCCESS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/RoundDistribution.jsx
git commit -m "feat(analyticsV3): RoundDistribution 컴포넌트 (P3 본인 view)"
```

---

### Task 7: SoloGoalDonut (P4 view)

**Files:**
- Create: `src/components/dashboard/analytics/SoloGoalDonut.jsx`

**Spec ref:** §5 item 5, §6.2

**Props:** `{ data, player, ranking, C }`
- `data`: `perPlayer[player]` (`{ solo, assisted, total, soloRatio }`)
- `ranking`: `{ soloHeroes }`
- `player`: 본인 이름

- [ ] **Step 1: Write the implementation**

```jsx
// src/components/dashboard/analytics/SoloGoalDonut.jsx
import { useMemo } from 'react';

export default function SoloGoalDonut({ data, player, ranking, C }) {
  const caption = useMemo(() => {
    if (!ranking) return null;
    const idx = ranking.soloHeroes.findIndex(x => x.player === player);
    if (idx >= 0) return `🎯 혼자 박는 자 ${ranking.soloHeroes.length}명 중 ${idx + 1}위`;
    return null;
  }, [ranking, player]);

  if (!data || data.total === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        골 기록 없음
      </div>
    );
  }

  const { solo, assisted, total, soloRatio } = data;
  const size = 110, r = 44, c = size / 2, stroke = 16;
  const circ = 2 * Math.PI * r;
  const soloArc = circ * soloRatio;
  const assistedArc = circ * (1 - soloRatio);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>🎯 단독골 vs 받아먹은 골</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={C.grayDarker} strokeWidth={stroke} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={C.accent} strokeWidth={stroke}
            strokeDasharray={`${soloArc} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />
          <text x={c} y={c} textAnchor="middle" dominantBaseline="middle" fill={C.gray} fontSize={14} fontWeight={700}>
            {Math.round(soloRatio * 100)}%
          </text>
        </svg>
        <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.6 }}>
          <div><span style={{ display: 'inline-block', width: 8, height: 8, background: C.accent, marginRight: 6 }}/>단독 {solo}골</div>
          <div><span style={{ display: 'inline-block', width: 8, height: 8, background: C.grayDarker, marginRight: 6 }}/>받아먹은 {assisted}골</div>
          <div style={{ marginTop: 4, fontSize: 10 }}>총 {total}골</div>
        </div>
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: C.accent, marginTop: 6, fontWeight: 600 }}>{caption}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/SoloGoalDonut.jsx
git commit -m "feat(analyticsV3): SoloGoalDonut 컴포넌트 (P4 본인 view)"
```

---

### Task 8: PersonalSynergyCard (C5 view)

**Files:**
- Create: `src/components/dashboard/analytics/PersonalSynergyCard.jsx`

**Spec ref:** §5 item 6, §6.6

**Props:** `{ data, C }`
- `data`: `{ best, worst }` from `calcPersonalSynergy`

- [ ] **Step 1: Write the implementation**

```jsx
// src/components/dashboard/analytics/PersonalSynergyCard.jsx
export default function PersonalSynergyCard({ data, C }) {
  if (!data || (data.best.length === 0 && data.worst.length === 0)) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        함께 뛴 페어 표본 부족
      </div>
    );
  }

  const Row = ({ p, sign }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
      <span style={{ color: C.gray }}>{p.partner}</span>
      <span style={{ color: sign === 'best' ? C.green : C.red, fontWeight: 600 }}>
        {Math.round(p.winRate * 100)}% · {p.games}경기
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>🤝 나의 짝꿍</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST</div>
          {data.best.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : data.best.map(p => <Row key={p.partner} p={p} sign="best" />)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
          {data.worst.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : data.worst.map(p => <Row key={p.partner} p={p} sign="worst" />)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/PersonalSynergyCard.jsx
git commit -m "feat(analyticsV3): PersonalSynergyCard 컴포넌트 (C5 나의 짝꿍)"
```

---

### Task 9: AssistPairList (C3 view)

**Files:**
- Create: `src/components/dashboard/analytics/AssistPairList.jsx`

**Spec ref:** §6.4, §7

**Props:** `{ pairs, C }` — `pairs`는 `calcAssistPairs` 반환값

- [ ] **Step 1: Write the implementation**

```jsx
// src/components/dashboard/analytics/AssistPairList.jsx
export default function AssistPairList({ pairs, C }) {
  if (!pairs || pairs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        어시 페어 데이터 없음 (페어당 누적 3회 이상 필요)
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은 페어가 반복적으로 만든 골. 페어당 누적 ≥ 3회.
      </div>
      {pairs.map((p, i) => (
        <div key={`${p.assister}|${p.scorer}`} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', borderBottom: `1px dashed ${C.grayDarker}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: C.gray, width: 22, textAlign: 'right' }}>#{i + 1}</span>
            <span style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>
              {p.assister} <span style={{ color: C.accent }}>→</span> {p.scorer}
            </span>
          </div>
          <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{p.count}회</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/AssistPairList.jsx
git commit -m "feat(analyticsV3): AssistPairList 컴포넌트 (C3 어시 페어)"
```

---

### Task 10: GkChemistryView (C4 view)

**Files:**
- Create: `src/components/dashboard/analytics/GkChemistryView.jsx`

**Spec ref:** §6.5, §7

**Props:** `{ chem, C }` — `chem`은 `calcGkChemistry` 반환값

- [ ] **Step 1: Write the implementation**

```jsx
// src/components/dashboard/analytics/GkChemistryView.jsx
import { useState, useMemo } from 'react';

export default function GkChemistryView({ chem, C }) {
  const [selected, setSelected] = useState(null);
  const gks = chem?.gks || [];
  const activeGk = selected || gks[0] || null;
  const data = useMemo(() => activeGk ? chem.byGk[activeGk] : null, [chem, activeGk]);

  if (gks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        GK 케미 데이터 없음
      </div>
    );
  }

  const Row = ({ p, sign }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
      <span style={{ color: C.gray }}>{p.field}</span>
      <span style={{ color: sign === 'best' ? C.green : C.red, fontWeight: 600 }}>
        {Math.round(p.cleanRate * 100)}% · {p.cleanSheets}/{p.rounds}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        GK가 X일 때 같은 팀이었던 필드 멤버별 무실점률. 그날 같은 팀 로스터 기준 근사 (라운드별 5인 출전 미입력).
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {gks.map(g => (
          <button key={g} onClick={() => setSelected(g)} style={{
            padding: '4px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: g === activeGk ? C.accent : 'transparent',
            color: g === activeGk ? C.black : C.gray,
            border: `1px solid ${g === activeGk ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{g}</button>
        ))}
      </div>
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST 무실점</div>
            {data.pairs.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (페어당 5라운드 이상 필요)</div>
            ) : data.pairs.slice(0, 5).map(p => <Row key={p.field} p={p} sign="best" />)}
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
            {data.worst.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
            ) : data.worst.slice(0, 5).map(p => <Row key={p.field} p={p} sign="worst" />)}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/analytics/GkChemistryView.jsx
git commit -m "feat(analyticsV3): GkChemistryView 컴포넌트 (C4 GK-필드 케미)"
```

---

## Phase C — Tab Restructure

### Task 11: PersonalAnalysisTab (PlayerCard + HallOfFame + P3/P4/C5 통합)

**Files:**
- Create: `src/components/dashboard/analytics/PersonalAnalysisTab.jsx`

**Spec ref:** §5

V2 `PlayerCardTab.jsx` (385줄)와 `HallOfFameTab.jsx` (96줄)을 한 컴포넌트로 흡수. 기존 `PlayerCardTab` 본문(레이더+뱃지+디테일+트렌드라인+연속기록)을 그대로 유지하고, 그 아래에 P3/P4/C5 카드와 V2 명예의전당의 PR/월별TOP5를 덧붙임.

**Props:** `PlayerCardTab`이 받던 모든 props + `eventLogs`, `synergyMatrix`.

- [ ] **Step 1: Read PlayerCardTab + HallOfFameTab to copy structure**

```bash
cat src/components/dashboard/analytics/PlayerCardTab.jsx src/components/dashboard/analytics/HallOfFameTab.jsx
```

(읽기만 — 다음 step에서 합치는 작업의 베이스로 사용)

- [ ] **Step 2: Write PersonalAnalysisTab.jsx**

새 컴포넌트는 다음 구조:
1. 선수 드롭다운 (V2 PlayerCardTab과 동일)
2. PlayerCardTab 본문 그대로 (레이더+뱃지+디테일표+트렌드라인+스트릭)
3. `<RoundDistribution>` (P3)
4. `<SoloGoalDonut>` (P4)
5. `<PersonalSynergyCard>` (C5)
6. HallOfFameTab의 PR(personal records) 영역
7. HallOfFameTab의 월별 TOP5 보드

```jsx
// src/components/dashboard/analytics/PersonalAnalysisTab.jsx
import { useState, useMemo } from 'react';
import { calcRoundSlope } from '../../../utils/analyticsV2/calcRoundSlope';
import { calcSoloGoalRatio } from '../../../utils/analyticsV2/calcSoloGoalRatio';
import { calcPersonalSynergy } from '../../../utils/analyticsV2/calcPersonalSynergy';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';
import { calcPersonalRecords } from '../../../utils/analyticsV2/calcPersonalRecords';
import { calcMonthlyRanking } from '../../../utils/analyticsV2/calcMonthlyRanking';
import RoundDistribution from './RoundDistribution';
import SoloGoalDonut from './SoloGoalDonut';
import PersonalSynergyCard from './PersonalSynergyCard';

// PlayerCardTab의 RadarChart, TrendLineChart, StreakBadge 등 보조 컴포넌트가 필요하면
// PlayerCardTab.jsx에서 그대로 복사한다 (V2 → V3 흡수 단계라 코드 중복 OK).

import { percentile } from '../../../utils/gameStateAnalyzer';
import { calcTrend, calcRelativePosition, calcAttendance } from '../../../utils/playerAnalyticsUtils';
import { calcTrends } from '../../../utils/analyticsV2/calcTrends';
import { calcStreaks } from '../../../utils/analyticsV2/calcStreaks';

const AXES = [
  { key: "scoring", label: "득점력" },
  { key: "creativity", label: "창의력" },
  { key: "defense", label: "수비력" },
  { key: "keeping", label: "키퍼" },
  { key: "attendance", label: "참석률" },
  { key: "winRate", label: "승리기여" },
];

// === 다음 헬퍼들은 PlayerCardTab.jsx에서 그대로 복사 ===
// function RadarChart({ values, size, C }) { ... }
// function TrendLineChart({ smoothed, C }) { ... }
// (PlayerCardTab.jsx 1~80번대 줄 참조)

export default function PersonalAnalysisTab({
  playerLog, members, defenseStats, winStats, gameRecords,
  playerGameLogs, matchLogs, eventLogs, C, authUserName,
}) {
  const players = useMemo(() => (playerLog || []).map(p => p.player).filter(Boolean), [playerLog]);
  const [selected, setSelected] = useState(() =>
    authUserName && players.includes(authUserName) ? authUserName : (players[0] || null)
  );

  // P3 계산 (탭 1회만)
  const roundSlope = useMemo(
    () => calcRoundSlope({ eventLogs: eventLogs || [], threshold: 10 }),
    [eventLogs]
  );
  // P4
  const soloRatio = useMemo(
    () => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }),
    [eventLogs]
  );
  // C5
  const synergyMatrix = useMemo(
    () => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }),
    [matchLogs]
  );
  const myPair = useMemo(
    () => selected ? calcPersonalSynergy({ matrix: synergyMatrix, player: selected, topN: 3 }) : { best: [], worst: [] },
    [synergyMatrix, selected]
  );

  // PR / 월랭킹 (HallOfFame 흡수분)
  const personalRecords = useMemo(
    () => calcPersonalRecords({ playerGameLogs: playerGameLogs || [] }),
    [playerGameLogs]
  );
  const monthlyRanking = useMemo(
    () => calcMonthlyRanking({ playerGameLogs: playerGameLogs || [] }),
    [playerGameLogs]
  );

  // === PlayerCardTab.jsx의 본문 로직(레이더 값 산출, 트렌드, 스트릭, 디테일표)을 그대로 복사 ===
  // 분량이 길어 본 플랜에서는 생략 — 구현 시 PlayerCardTab.jsx 90~385줄을 통째로 옮긴 뒤
  // 그 아래에 RoundDistribution / SoloGoalDonut / PersonalSynergyCard / PR / 월랭킹 섹션을 추가.

  if (!selected) {
    return <div style={{ textAlign: 'center', padding: 30, color: C.gray }}>선수 데이터 없음</div>;
  }

  return (
    <div>
      {/* 1. 선수 드롭다운 */}
      <div style={{ marginBottom: 14 }}>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, fontSize: 13, background: C.cardLight, color: C.gray, border: `1px solid ${C.grayDarker}` }}>
          {players.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* 2~3. PlayerCardTab 본문(레이더+뱃지+디테일표+트렌드+스트릭) — PlayerCardTab.jsx 코드 통째 이전 */}
      {/* === PASTE PlayerCardTab의 return JSX 본문 === */}

      {/* 4. P3 */}
      <div style={{ marginTop: 24, padding: 14, background: C.cardLight, borderRadius: 12 }}>
        <RoundDistribution data={roundSlope.perPlayer[selected]} player={selected} ranking={roundSlope.ranking} C={C} />
      </div>

      {/* 5. P4 */}
      <div style={{ marginTop: 14, padding: 14, background: C.cardLight, borderRadius: 12 }}>
        <SoloGoalDonut data={soloRatio.perPlayer[selected]} player={selected} ranking={soloRatio.ranking} C={C} />
      </div>

      {/* 6. C5 */}
      <div style={{ marginTop: 14, padding: 14, background: C.cardLight, borderRadius: 12 }}>
        <PersonalSynergyCard data={myPair} C={C} />
      </div>

      {/* 7. PR (HallOfFame 흡수) — HallOfFameTab.jsx의 PR 섹션 그대로 이전 */}
      {/* === PASTE HallOfFameTab의 PR JSX === */}

      {/* 8. 월별 TOP5 (HallOfFame 흡수) — HallOfFameTab.jsx의 월랭킹 섹션 그대로 이전 */}
      {/* === PASTE HallOfFameTab의 월랭킹 JSX === */}
    </div>
  );
}
```

**중요:** 위 코드의 `=== PASTE ... ===` 주석은 실제 구현 시 `PlayerCardTab.jsx` (90~385줄) 와 `HallOfFameTab.jsx` (전체)의 JSX 본문을 그대로 복사해 채우는 자리. 헬퍼 함수(`RadarChart`, `TrendLineChart`)도 함께 복사. 추후 Task 15에서 V2 컴포넌트를 삭제하므로 코드 중복은 잠시만 유지된다.

- [ ] **Step 3: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analytics/PersonalAnalysisTab.jsx
git commit -m "feat(analyticsV3): PersonalAnalysisTab — PlayerCard+HallOfFame+P3/P4/C5 통합"
```

---

### Task 12: ChemistryTab + GoldenTrioView 분리

**Files:**
- Create: `src/components/dashboard/analytics/ChemistryTab.jsx`
- Create: `src/components/dashboard/analytics/GoldenTrioView.jsx`

**Spec ref:** §7

`GoldenTrioTab.jsx`의 본문을 `GoldenTrioView.jsx`로 옮기고, `ChemistryTab.jsx`가 sub-tab 헤더 + 3개 view(`GoldenTrioView` / `AssistPairList` / `GkChemistryView`) 스위처 역할.

- [ ] **Step 1: Read existing GoldenTrioTab**

```bash
cat src/components/dashboard/analytics/GoldenTrioTab.jsx
```

- [ ] **Step 2: Write GoldenTrioView.jsx**

기존 `GoldenTrioTab.jsx`의 default export 함수 본문을 그대로 복사하여 `GoldenTrioView`라는 이름으로 새 파일에 export. props 시그니처 동일(`{ matchLogs, C }`).

```jsx
// src/components/dashboard/analytics/GoldenTrioView.jsx
// === 본문은 src/components/dashboard/analytics/GoldenTrioTab.jsx 본문을 그대로 복사. ===
// 함수명만 GoldenTrioTab → GoldenTrioView 로 변경하여 export.
```

- [ ] **Step 3: Write ChemistryTab.jsx**

```jsx
// src/components/dashboard/analytics/ChemistryTab.jsx
import { useState, useMemo } from 'react';
import { calcAssistPairs } from '../../../utils/analyticsV2/calcAssistPairs';
import { calcGkChemistry } from '../../../utils/analyticsV2/calcGkChemistry';
import GoldenTrioView from './GoldenTrioView';
import AssistPairList from './AssistPairList';
import GkChemistryView from './GkChemistryView';

export default function ChemistryTab({ matchLogs, eventLogs, C }) {
  const [sub, setSub] = useState('trio');

  const assistPairs = useMemo(
    () => calcAssistPairs({ eventLogs: eventLogs || [], threshold: 3, topN: 10 }),
    [eventLogs]
  );
  const gkChem = useMemo(
    () => calcGkChemistry({ matchLogs: matchLogs || [], threshold: 5 }),
    [matchLogs]
  );

  const subs = [
    { key: 'trio', label: '골든트리오' },
    { key: 'assist', label: '어시페어' },
    { key: 'gk', label: 'GK케미' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{
            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: sub === s.key ? C.accent : 'transparent',
            color: sub === s.key ? C.black : C.gray,
            border: `1px solid ${sub === s.key ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>
      {sub === 'trio' && <GoldenTrioView matchLogs={matchLogs} C={C} />}
      {sub === 'assist' && <AssistPairList pairs={assistPairs} C={C} />}
      {sub === 'gk' && <GkChemistryView chem={gkChem} C={C} />}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/analytics/GoldenTrioView.jsx src/components/dashboard/analytics/ChemistryTab.jsx
git commit -m "feat(analyticsV3): ChemistryTab sub-tab 래퍼 + GoldenTrioView 분리"
```

---

### Task 13: AwardsTab 업데이트 (후반폭격기 / 혼자박는자 카드 추가)

**Files:**
- Modify: `src/components/dashboard/analytics/AwardsTab.jsx`

**Spec ref:** §8

기존 카드(불꽃/수호신/자책) 아래에 후반폭격기·초반강자·혼자박는자 3개 카드 추가. P3/P4 calc는 props로 받음.

- [ ] **Step 1: Read current AwardsTab.jsx**

```bash
cat src/components/dashboard/analytics/AwardsTab.jsx
```

- [ ] **Step 2: Update AwardsTab.jsx**

```jsx
// src/components/dashboard/analytics/AwardsTab.jsx
import { useMemo } from 'react';
import { calcAwards } from '../../../utils/analyticsV2/calcAwards';
import { calcRoundSlope } from '../../../utils/analyticsV2/calcRoundSlope';
import { calcSoloGoalRatio } from '../../../utils/analyticsV2/calcSoloGoalRatio';

export default function AwardsTab({ playerGameLogs, eventLogs, C }) {
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [] }), [playerGameLogs]);
  const slope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const solo = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);

  const Card = ({ title, items, valueKey, valueFmt }) => (
    <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8 }}>{title}</div>
      {(!items || items.length === 0) ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
      ) : items.map((it, i) => (
        <div key={`${it.player}|${i}`} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '4px 0', fontSize: 12,
          borderBottom: i < items.length - 1 ? `1px dashed ${C.grayDarker}` : 'none',
        }}>
          <span style={{ color: C.gray }}>#{i + 1} {it.player}</span>
          <span style={{ color: C.green, fontWeight: 600 }}>{valueFmt(it[valueKey])}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <Card title="🔥 불꽃 (해트트릭+ 횟수)" items={awards.fireStarter} valueKey="count" valueFmt={v => `${v}회`} />
      <Card title="🛡 수호신 (세션 무실점 GK 횟수)" items={awards.guardian} valueKey="count" valueFmt={v => `${v}회`} />
      <Card title="🤦 자책 누적" items={awards.owngoalKings} valueKey="total" valueFmt={v => `${v}회`} />
      <Card title="🏃 후반 폭격기 (라운드 ↑ → G+A ↑)"
        items={slope.ranking.lateBloomers.slice(0, 3)} valueKey="slope"
        valueFmt={v => `+${v.toFixed(2)}/라운드`} />
      <Card title="🎯 초반 강자 (라운드 ↑ → G+A ↓)"
        items={slope.ranking.earlyBirds.slice(0, 3)} valueKey="slope"
        valueFmt={v => `${v.toFixed(2)}/라운드`} />
      <Card title="🎯 혼자 박는 자 (단독골 비율)"
        items={solo.ranking.soloHeroes.slice(0, 3)} valueKey="soloRatio"
        valueFmt={v => `${Math.round(v * 100)}%`} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analytics/AwardsTab.jsx
git commit -m "feat(analyticsV3): AwardsTab — 후반폭격기/초반강자/혼자박는자 카드 추가"
```

---

### Task 14: SynergyMatrixTab 정렬 토글 + 행/열 재배치

**Files:**
- Modify: `src/components/dashboard/analytics/SynergyMatrixTab.jsx`

**Spec ref:** §6.3

기본(이름순) / 역시너지 TOP / 시너지 TOP 토글. 정렬 모드일 때 각 row의 평균 winRate(자기 자신 제외 페어들) 기준으로 행/열 재배치.

- [ ] **Step 1: Read current SynergyMatrixTab.jsx**

```bash
cat src/components/dashboard/analytics/SynergyMatrixTab.jsx
```

- [ ] **Step 2: Update SynergyMatrixTab.jsx**

기존 컴포넌트의 `players` 배열을 `useMemo`로 정렬 모드별 재계산하도록 변경. 기본 키는 `default`(가나다순), `low`(역시너지 TOP), `high`(시너지 TOP).

수정 핵심: 헤더에 토글 버튼 3개 추가 + `players`를 정렬 결과로 교체.

```jsx
// src/components/dashboard/analytics/SynergyMatrixTab.jsx
import { useState, useMemo } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';

export default function SynergyMatrixTab({ matchLogs, C: Cprop }) {
  const { C: Ctheme } = useTheme();
  const C = Cprop || Ctheme;
  const [selected, setSelected] = useState(null);
  const [sortMode, setSortMode] = useState('default');  // 'default' | 'low' | 'high'

  const data = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);
  const players = useMemo(() => {
    if (sortMode === 'default') return data.players;
    // 각 player에 대해 자기 자신 제외 페어들 평균 winRate 계산
    const avg = {};
    for (const p of data.players) {
      let sum = 0, cnt = 0;
      for (const q of data.players) {
        if (p === q) continue;
        const [a, b] = [p, q].sort((x, y) => x.localeCompare(y, 'ko'));
        const cell = data.cells[`${a}|${b}`];
        if (!cell || cell.games < data.minRounds) continue;
        sum += cell.winRate; cnt += 1;
      }
      avg[p] = cnt > 0 ? sum / cnt : null;
    }
    const list = [...data.players];
    list.sort((p, q) => {
      const av = avg[p], bv = avg[q];
      if (av == null && bv == null) return p.localeCompare(q, 'ko');
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortMode === 'low' ? av - bv : bv - av;
    });
    return list;
  }, [data, sortMode]);

  if (!data.players || data.players.length === 0) {
    return <div style={{ textAlign: 'center', padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }

  const cellSize = 22;
  const colorFor = (cell, isDiag, isSelected) => {
    if (!cell) return C.cardLight;
    if (cell.games < data.minRounds) return C.grayDarker;
    const wr = cell.winRate;
    const intensity = Math.abs(wr - 0.5) * 2;
    const base = wr >= 0.5 ? `rgba(52,199,89,${intensity})` : `rgba(255,59,48,${intensity})`;
    return isSelected ? `rgba(255,204,0,0.6)` : base;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.gray }}>정렬:</span>
        {[
          { k: 'default', l: '기본' },
          { k: 'low', l: '역시너지 TOP' },
          { k: 'high', l: '시너지 TOP' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setSortMode(k)} style={{
            padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 600,
            background: sortMode === k ? C.accent : 'transparent',
            color: sortMode === k ? C.black : C.gray,
            border: `1px solid ${sortMode === k ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은팀 출전 라운드의 팀승률. 초록=고승률, 빨강=저승률, 회색=표본 부족(&lt; {data.minRounds}경기). 셀을 탭하면 아래 상세가 고정됩니다.
      </div>
      <div style={{ overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th />
              {players.map(p => (
                <th key={p} style={{ width: cellSize, writingMode: 'vertical-rl', color: C.gray, fontWeight: 500, padding: 2, position: 'sticky', top: 0, zIndex: 9, background: C.bg }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(a => (
              <tr key={a}>
                <td style={{ color: C.gray, paddingRight: 6, textAlign: 'right', fontSize: 10 }}>{a}</td>
                {players.map(b => {
                  const isDiag = a === b;
                  const [k1, k2] = [a, b].sort((x, y) => x.localeCompare(y, 'ko'));
                  const cell = data.cells[`${k1}|${k2}`];
                  const sel = selected && (selected.a === a && selected.b === b || selected.a === b && selected.b === a);
                  return (
                    <td key={b} onClick={() => setSelected(sel ? null : { a, b, cell, isDiag })}
                      style={{
                        width: cellSize, height: cellSize,
                        background: colorFor(cell, isDiag, sel),
                        cursor: 'pointer', border: `0.5px solid ${C.bg}`,
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{
        marginTop: 12, padding: '8px 12px',
        background: C.cardLight, borderRadius: 8,
        fontSize: 12, color: selected?.isDiag ? C.white : C.gray, minHeight: 36, boxSizing: 'border-box',
      }}>
        {selected ? (
          selected.cell && selected.cell.games >= data.minRounds ? (
            selected.isDiag ? (
              <><b>{selected.a}</b> 개인 전체: {selected.cell.games}경기 {selected.cell.wins}승 {selected.cell.draws}무 {selected.cell.losses}패 · 승률 {Math.round(selected.cell.winRate * 100)}%</>
            ) : (
              <><b>{selected.a} × {selected.b}</b>: {selected.cell.games}경기 {selected.cell.wins}승 {selected.cell.draws}무 {selected.cell.losses}패 · 승률 {Math.round(selected.cell.winRate * 100)}%</>
            )
          ) : <span>표본 부족</span>
        ) : <span>셀을 탭하면 상세가 표시됩니다.</span>}
      </div>
    </div>
  );
}
```

**참고:** 위 코드는 V2 SynergyMatrixTab의 구조를 거의 그대로 유지하면서 `sortMode` state와 정렬 useMemo만 추가. 본 플랜에서는 V2 파일 전체를 위 코드로 교체. 헤더 색상·셀 사이즈·color 함수는 V2 그대로.

- [ ] **Step 3: Verify build**

```bash
npx vite build
```
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analytics/SynergyMatrixTab.jsx
git commit -m "feat(analyticsV3): SynergyMatrixTab 정렬 토글 + 행/열 재배치"
```

---

## Phase D — Wire-up + Cleanup

### Task 15: PlayerAnalytics 탭 매핑 갱신 + V2 컴포넌트 삭제

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx`
- Delete: `src/components/dashboard/analytics/PlayerCardTab.jsx`
- Delete: `src/components/dashboard/analytics/HallOfFameTab.jsx`
- Delete: `src/components/dashboard/analytics/GoldenTrioTab.jsx`

**Spec ref:** §10, §14

탭 키를 V3 매핑으로 변경:
- `playercard | halloffame | synergy | trio | awards | crovaguma`
- → `personal | synergy | chem | awards | crovaguma`

`initialTab` prop으로 들어올 수 있는 값(`playercard`/`halloffame`/`trio`)을 V3 키(`personal`/`personal`/`chem`)로 매핑하는 호환 로직 추가.

- [ ] **Step 1: Update PlayerAnalytics.jsx**

```jsx
// src/components/dashboard/PlayerAnalytics.jsx
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import { fetchSheetData } from '../../services/sheetService';
import { getSettings, getEffectiveSettings } from '../../config/settings';
import { buildGameRecordsFromLogs } from '../../utils/gameRecordBuilder';
import { calcDefenseStats, calcWinContribution, calcWinStatsFromPointLog } from '../../utils/gameStateAnalyzer';

import PersonalAnalysisTab from './analytics/PersonalAnalysisTab';
import SynergyMatrixTab from './analytics/SynergyMatrixTab';
import ChemistryTab from './analytics/ChemistryTab';
import AwardsTab from './analytics/AwardsTab';
import CrovaGogumaRankTab from './analytics/CrovaGogumaRankTab';

const LEGACY_TAB_MAP = {
  playercard: 'personal',
  halloffame: 'personal',
  trio: 'chem',
};

export default function PlayerAnalytics({ teamName, teamMode, initialTab, isAdmin, authUserName }) {
  const isSoccer = teamMode === "축구";
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState(null);
  const [events, setEvents] = useState(null);
  const [playerLog, setPlayerLog] = useState(null);
  const [playerGameLogs, setPlayerGameLogs] = useState([]);
  const [matchLogs, setMatchLogs] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);
  const [gameRecords, setGameRecords] = useState([]);

  const initial = initialTab && LEGACY_TAB_MAP[initialTab] ? LEGACY_TAB_MAP[initialTab] : (initialTab || 'personal');
  const [tab, setTab] = useState(initial);

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
      setEventLogs(eRows);
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
    { key: "personal", label: "개인분석" },
    { key: "synergy", label: "시너지매트릭스" },
    { key: "chem", label: "케미" },
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

      {tab === "personal" && (
        <PersonalAnalysisTab
          playerLog={playerLog || []} members={members}
          defenseStats={defenseStats} winStats={winStats} gameRecords={gameRecords}
          playerGameLogs={playerGameLogs} matchLogs={matchLogs} eventLogs={eventLogs}
          C={C} authUserName={authUserName}
        />
      )}
      {tab === "synergy" && <SynergyMatrixTab matchLogs={matchLogs} C={C} />}
      {tab === "chem" && <ChemistryTab matchLogs={matchLogs} eventLogs={eventLogs} C={C} />}
      {tab === "awards" && <AwardsTab playerGameLogs={playerGameLogs} eventLogs={eventLogs} C={C} />}
      {tab === "crovaguma" && showCrovaGoguma && (
        <CrovaGogumaRankTab members={members || []} C={C} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete V2 컴포넌트**

```bash
rm src/components/dashboard/analytics/PlayerCardTab.jsx
rm src/components/dashboard/analytics/HallOfFameTab.jsx
rm src/components/dashboard/analytics/GoldenTrioTab.jsx
```

- [ ] **Step 3: Verify build**

```bash
npx vite build
```
Expected: SUCCESS, no missing imports.

- [ ] **Step 4: Run all analytics tests**

```bash
npx vitest run src/utils/analyticsV2
```
Expected: All tests pass.

- [ ] **Step 5: Manual smoke test**

```bash
npx vite
```
브라우저 접속 후:
1. 분석 탭 진입 → 5개 탭(개인분석/시너지매트릭스/케미/어워드/🍀🍠) 노출 확인
2. 개인분석 탭에서 본인 자동 선택, P3 막대그래프, P4 도넛, C5 짝꿍 카드, PR, 월랭킹 표시 확인
3. 케미 탭에서 sub-tab 3개(골든트리오/어시페어/GK케미) 전환 동작 확인
4. 어워드 탭에서 신규 3개 카드(후반폭격기/초반강자/혼자박는자) 표시 확인
5. 시너지매트릭스 탭에서 정렬 토글 3개 전환 동작 확인

- [ ] **Step 6: Commit**

```bash
git add -A src/components/dashboard/PlayerAnalytics.jsx src/components/dashboard/analytics/
git commit -m "feat(analyticsV3): 탭 매핑 V3 전환 + V2 컴포넌트 삭제

- PlayerAnalytics.jsx: tab keys playercard/halloffame/trio → personal/chem
  + LEGACY_TAB_MAP으로 외부에서 들어오는 V2 키 호환
- 삭제: PlayerCardTab, HallOfFameTab (PersonalAnalysisTab으로 흡수)
- 삭제: GoldenTrioTab (GoldenTrioView로 흡수)"
```

---

## Self-Review

**1. Spec coverage:**
- §1 도메인 제약 → Task 1 (G+A≥1 라운드만), Task 4 (그날 같은 팀 로스터 근사) ✓
- §2 목표 → 전체 ✓
- §4 5탭 구조 → Task 15 ✓
- §5 개인분석 8섹션 → Task 11 ✓
- §6.1 P3 → Task 1 + Task 6 + Task 13 ✓
- §6.2 P4 → Task 2 + Task 7 + Task 13 ✓
- §6.3 C2 → Task 14 ✓
- §6.4 C3 → Task 3 + Task 9 ✓
- §6.5 C4 → Task 4 + Task 10 ✓
- §6.6 C5 → Task 5 + Task 8 ✓
- §7 케미 sub-tab → Task 12 ✓
- §8 어워드 신규 카드 → Task 13 ✓
- §10 파일 구조 → 전체 ✓
- §11 UI 변경 → Task 15 (탭 5개), Task 11 (선수1회), Task 12 (sub-tab) ✓
- §12 임계값 → 각 calc 함수 default 인자 ✓
- §13 테스트 전략 → Task 1~5 vitest ✓
- §14 마이그레이션 → Task 15 LEGACY_TAB_MAP, V2 백업 보존 (`PlayerAnalyticsLegacy.jsx`는 손대지 않음) ✓

**2. Placeholder scan:**
- Task 11 step 2의 `=== PASTE PlayerCardTab ... ===` 주석은 placeholder가 아니라 "기존 V2 코드를 그대로 옮기라"는 명시적 지시. 단순 복붙이라 코드 재작성 불필요. PlayerCardTab의 90~385줄 + HallOfFameTab 전체를 통째로 새 컴포넌트로 옮기는 작업이라 본 플랜에 V2 코드를 다시 적는 건 DRY 위반이라 의도적으로 생략. 구현자는 `cat src/.../PlayerCardTab.jsx`로 원본을 읽어 그대로 붙여넣기.
- 그 외 TBD/TODO 없음 ✓

**3. Type consistency:**
- `calcRoundSlope` → `{ perPlayer, ranking: { lateBloomers, earlyBirds } }` (Task 1 정의 ↔ Task 6 사용 ↔ Task 13 사용) ✓
- `calcSoloGoalRatio` → `{ perPlayer, ranking: { soloHeroes } }` (Task 2 ↔ Task 7 ↔ Task 13) ✓
- `calcAssistPairs` → `[{assister, scorer, count}]` (Task 3 ↔ Task 9) ✓
- `calcGkChemistry` → `{ gks, byGk: { [gk]: { pairs, worst } } }` (Task 4 ↔ Task 10) ✓
- `calcPersonalSynergy` → `{ best, worst }` (Task 5 ↔ Task 8) ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-analytics-v3.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

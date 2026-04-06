# 선수 분석 3종 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 과거 경기 상태JSON을 활용하여 육각형 레이더 차트(선수카드), 시너지 분석, 시간대 패턴 3개 탭을 분석 화면에 추가한다.

**Architecture:** `gameStateAnalyzer.js`가 상태JSON을 파싱하여 표준화된 gameRecords 배열을 생성. 각 탭 컴포넌트(PlayerCardTab, SynergyTab, TimePatternTab)가 이 데이터를 받아 분석/렌더링. PlayerAnalytics.jsx에서 상태JSON 로드 + 3개 탭 추가.

**Tech Stack:** React 19, SVG (레이더 차트), AppSync.getHistory() (기존 API)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/gameStateAnalyzer.js` | Create | 상태JSON 파싱 → gameRecords 배열 생성 + 분석 유틸 (수비력, 승리기여, 시너지, 시간대) |
| `src/components/dashboard/PlayerCardTab.jsx` | Create | 육각형 레이더 차트 + 킬러/메이커 뱃지 |
| `src/components/dashboard/SynergyTab.jsx` | Create | 시너지 분석 (선수 선택 → 동료 승률) |
| `src/components/dashboard/TimePatternTab.jsx` | Create | 시간대 패턴 (전반/후반 골 분포) |
| `src/components/dashboard/PlayerAnalytics.jsx` | Modify | 상태JSON 로드 + 3개 탭 추가 |

---

### Task 1: gameStateAnalyzer.js — 상태JSON 파싱 + 분석 유틸

**Files:**
- Create: `src/utils/gameStateAnalyzer.js`

- [ ] **Step 1: gameStateAnalyzer.js 작성**

```js
// src/utils/gameStateAnalyzer.js

/**
 * 과거 경기 히스토리(stateJson)를 파싱하여 표준화된 gameRecords 배열을 생성한다.
 * @param {Array} history - AppSync.getHistory() 결과 배열
 * @returns {Array} gameRecords
 */
export function parseGameHistory(history) {
  const records = [];
  for (const h of history) {
    if (!h.stateJson) continue;
    let gs;
    try { gs = JSON.parse(h.stateJson); } catch { continue; }
    if (!gs.completedMatches || !gs.teams || !gs.teamNames) continue;
    records.push({
      gameDate: h.gameDate,
      teams: gs.teams || [],
      teamNames: gs.teamNames || [],
      attendees: gs.attendees || [],
      matches: (gs.completedMatches || []).map(m => ({
        matchId: m.matchId, homeIdx: m.homeIdx, awayIdx: m.awayIdx,
        homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeGk: m.homeGk || "", awayGk: m.awayGk || "",
        isExtra: m.isExtra || false,
      })),
      events: (gs.allEvents || []).map(e => ({
        type: e.type, matchId: e.matchId, player: e.player,
        assist: e.assist, timestamp: e.timestamp,
        scoringTeam: e.scoringTeam, concedingTeam: e.concedingTeam,
      })),
    });
  }
  return records;
}

/**
 * 선수가 어느 팀에 속했는지 찾는다.
 */
function findPlayerTeamIdx(player, teams) {
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].includes(player)) return i;
  }
  return -1;
}

/**
 * 수비력 계산: 필드 플레이 시 팀 평균 실점
 * @returns {{ [playerName]: { fieldMatches: number, totalConceded: number, avgConceded: number } }}
 */
export function calcDefenseStats(gameRecords) {
  const stats = {};
  for (const gr of gameRecords) {
    for (const m of gr.matches) {
      if (m.isExtra) continue;
      const homeTeam = gr.teams[m.homeIdx] || [];
      const awayTeam = gr.teams[m.awayIdx] || [];

      // 홈팀 필드 플레이어 (GK 제외)
      homeTeam.forEach(p => {
        if (p === m.homeGk) return;
        if (!stats[p]) stats[p] = { fieldMatches: 0, totalConceded: 0 };
        stats[p].fieldMatches++;
        stats[p].totalConceded += m.awayScore; // 상대 득점 = 우리 실점
      });
      // 어웨이팀 필드 플레이어
      awayTeam.forEach(p => {
        if (p === m.awayGk) return;
        if (!stats[p]) stats[p] = { fieldMatches: 0, totalConceded: 0 };
        stats[p].fieldMatches++;
        stats[p].totalConceded += m.homeScore;
      });
    }
  }
  Object.values(stats).forEach(s => {
    s.avgConceded = s.fieldMatches > 0 ? s.totalConceded / s.fieldMatches : 0;
  });
  return stats;
}

/**
 * 승리기여 계산: 선수 소속팀 승률
 * @returns {{ [playerName]: { matches: number, wins: number, draws: number, losses: number, winRate: number } }}
 */
export function calcWinContribution(gameRecords) {
  const stats = {};
  for (const gr of gameRecords) {
    for (const m of gr.matches) {
      if (m.isExtra) continue;
      const homeTeam = gr.teams[m.homeIdx] || [];
      const awayTeam = gr.teams[m.awayIdx] || [];
      const homeWin = m.homeScore > m.awayScore;
      const draw = m.homeScore === m.awayScore;

      homeTeam.forEach(p => {
        if (!stats[p]) stats[p] = { matches: 0, wins: 0, draws: 0, losses: 0 };
        stats[p].matches++;
        if (homeWin) stats[p].wins++; else if (draw) stats[p].draws++; else stats[p].losses++;
      });
      awayTeam.forEach(p => {
        if (!stats[p]) stats[p] = { matches: 0, wins: 0, draws: 0, losses: 0 };
        stats[p].matches++;
        if (!homeWin && !draw) stats[p].wins++; else if (draw) stats[p].draws++; else stats[p].losses++;
      });
    }
  }
  Object.values(stats).forEach(s => {
    s.winRate = s.matches > 0 ? (s.wins + s.draws * 0.5) / s.matches : 0;
  });
  return stats;
}

/**
 * 시너지 계산: 두 선수가 같은 팀일 때 승률
 * @returns {{ [playerA]: { [playerB]: { games, wins, draws, losses, winRate } } }}
 */
export function calcSynergy(gameRecords) {
  const synergy = {};
  for (const gr of gameRecords) {
    for (const m of gr.matches) {
      if (m.isExtra) continue;
      const homeTeam = gr.teams[m.homeIdx] || [];
      const awayTeam = gr.teams[m.awayIdx] || [];
      const homeWin = m.homeScore > m.awayScore;
      const draw = m.homeScore === m.awayScore;

      const processTeam = (team, isWin) => {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const a = team[i], b = team[j];
            if (!synergy[a]) synergy[a] = {};
            if (!synergy[a][b]) synergy[a][b] = { games: 0, wins: 0, draws: 0, losses: 0 };
            if (!synergy[b]) synergy[b] = {};
            if (!synergy[b][a]) synergy[b][a] = { games: 0, wins: 0, draws: 0, losses: 0 };
            synergy[a][b].games++;
            synergy[b][a].games++;
            if (isWin) { synergy[a][b].wins++; synergy[b][a].wins++; }
            else if (draw) { synergy[a][b].draws++; synergy[b][a].draws++; }
            else { synergy[a][b].losses++; synergy[b][a].losses++; }
          }
        }
      };
      processTeam(homeTeam, homeWin);
      processTeam(awayTeam, !homeWin && !draw);
    }
  }
  // winRate 계산
  Object.values(synergy).forEach(partners => {
    Object.values(partners).forEach(s => {
      s.winRate = s.games > 0 ? (s.wins + s.draws * 0.5) / s.games : 0;
    });
  });
  return synergy;
}

/**
 * 시간대 패턴: 선수별 전반/후반 골 분포
 * 같은 matchId의 첫 이벤트를 0분 기준으로 상대 시간 계산. 10분 기준 전반/후반 분류.
 * @returns {{ [playerName]: { early: number, late: number, total: number } }}
 */
export function calcTimePattern(gameRecords) {
  const SPLIT_MINUTES = 10;
  const stats = {};
  for (const gr of gameRecords) {
    // matchId별 첫 이벤트 시간
    const firstTimestamp = {};
    for (const e of gr.events) {
      if (!e.timestamp) continue;
      if (!firstTimestamp[e.matchId] || e.timestamp < firstTimestamp[e.matchId]) {
        firstTimestamp[e.matchId] = e.timestamp;
      }
    }
    for (const e of gr.events) {
      if (e.type !== "goal" || !e.player || !e.timestamp) continue;
      const first = firstTimestamp[e.matchId];
      if (!first) continue;
      const minutes = (e.timestamp - first) / 60000;
      if (!stats[e.player]) stats[e.player] = { early: 0, late: 0, total: 0 };
      if (minutes < SPLIT_MINUTES) stats[e.player].early++;
      else stats[e.player].late++;
      stats[e.player].total++;
    }
  }
  return stats;
}

/**
 * 백분위 정규화 (0~100)
 * @param {number[]} values - 모든 선수의 해당 축 값
 * @param {number} value - 대상 선수의 값
 * @param {boolean} lowerIsBetter - true면 낮을수록 높은 점수 (실점률 등)
 */
export function percentile(values, value, lowerIsBetter = false) {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = sorted.findIndex(v => v >= value);
  if (rank === -1) rank = sorted.length;
  const pct = (rank / sorted.length) * 100;
  return lowerIsBetter ? pct : 100 - pct;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/utils/gameStateAnalyzer.js
git commit -m "feat: 상태JSON 파싱 + 수비력/승리기여/시너지/시간대 분석 유틸"
```

---

### Task 2: PlayerCardTab.jsx — 육각형 레이더 차트

**Files:**
- Create: `src/components/dashboard/PlayerCardTab.jsx`

- [ ] **Step 1: PlayerCardTab.jsx 작성**

```jsx
// src/components/dashboard/PlayerCardTab.jsx
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { percentile } from '../../utils/gameStateAnalyzer';

const AXES = [
  { key: "scoring", label: "득점력" },
  { key: "creativity", label: "창의력" },
  { key: "defense", label: "수비력" },
  { key: "keeping", label: "키퍼" },
  { key: "attendance", label: "참석률" },
  { key: "winRate", label: "승리기여" },
];

function RadarChart({ values, size = 200, C }) {
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = AXES.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (i, ratio) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + r * ratio * Math.cos(angle), y: cy + r * ratio * Math.sin(angle) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = AXES.map((_, i) => getPoint(i, (values[i] || 0) / 100));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 격자 */}
      {gridLevels.map(level => {
        const pts = Array.from({ length: n }, (_, i) => getPoint(i, level));
        return <polygon key={level} points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={C.grayDarker} strokeWidth={0.5} />;
      })}
      {/* 축선 */}
      {AXES.map((_, i) => {
        const p = getPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={C.grayDarker} strokeWidth={0.5} />;
      })}
      {/* 데이터 영역 */}
      <polygon points={dataPoints.map(p => `${p.x},${p.y}`).join(" ")} fill={C.accent + "33"} stroke={C.accent} strokeWidth={2} />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={C.accent} />)}
      {/* 축 라벨 */}
      {AXES.map((axis, i) => {
        const p = getPoint(i, 1.22);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={C.gray} fontSize={10} fontWeight={600}>{axis.label}</text>;
      })}
    </svg>
  );
}

function getPlayerType(values) {
  const [scoring, creativity] = values;
  if (scoring >= 70 && scoring > creativity * 1.5) return { label: "킬러", color: "#ef4444" };
  if (creativity >= 70 && creativity > scoring * 1.5) return { label: "메이커", color: "#3b82f6" };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= 60) return { label: "올라운더", color: "#22c55e" };
  return { label: "", color: "" };
}

export default function PlayerCardTab({ playerLog, defenseStats, winStats, C }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // playerLog에서 선수별 골/어시/경기수/실점률 집계
  const playerSummary = useMemo(() => {
    const map = {};
    playerLog.forEach(p => {
      if (!map[p.name]) map[p.name] = { games: 0, goals: 0, assists: 0, keeperGames: 0, conceded: 0 };
      map[p.name].games++;
      map[p.name].goals += p.goals || 0;
      map[p.name].assists += p.assists || 0;
      map[p.name].keeperGames += p.keeperGames || 0;
      map[p.name].conceded += p.conceded || 0;
    });
    return map;
  }, [playerLog]);

  const players = useMemo(() => Object.keys(playerSummary).filter(n => playerSummary[n].games >= 3).sort((a, b) => a.localeCompare(b, "ko")), [playerSummary]);
  const maxGames = useMemo(() => Math.max(...Object.values(playerSummary).map(s => s.games), 1), [playerSummary]);

  // 모든 선수의 축별 raw 값 → 백분위 계산용
  const allRawValues = useMemo(() => {
    const scoring = [], creativity = [], defense = [], keeping = [], attendance = [], winRate = [];
    players.forEach(name => {
      const s = playerSummary[name];
      const d = defenseStats[name];
      const w = winStats[name];
      scoring.push(s.games > 0 ? s.goals / s.games : 0);
      creativity.push(s.games > 0 ? s.assists / s.games : 0);
      defense.push(d ? d.avgConceded : 999);
      keeping.push(s.keeperGames > 0 ? s.conceded / s.keeperGames : 999);
      attendance.push(s.games / maxGames);
      winRate.push(w ? w.winRate : 0);
    });
    return { scoring, creativity, defense, keeping, attendance, winRate };
  }, [players, playerSummary, defenseStats, winStats, maxGames]);

  const getPlayerValues = (name) => {
    const s = playerSummary[name];
    const d = defenseStats[name];
    const w = winStats[name];
    if (!s) return [50, 50, 50, 50, 50, 50];
    const raw = {
      scoring: s.games > 0 ? s.goals / s.games : 0,
      creativity: s.games > 0 ? s.assists / s.games : 0,
      defense: d ? d.avgConceded : 999,
      keeping: s.keeperGames > 0 ? s.conceded / s.keeperGames : 999,
      attendance: s.games / maxGames,
      winRate: w ? w.winRate : 0,
    };
    return [
      percentile(allRawValues.scoring, raw.scoring),
      percentile(allRawValues.creativity, raw.creativity),
      percentile(allRawValues.defense, raw.defense, true),
      percentile(allRawValues.keeping, raw.keeping, true),
      percentile(allRawValues.attendance, raw.attendance),
      percentile(allRawValues.winRate, raw.winRate),
    ];
  };

  const selected = selectedPlayer || players[0];
  const values = selected ? getPlayerValues(selected) : [50, 50, 50, 50, 50, 50];
  const type = getPlayerType(values);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select value={selected || ""} onChange={e => setSelectedPlayer(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }}>
          {players.map(p => <option key={p} value={p}>{p} ({playerSummary[p].games}경기)</option>)}
        </select>
      </div>

      {selected && (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.white }}>{selected}</span>
            {type.label && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: type.color + "22", color: type.color }}>{type.label}</span>
            )}
          </div>
          <RadarChart values={values} C={C} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 8 }}>
            {AXES.map((axis, i) => (
              <div key={axis.key} style={{ fontSize: 11, color: C.gray }}>
                {axis.label}: <span style={{ fontWeight: 700, color: C.white }}>{Math.round(values[i])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/PlayerCardTab.jsx
git commit -m "feat: 선수카드 탭 — 육각형 레이더 차트 + 킬러/메이커 뱃지"
```

---

### Task 3: SynergyTab.jsx — 시너지 분석

**Files:**
- Create: `src/components/dashboard/SynergyTab.jsx`

- [ ] **Step 1: SynergyTab.jsx 작성**

```jsx
// src/components/dashboard/SynergyTab.jsx
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function SynergyTab({ synergyData, playerLog, C }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const players = useMemo(() => {
    return Object.keys(synergyData).sort((a, b) => a.localeCompare(b, "ko"));
  }, [synergyData]);

  const selected = selectedPlayer || players[0];

  const partners = useMemo(() => {
    if (!selected || !synergyData[selected]) return [];
    return Object.entries(synergyData[selected])
      .filter(([, s]) => s.games >= 2)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [selected, synergyData]);

  const top5 = partners.slice(0, 5);
  const bottom5 = [...partners].sort((a, b) => a.winRate - b.winRate).slice(0, 5);

  const renderRow = (p, i, color) => (
    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 16 }}>{i + 1}</span>
      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
      <span style={{ fontSize: 11, color: C.gray }}>{p.games}경기</span>
      <span style={{ fontSize: 11, color: C.gray }}>{p.wins}승 {p.draws}무 {p.losses}패</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 40, textAlign: "right" }}>{Math.round(p.winRate * 100)}%</span>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select value={selected || ""} onChange={e => setSelectedPlayer(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }}>
          {players.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {selected && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>Best 시너지 TOP 5</div>
            {top5.length === 0 ? <div style={{ fontSize: 12, color: C.gray }}>데이터 부족 (최소 2경기)</div> :
              top5.map((p, i) => renderRow(p, i, "#22c55e"))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Worst 시너지 TOP 5</div>
            {bottom5.length === 0 ? <div style={{ fontSize: 12, color: C.gray }}>데이터 부족</div> :
              bottom5.map((p, i) => renderRow(p, i, "#ef4444"))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/SynergyTab.jsx
git commit -m "feat: 시너지 탭 — 선수 선택 시 Best/Worst 동료 승률"
```

---

### Task 4: TimePatternTab.jsx — 시간대 패턴

**Files:**
- Create: `src/components/dashboard/TimePatternTab.jsx`

- [ ] **Step 1: TimePatternTab.jsx 작성**

```jsx
// src/components/dashboard/TimePatternTab.jsx
import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TimePatternTab({ timeStats, C }) {
  const players = useMemo(() => {
    return Object.entries(timeStats)
      .filter(([, s]) => s.total >= 2)
      .map(([name, s]) => ({ name, ...s, earlyPct: Math.round((s.early / s.total) * 100), latePct: Math.round((s.late / s.total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [timeStats]);

  if (players.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터 부족</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>
        첫 골 시점 기준 10분 전후로 전반/후반 분류 (참고용)
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, fontSize: 10, color: C.gray }}>
        <span style={{ flex: 1 }}>선수</span>
        <span style={{ width: 30, textAlign: "center" }}>전반</span>
        <span style={{ flex: 2 }}>비율</span>
        <span style={{ width: 30, textAlign: "center" }}>후반</span>
        <span style={{ width: 30, textAlign: "center" }}>합계</span>
      </div>
      {players.map(p => (
        <div key={p.name} style={{ display: "flex", gap: 4, alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.white }}>{p.name}</span>
          <span style={{ width: 30, textAlign: "center", fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>{p.early}</span>
          <div style={{ flex: 2, display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: C.grayDarker }}>
            <div style={{ width: `${p.earlyPct}%`, background: "#3b82f6", borderRadius: "7px 0 0 7px", transition: "width 0.3s" }} />
            <div style={{ width: `${p.latePct}%`, background: "#f97316", borderRadius: "0 7px 7px 0", transition: "width 0.3s" }} />
          </div>
          <span style={{ width: 30, textAlign: "center", fontSize: 11, color: "#f97316", fontWeight: 700 }}>{p.late}</span>
          <span style={{ width: 30, textAlign: "center", fontSize: 11, color: C.gray }}>{p.total}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 10, color: C.gray }}>
        <span><span style={{ color: "#3b82f6" }}>■</span> 전반 (0~10분)</span>
        <span><span style={{ color: "#f97316" }}>■</span> 후반 (10분~)</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/TimePatternTab.jsx
git commit -m "feat: 시간대 패턴 탭 — 전반/후반 골 분포 바 차트"
```

---

### Task 5: PlayerAnalytics.jsx 통합 — 상태JSON 로드 + 3개 탭 추가

**Files:**
- Modify: `src/components/dashboard/PlayerAnalytics.jsx`

- [ ] **Step 1: import 추가**

파일 상단에 추가:

```js
import { parseGameHistory, calcDefenseStats, calcWinContribution, calcSynergy, calcTimePattern } from '../../utils/gameStateAnalyzer';
import PlayerCardTab from './PlayerCardTab';
import SynergyTab from './SynergyTab';
import TimePatternTab from './TimePatternTab';
import AppSync from '../../services/appSync';
```

주의: AppSync가 이미 import 되어있으면 중복하지 않음.

- [ ] **Step 2: 상태JSON 로드 state 추가**

기존 state 선언 근처 (line 240 부근)에 추가:

```js
  const [gameRecords, setGameRecords] = useState(null);
  const [gameRecordsLoading, setGameRecordsLoading] = useState(false);
```

- [ ] **Step 3: 상태JSON 로드 함수 추가**

기존 useEffect 뒤에:

```js
  useEffect(() => {
    if (tab === "playercard" || tab === "synergy" || tab === "timepattern") {
      if (!gameRecords && !gameRecordsLoading) {
        setGameRecordsLoading(true);
        AppSync.getHistory().then(history => {
          setGameRecords(parseGameHistory(history));
        }).catch(err => {
          console.warn("상태JSON 로드 실패:", err);
          setGameRecords([]);
        }).finally(() => setGameRecordsLoading(false));
      }
    }
  }, [tab, gameRecords, gameRecordsLoading]);
```

- [ ] **Step 4: 분석 데이터 useMemo 추가**

```js
  const defenseStats = useMemo(() => gameRecords ? calcDefenseStats(gameRecords) : {}, [gameRecords]);
  const winStats = useMemo(() => gameRecords ? calcWinContribution(gameRecords) : {}, [gameRecords]);
  const synergyData = useMemo(() => gameRecords ? calcSynergy(gameRecords) : {}, [gameRecords]);
  const timeStats = useMemo(() => gameRecords ? calcTimePattern(gameRecords) : {}, [gameRecords]);
```

- [ ] **Step 5: tabs 배열에 3개 탭 추가**

기존:
```js
  const tabs = [
    { key: "combo", label: "골든콤비" },
    { key: "killer", label: "키퍼킬러" },
    { key: "race", label: "시즌레이스" },
    { key: "chemistry", label: "케미" },
    { key: "crovaguma", label: "🍀/🍠" },
    ...(initialTab === "dualteam" ? [{ key: "dualteam", label: "팀전" }] : []),
  ];
```

변경:
```js
  const tabs = [
    { key: "combo", label: "골든콤비" },
    { key: "killer", label: "키퍼킬러" },
    { key: "race", label: "시즌레이스" },
    { key: "chemistry", label: "케미" },
    { key: "crovaguma", label: "🍀/🍠" },
    { key: "playercard", label: "선수카드" },
    { key: "synergy", label: "시너지" },
    { key: "timepattern", label: "시간대" },
    ...(initialTab === "dualteam" ? [{ key: "dualteam", label: "팀전" }] : []),
  ];
```

- [ ] **Step 6: 탭 콘텐츠 렌더링 추가**

`{tab === "dualteam"` 블록 바로 앞에 추가:

```jsx
      {tab === "playercard" && (
        gameRecordsLoading ? <div style={{ textAlign: "center", padding: 20, color: C.gray }}>경기 데이터 로딩 중...</div> :
        playerLog ? <PlayerCardTab playerLog={playerLog} defenseStats={defenseStats} winStats={winStats} C={C} /> :
        <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터 없음</div>
      )}

      {tab === "synergy" && (
        gameRecordsLoading ? <div style={{ textAlign: "center", padding: 20, color: C.gray }}>경기 데이터 로딩 중...</div> :
        <SynergyTab synergyData={synergyData} playerLog={playerLog} C={C} />
      )}

      {tab === "timepattern" && (
        gameRecordsLoading ? <div style={{ textAlign: "center", padding: 20, color: C.gray }}>경기 데이터 로딩 중...</div> :
        <TimePatternTab timeStats={timeStats} C={C} />
      )}
```

- [ ] **Step 7: 커밋**

```bash
git add src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat: 분석 탭에 선수카드/시너지/시간대 3개 탭 통합"
```

---

### Task 6: 빌드 검증

- [ ] **Step 1: 빌드 성공 확인**

```bash
cd /Users/rh/Desktop/python_dev/footsal_webapp && npm run build
```

- [ ] **Step 2: 문제 있으면 수정 후 커밋**

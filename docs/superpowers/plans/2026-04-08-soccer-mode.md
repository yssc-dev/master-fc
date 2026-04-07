# 축구 모드 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 풋살 플랫폼에 축구(11v11) 경기 기록 모드를 추가한다.

**Architecture:** 축구 전용 컴포넌트(SoccerMatchView, SoccerRecorder, LineupSelector 등)를 새로 만들고, 기존 서비스(Firebase, Apps Script, sheetService)를 재사용한다. `matchMode: "soccer"` 분기로 App.jsx에서 축구 흐름을 분리하며, 축구는 팀빌드 단계를 건너뛰고 바로 경기 진행으로 들어간다.

**Tech Stack:** React 19, Vite, Firebase Realtime DB, Google Apps Script, Google Sheets

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/utils/soccerScoring.js` | 클린시트 판정, 축구 포인트 계산, 로그 데이터 빌드 |
| `src/components/game/LineupSelector.jsx` | 출전 11명 선택 + GK/DF 포지션 토글 |
| `src/components/game/OpponentSelector.jsx` | 상대팀 드롭다운 + 새 상대팀 추가 |
| `src/components/game/SubstitutionModal.jsx` | 교체 모달 (OUT/IN 선수 선택) |
| `src/components/game/SoccerRecorder.jsx` | 경기 진행 UI (스코어보드, 골/상대골/교체 버튼, 이벤트 로그) |
| `src/components/game/SoccerMatchView.jsx` | 축구 경기 메인 뷰 (경기 생성→진행→종료→다음/마감) |

### Modified Files
| File | Changes |
|------|---------|
| `src/hooks/useGameReducer.js` | `soccerMatches`, `currentMatchIdx`, `opponents` 상태 + 축구 전용 액션 6개 |
| `src/config/settings.js` | `eventLogSheet`, `cleanSheetPoint`, `opponents` 기본값 |
| `src/App.jsx` | `matchMode: "soccer"` 셋업 UI, SoccerMatchView 렌더링, 축구 마감(3종 로그) |
| `src/services/appSync.js` | `writeEventLog`, `writeSoccerPlayerLog` 메서드 추가 |
| `apps-script/Code.js` | `writeEventLog`, `writeSoccerPlayerLog` 함수 + doPost 라우팅 |

---

### Task 1: Soccer Scoring Utility

**Files:**
- Create: `src/utils/soccerScoring.js`

- [ ] **Step 1: Create soccerScoring.js with core functions**

```js
// src/utils/soccerScoring.js

import { generateEventId } from './idGenerator';

/**
 * 경기 스코어 계산
 * @param {Array} events - 경기 이벤트 배열
 * @returns {{ ourScore: number, opponentScore: number }}
 */
export function calcSoccerScore(events) {
  let ourScore = 0, opponentScore = 0;
  for (const e of events) {
    if (e.type === "goal") ourScore++;
    else if (e.type === "owngoal") opponentScore++;
    else if (e.type === "opponentGoal") opponentScore++;
  }
  return { ourScore, opponentScore };
}

/**
 * 클린시트 대상 선수 목록 (무실점 경기 시 GK + 모든 DF)
 * 교체로 나간 DF/GK도 포함
 * @param {Object} match - soccerMatch 객체
 * @returns {string[]} 클린시트 대상 선수 이름 배열
 */
export function getCleanSheetPlayers(match) {
  const { ourScore, opponentScore } = calcSoccerScore(match.events);
  if (opponentScore > 0) return [];

  const csPlayers = new Set();
  // 초기 GK + DF
  if (match.gk) csPlayers.add(match.gk);
  match.defenders.forEach(d => csPlayers.add(d));

  // 교체로 GK/DF 포지션에 투입된 선수도 포함
  for (const e of match.events) {
    if (e.type === "sub" && (e.position === "GK" || e.position === "DF")) {
      csPlayers.add(e.playerIn);
    }
  }

  return [...csPlayers];
}

/**
 * 현재 피치 위 선수 목록 (교체 반영)
 * @param {Object} match - soccerMatch 객체
 * @returns {string[]}
 */
export function getCurrentLineup(match) {
  const lineup = new Set(match.lineup);
  for (const e of match.events) {
    if (e.type === "sub") {
      lineup.delete(e.playerOut);
      lineup.add(e.playerIn);
    }
  }
  return [...lineup];
}

/**
 * 현재 GK (교체 반영)
 */
export function getCurrentGk(match) {
  let gk = match.gk;
  for (const e of match.events) {
    if (e.type === "sub" && e.position === "GK") {
      gk = e.playerIn;
    }
  }
  return gk;
}

/**
 * 현재 DF 목록 (교체 반영)
 */
export function getCurrentDefenders(match) {
  const defs = new Set(match.defenders);
  for (const e of match.events) {
    if (e.type === "sub") {
      if (defs.has(e.playerOut)) {
        defs.delete(e.playerOut);
        if (e.position === "DF") defs.add(e.playerIn);
      }
      if (e.position === "DF" && !defs.has(e.playerOut)) {
        defs.add(e.playerIn);
      }
    }
  }
  return [...defs];
}

/**
 * 경기별 선수 통계 집계 (전체 soccerMatches 기준)
 * @param {Array} soccerMatches - 완료된 경기 배열
 * @returns {Object} { playerName: { games, fieldGames, keeperGames, goals, assists, owngoals, cleanSheets, conceded } }
 */
export function calcSoccerPlayerStats(soccerMatches) {
  const stats = {};
  const ensure = (name) => {
    if (!stats[name]) stats[name] = { games: 0, fieldGames: 0, keeperGames: 0, goals: 0, assists: 0, owngoals: 0, cleanSheets: 0, conceded: 0 };
  };

  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;

    // 모든 출전 선수 (초기 + 교체 투입)
    const allPlayed = new Set(match.lineup);
    for (const e of match.events) {
      if (e.type === "sub") allPlayed.add(e.playerIn);
    }

    const csPlayers = getCleanSheetPlayers(match);

    for (const name of allPlayed) {
      ensure(name);
      stats[name].games++;
      // GK로 한 번이라도 출전했으면 keeperGames
      const wasGk = name === match.gk || match.events.some(e => e.type === "sub" && e.playerIn === name && e.position === "GK");
      if (wasGk) stats[name].keeperGames++;
      else stats[name].fieldGames++;

      if (csPlayers.includes(name)) stats[name].cleanSheets++;
    }

    // 이벤트 집계
    for (const e of match.events) {
      if (e.type === "goal") {
        ensure(e.player);
        stats[e.player].goals++;
        if (e.assist) { ensure(e.assist); stats[e.assist].assists++; }
      }
      if (e.type === "owngoal") {
        ensure(e.player);
        stats[e.player].owngoals++;
      }
      if (e.type === "opponentGoal" && e.currentGk) {
        ensure(e.currentGk);
        stats[e.currentGk].conceded++;
      }
    }
  }

  return stats;
}

/**
 * 선수별 포인트 계산 (골+1, 어시+1, 자책-1, 클린시트+1)
 */
export function calcSoccerPlayerPoint(playerStat, settings) {
  const { goals, assists, owngoals, cleanSheets } = playerStat;
  const ownGoalPt = settings?.ownGoalPoint ?? -1;
  const csPt = settings?.cleanSheetPoint ?? 1;
  return goals + assists + (owngoals * ownGoalPt) + (cleanSheets * csPt);
}

/**
 * 이벤트로그 시트용 로우 데이터 빌드
 */
export function buildEventLogRows(soccerMatches, gameDate) {
  const rows = [];
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const matchNum = match.matchIdx + 1;
    const opponent = match.opponent;

    // 출전 이벤트
    for (const name of match.lineup) {
      let position = "";
      if (name === match.gk) position = "GK";
      else if (match.defenders.includes(name)) position = "DF";
      else position = "FW";
      rows.push({
        gameDate, matchNum, opponent,
        event: "출전", player: name, relatedPlayer: "", position,
        inputTime: new Date(match.startedAt).toLocaleString("ko-KR"),
      });
    }

    // 인게임 이벤트 (시간순)
    const sorted = [...match.events].sort((a, b) => a.timestamp - b.timestamp);
    for (const e of sorted) {
      if (e.type === "goal") {
        rows.push({
          gameDate, matchNum, opponent,
          event: "골", player: e.player, relatedPlayer: e.assist || "", position: "",
          inputTime: new Date(e.timestamp).toLocaleString("ko-KR"),
        });
      } else if (e.type === "owngoal") {
        rows.push({
          gameDate, matchNum, opponent,
          event: "자책골", player: e.player, relatedPlayer: "", position: "",
          inputTime: new Date(e.timestamp).toLocaleString("ko-KR"),
        });
      } else if (e.type === "opponentGoal") {
        rows.push({
          gameDate, matchNum, opponent,
          event: "실점", player: e.currentGk || "", relatedPlayer: "", position: "GK",
          inputTime: new Date(e.timestamp).toLocaleString("ko-KR"),
        });
      } else if (e.type === "sub") {
        rows.push({
          gameDate, matchNum, opponent,
          event: "교체", player: e.playerIn, relatedPlayer: e.playerOut, position: e.position || "",
          inputTime: new Date(e.timestamp).toLocaleString("ko-KR"),
        });
      }
    }
  }
  return rows;
}

/**
 * 포인트로그 시트용 로우 데이터 빌드 (현행 컬럼: 경기일자, 경기번호, 상대팀명, 득점, 어시, 실점, 자책골, 입력시간)
 */
export function buildPointLogRows(soccerMatches, gameDate, inputTime) {
  const rows = [];
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const matchNum = match.matchIdx + 1;

    for (const e of match.events) {
      if (e.type === "goal") {
        rows.push({
          gameDate, matchId: String(matchNum), opponent: match.opponent,
          scorer: e.player, assist: e.assist || "", conceded: "", ownGoalPlayer: "",
          inputTime,
        });
      } else if (e.type === "owngoal") {
        rows.push({
          gameDate, matchId: String(matchNum), opponent: match.opponent,
          scorer: "OG", assist: "", conceded: "", ownGoalPlayer: e.player,
          inputTime,
        });
      } else if (e.type === "opponentGoal") {
        rows.push({
          gameDate, matchId: String(matchNum), opponent: match.opponent,
          scorer: "", assist: "", conceded: "실점", ownGoalPlayer: "",
          inputTime,
        });
      }
    }
  }
  return rows;
}

/**
 * 선수별집계기록로그 시트용 로우 데이터 빌드
 * (현행 컬럼: 경기일자, 선수명, 전체경기, 필드경기, 키퍼경기, 골, 어시, 클린시트, 실점, 자책골, 입력시간)
 */
export function buildPlayerLogRows(soccerMatches, gameDate, inputTime) {
  const stats = calcSoccerPlayerStats(soccerMatches);
  return Object.entries(stats).map(([name, s]) => ({
    gameDate, name,
    games: s.games, fieldGames: s.fieldGames, keeperGames: s.keeperGames,
    goals: s.goals, assists: s.assists, cleanSheets: s.cleanSheets,
    conceded: s.conceded, owngoals: s.owngoals,
    inputTime,
  }));
}
```

- [ ] **Step 2: Verify file created correctly**

Run: `head -5 src/utils/soccerScoring.js`
Expected: imports and first function declaration visible

- [ ] **Step 3: Commit**

```bash
git add src/utils/soccerScoring.js
git commit -m "feat(soccer): add soccer scoring utility"
```

---

### Task 2: Game Reducer Extension

**Files:**
- Modify: `src/hooks/useGameReducer.js`

- [ ] **Step 1: Add soccer fields to initialState**

In `src/hooks/useGameReducer.js`, add after `pushState: null,`:

```js
  // 축구 전용
  soccerMatches: [],      // [{matchIdx, opponent, lineup, gk, defenders, events, startedAt, ourScore, opponentScore, status}]
  currentMatchIdx: -1,    // 현재 진행중인 경기 인덱스 (-1 = 없음)
  opponents: [],          // 등록된 상대팀 목록
```

- [ ] **Step 2: Add soccer fields to RESTORE_STATE**

In the `RESTORE_STATE` case, add after the `pushState` line:

```js
      if (s.soccerMatches != null) updates.soccerMatches = s.soccerMatches;
      if (s.currentMatchIdx != null) updates.currentMatchIdx = s.currentMatchIdx;
      if (s.opponents != null) updates.opponents = s.opponents;
```

- [ ] **Step 3: Add CREATE_SOCCER_MATCH action**

Add new case in the switch:

```js
    case 'CREATE_SOCCER_MATCH': {
      const { opponent, lineup, gk, defenders } = action;
      const newMatch = {
        matchIdx: state.soccerMatches.length,
        opponent, lineup, gk, defenders,
        events: [],
        startedAt: Date.now(),
        ourScore: 0, opponentScore: 0,
        status: "playing",
      };
      return {
        ...state,
        soccerMatches: [...state.soccerMatches, newMatch],
        currentMatchIdx: state.soccerMatches.length,
      };
    }
```

- [ ] **Step 4: Add ADD_SOCCER_EVENT action**

```js
    case 'ADD_SOCCER_EVENT': {
      const { matchIdx, event } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const events = [...m.events, { ...event, id: event.id || Date.now().toString(), timestamp: event.timestamp || Date.now() }];
        // 스코어 자동 계산
        let ourScore = 0, opponentScore = 0;
        for (const ev of events) {
          if (ev.type === "goal") ourScore++;
          else if (ev.type === "owngoal") opponentScore++;
          else if (ev.type === "opponentGoal") opponentScore++;
        }
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 5: Add DELETE_SOCCER_EVENT action**

```js
    case 'DELETE_SOCCER_EVENT': {
      const { matchIdx, eventId } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const events = m.events.filter(e => e.id !== eventId);
        let ourScore = 0, opponentScore = 0;
        for (const ev of events) {
          if (ev.type === "goal") ourScore++;
          else if (ev.type === "owngoal") opponentScore++;
          else if (ev.type === "opponentGoal") opponentScore++;
        }
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 6: Add FINISH_SOCCER_MATCH action**

```js
    case 'FINISH_SOCCER_MATCH': {
      const { matchIdx } = action;
      const matches = state.soccerMatches.map((m, i) =>
        i === matchIdx ? { ...m, status: "finished" } : m
      );
      return { ...state, soccerMatches: matches, currentMatchIdx: -1 };
    }
```

- [ ] **Step 7: Add SET_OPPONENTS action**

```js
    case 'SET_OPPONENTS': {
      return { ...state, opponents: action.opponents };
    }
```

- [ ] **Step 8: Add soccerMatches to START_MATCHES reset**

In the existing `START_MATCHES` case, add `soccerMatches: [],` and `currentMatchIdx: -1,` to the return object.

- [ ] **Step 9: Verify reducer compiles**

Run: `cd /Users/rh/Desktop/python_dev/footsal_webapp && npx vite build 2>&1 | tail -5`
Expected: Build succeeds without errors

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useGameReducer.js
git commit -m "feat(soccer): add soccer state and reducer actions"
```

---

### Task 3: Settings Extension

**Files:**
- Modify: `src/config/settings.js`

- [ ] **Step 1: Add soccer defaults to DEFAULTS**

In `src/config/settings.js`, add to the DEFAULTS object after `bonusMultiplier: 2,`:

```js
  // 축구 전용 (축구팀 설정에서 사용)
  eventLogSheet: "",           // 이벤트로그 시트명 (비어있으면 미사용)
  cleanSheetPoint: 1,          // 클린시트 포인트
  opponents: [],               // 등록된 상대팀 목록
```

- [ ] **Step 2: Commit**

```bash
git add src/config/settings.js
git commit -m "feat(soccer): add soccer settings defaults"
```

---

### Task 4: OpponentSelector Component

**Files:**
- Create: `src/components/game/OpponentSelector.jsx`

- [ ] **Step 1: Create OpponentSelector**

```jsx
// src/components/game/OpponentSelector.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function OpponentSelector({ opponents, onSelect, onAddOpponent, styles: s }) {
  const { C } = useTheme();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (opponents.includes(name)) { alert("이미 등록된 상대팀입니다."); return; }
    onAddOpponent(name);
    onSelect(name);
    setNewName("");
    setAdding(false);
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>상대팀 선택</div>
      {adding ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="새 상대팀 이름"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 14, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }} />
          <button onClick={handleAdd} style={{ padding: "8px 14px", borderRadius: 8, background: C.green, color: C.bg, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>추가</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} style={{ padding: "8px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 13, cursor: "pointer" }}>취소</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opponents.map(name => (
            <button key={name} onClick={() => onSelect(name)}
              style={{ padding: "8px 16px", borderRadius: 8, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {name}
            </button>
          ))}
          <button onClick={() => setAdding(true)}
            style={{ padding: "8px 16px", borderRadius: 8, background: `${C.accent}20`, color: C.accent, border: `1px dashed ${C.accent}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + 새 상대팀
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/OpponentSelector.jsx
git commit -m "feat(soccer): add OpponentSelector component"
```

---

### Task 5: LineupSelector Component

**Files:**
- Create: `src/components/game/LineupSelector.jsx`

- [ ] **Step 1: Create LineupSelector**

```jsx
// src/components/game/LineupSelector.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

/**
 * 출전 11명 선택 + GK/DF 포지션 토글
 * 포지션 토글 순서: 일반(FW) → GK → DF → 일반
 * GK는 1명만 허용
 */
export default function LineupSelector({ attendees, onConfirm, styles: s }) {
  const { C } = useTheme();
  const [selected, setSelected] = useState(new Set());
  const [positions, setPositions] = useState({}); // { name: "GK" | "DF" | undefined }

  const togglePlayer = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        setPositions(p => { const np = { ...p }; delete np[name]; return np; });
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const cyclePosition = (name, e) => {
    e.stopPropagation();
    if (!selected.has(name)) return;
    setPositions(prev => {
      const current = prev[name];
      if (!current) {
        // 일반 → GK (기존 GK 있으면 해제)
        const np = { ...prev };
        Object.keys(np).forEach(k => { if (np[k] === "GK") delete np[k]; });
        np[name] = "GK";
        return np;
      }
      if (current === "GK") return { ...prev, [name]: "DF" };
      // DF → 일반
      const np = { ...prev };
      delete np[name];
      return np;
    });
  };

  const lineup = [...selected];
  const gk = lineup.find(n => positions[n] === "GK") || null;
  const defenders = lineup.filter(n => positions[n] === "DF");
  const canConfirm = lineup.length === 11 && gk;

  const handleConfirm = () => {
    if (!canConfirm) {
      if (lineup.length !== 11) alert("11명을 선택해주세요.");
      else if (!gk) alert("GK를 지정해주세요.");
      return;
    }
    onConfirm({ lineup, gk, defenders });
  };

  const posColor = (name) => {
    const pos = positions[name];
    if (pos === "GK") return { bg: `${C.yellow}33`, color: C.yellow, label: "GK" };
    if (pos === "DF") return { bg: `${C.orange}33`, color: C.orange, label: "DF" };
    return null;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: C.gray }}>출전 선수 선택</div>
        <div style={{ fontSize: 12, color: lineup.length === 11 ? C.green : C.accent, fontWeight: 700 }}>{lineup.length}/11명</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
        {attendees.map(name => {
          const isSelected = selected.has(name);
          const pc = posColor(name);
          return (
            <div key={name} onClick={() => togglePlayer(name)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: isSelected ? (pc ? pc.bg : `${C.accent}22`) : C.cardLight,
                color: isSelected ? (pc ? pc.color : C.accent) : C.grayLight,
                border: isSelected ? `1px solid ${pc ? pc.color : C.accent}` : `1px solid ${C.grayDark}`,
              }}>
              {pc && <span style={{ fontSize: 10, fontWeight: 800 }}>{pc.label}</span>}
              <span>{name}</span>
              {isSelected && (
                <span onClick={(e) => cyclePosition(name, e)}
                  style={{ fontSize: 9, padding: "1px 4px", borderRadius: 4, background: C.grayDarker, color: C.grayLight, cursor: "pointer" }}>
                  포지션
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: C.gray, marginBottom: 8 }}>
        선수 탭 = 선택/해제 · [포지션] 탭 = 일반→GK→DF→일반 순환 · GK는 1명만
      </div>

      {lineup.length > 0 && (
        <div style={{ background: C.cardLight, borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>선택된 선수</div>
          <div style={{ fontSize: 12, color: C.white }}>
            {gk && <span style={{ color: C.yellow, fontWeight: 700 }}>🧤{gk} </span>}
            {defenders.length > 0 && <span style={{ color: C.orange, fontWeight: 700 }}>🛡{defenders.join(", ")} </span>}
            {lineup.filter(n => !positions[n]).map(n => n).join(", ")}
          </div>
        </div>
      )}

      <button onClick={handleConfirm}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14,
          fontWeight: 700, cursor: "pointer",
          background: canConfirm ? C.green : C.grayDark,
          color: canConfirm ? C.bg : C.gray,
          opacity: canConfirm ? 1 : 0.5,
        }}>
        경기 시작 ({lineup.length}/11)
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/LineupSelector.jsx
git commit -m "feat(soccer): add LineupSelector component"
```

---

### Task 6: SubstitutionModal Component

**Files:**
- Create: `src/components/game/SubstitutionModal.jsx`

- [ ] **Step 1: Create SubstitutionModal**

```jsx
// src/components/game/SubstitutionModal.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

/**
 * 교체 모달: 나가는 선수(피치) → 들어오는 선수(벤치) 선택
 * 포지션 자동 승계 (OUT 선수의 포지션을 IN 선수에게)
 */
export default function SubstitutionModal({ currentLineup, bench, currentGk, currentDefenders, onConfirm, onClose }) {
  const { C } = useTheme();
  const [playerOut, setPlayerOut] = useState(null);
  const [playerIn, setPlayerIn] = useState(null);

  const getPosition = (name) => {
    if (name === currentGk) return "GK";
    if (currentDefenders.includes(name)) return "DF";
    return "FW";
  };

  const handleConfirm = () => {
    if (!playerOut || !playerIn) return;
    const position = getPosition(playerOut);
    onConfirm({ playerOut, playerIn, position });
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: C.card, borderRadius: 16, padding: 20, maxWidth: 400, width: "100%", maxHeight: "80vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 16 }}>🔄 선수 교체</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>나가는 선수 (피치)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {currentLineup.map(name => {
              const pos = getPosition(name);
              const isSelected = playerOut === name;
              return (
                <button key={name} onClick={() => setPlayerOut(name)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: isSelected ? `${C.red}30` : C.grayDarker, color: isSelected ? C.red : C.white,
                  }}>
                  {pos !== "FW" && <span style={{ fontSize: 10, marginRight: 3, color: pos === "GK" ? C.yellow : C.orange }}>{pos}</span>}
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>들어오는 선수 (벤치)</div>
          {bench.length === 0 ? (
            <div style={{ fontSize: 12, color: C.grayDark }}>벤치에 선수가 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {bench.map(name => {
                const isSelected = playerIn === name;
                return (
                  <button key={name} onClick={() => setPlayerIn(name)}
                    style={{
                      padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: isSelected ? `${C.green}30` : C.grayDarker, color: isSelected ? C.green : C.white,
                    }}>
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {playerOut && playerIn && (
          <div style={{ background: C.cardLight, borderRadius: 8, padding: 10, marginBottom: 12, textAlign: "center", fontSize: 13 }}>
            <span style={{ color: C.red, fontWeight: 700 }}>{playerOut}</span>
            <span style={{ color: C.gray }}> → </span>
            <span style={{ color: C.green, fontWeight: 700 }}>{playerIn}</span>
            <span style={{ color: C.gray, fontSize: 11 }}> ({getPosition(playerOut)} 포지션 승계)</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>
            취소
          </button>
          <button onClick={handleConfirm}
            disabled={!playerOut || !playerIn}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: playerOut && playerIn ? C.accent : C.grayDark, color: playerOut && playerIn ? C.bg : C.gray,
            }}>
            교체 확정
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/SubstitutionModal.jsx
git commit -m "feat(soccer): add SubstitutionModal component"
```

---

### Task 7: SoccerRecorder Component

**Files:**
- Create: `src/components/game/SoccerRecorder.jsx`

- [ ] **Step 1: Create SoccerRecorder**

```jsx
// src/components/game/SoccerRecorder.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getCurrentLineup, getCurrentGk, getCurrentDefenders, calcSoccerScore } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import SubstitutionModal from './SubstitutionModal';

export default function SoccerRecorder({ match, attendees, onAddEvent, onDeleteEvent, onFinishMatch, styles: s }) {
  const { C } = useTheme();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [goalStep, setGoalStep] = useState(null); // { player } → assist 선택
  const [isOwnGoal, setIsOwnGoal] = useState(false);

  const currentLineup = getCurrentLineup(match);
  const currentGk = getCurrentGk(match);
  const currentDefs = getCurrentDefenders(match);
  const bench = attendees.filter(p => !currentLineup.includes(p));
  const { ourScore, opponentScore } = calcSoccerScore(match.events);

  // 우리골 입력
  const handleGoalTap = () => { setShowGoalModal(true); setGoalStep(null); setIsOwnGoal(false); };

  const selectScorer = (player) => {
    setGoalStep({ player });
  };

  const confirmGoal = (assist) => {
    if (isOwnGoal) {
      onAddEvent({
        type: "owngoal", player: goalStep.player,
        id: generateEventId(), timestamp: Date.now(),
      });
    } else {
      onAddEvent({
        type: "goal", player: goalStep.player, assist: assist || null,
        id: generateEventId(), timestamp: Date.now(),
      });
    }
    setShowGoalModal(false);
    setGoalStep(null);
  };

  // 상대골 입력
  const handleOpponentGoal = () => {
    if (!confirm("상대팀 골을 기록하시겠습니까?")) return;
    onAddEvent({
      type: "opponentGoal", currentGk,
      id: generateEventId(), timestamp: Date.now(),
    });
  };

  // 교체
  const handleSubConfirm = ({ playerOut, playerIn, position }) => {
    onAddEvent({
      type: "sub", playerOut, playerIn, position,
      id: generateEventId(), timestamp: Date.now(),
    });
    setShowSubModal(false);
  };

  // 이벤트 삭제
  const handleDelete = (eventId) => {
    if (!confirm("이 이벤트를 삭제하시겠습니까?")) return;
    onDeleteEvent(eventId);
  };

  // 경기 종료
  const handleFinish = () => {
    if (!confirm(`${ourScore} : ${opponentScore} (vs ${match.opponent})\n경기를 종료하시겠습니까?`)) return;
    onFinishMatch();
  };

  const formatTime = (ts) => {
    if (!match.startedAt) return "";
    const diff = Math.floor((ts - match.startedAt) / 60000);
    return `${diff}'`;
  };

  const sortedEvents = [...match.events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div>
      {/* 스코어보드 */}
      <div style={{
        display: "flex", justifyContent: "space-around", alignItems: "center",
        background: C.cardLight, borderRadius: 12, padding: "14px 8px", marginBottom: 12,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>우리팀</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: C.gray }}>vs</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginTop: 2 }}>{match.opponent}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>상대팀</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={handleGoalTap}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.green}25`, color: C.green }}>
          ⚽ 우리골
        </button>
        <button onClick={handleOpponentGoal}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.red}25`, color: C.red }}>
          ⚽ 상대골
        </button>
        <button onClick={() => setShowSubModal(true)}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.accent}25`, color: C.accent }}>
          🔄 교체
        </button>
      </div>

      {/* 이벤트 로그 */}
      {sortedEvents.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>경기 기록 ({sortedEvents.length}건)</div>
          {sortedEvents.map(e => (
            <div key={e.id} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
              background: C.cardLight, borderRadius: 8, marginBottom: 4, fontSize: 12,
            }}>
              <span style={{ color: C.grayDark, fontSize: 11, minWidth: 28 }}>{formatTime(e.timestamp)}</span>
              {e.type === "goal" && <>
                <span>⚽</span>
                <span style={{ fontWeight: 600 }}>{e.player}</span>
                {e.assist && <span style={{ color: C.gray, fontSize: 11 }}> ← {e.assist}(어시)</span>}
                {!e.assist && <span style={{ color: C.grayDark, fontSize: 11 }}> (단독골)</span>}
              </>}
              {e.type === "owngoal" && <>
                <span>🔴</span>
                <span style={{ fontWeight: 600, color: C.red }}>{e.player}</span>
                <span style={{ color: C.gray, fontSize: 11 }}> (자책골)</span>
              </>}
              {e.type === "opponentGoal" && <>
                <span>⚽</span>
                <span style={{ color: C.red, fontWeight: 600 }}>상대골</span>
                {e.currentGk && <span style={{ color: C.gray, fontSize: 11 }}> (GK: {e.currentGk})</span>}
              </>}
              {e.type === "sub" && <>
                <span>🔄</span>
                <span style={{ color: C.red }}>{e.playerOut}</span>
                <span style={{ color: C.gray }}>→</span>
                <span style={{ color: C.green }}>{e.playerIn}</span>
                <span style={{ color: C.grayDark, fontSize: 10 }}>({e.position})</span>
              </>}
              <button onClick={() => handleDelete(e.id)}
                style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 10, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 경기 종료 버튼 */}
      <button onClick={handleFinish}
        style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>
        경기 종료
      </button>

      {/* 우리골 모달 */}
      {showGoalModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => { setShowGoalModal(false); setGoalStep(null); }}>
          <div style={{
            background: C.card, borderRadius: 16, padding: 20, maxWidth: 360, width: "100%", maxHeight: "80vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>
            {!goalStep ? (
              <>
                <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 4 }}>⚽ 골 기록</div>
                <div style={{ textAlign: "center", fontSize: 12, color: C.gray, marginBottom: 14 }}>득점자를 선택하세요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentLineup.map(p => (
                    <button key={p} onClick={() => selectScorer(p)}
                      style={{ border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white, textAlign: "center" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShowGoalModal(false); setGoalStep(null); }}
                  style={{ width: "100%", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.grayLight, marginTop: 10 }}>
                  취소
                </button>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 4 }}>
                  ⚽ {goalStep.player} 골!
                </div>
                <div style={{ textAlign: "center", fontSize: 12, color: C.gray, marginBottom: 14 }}>어시스트 선수를 선택하세요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentLineup.filter(p => p !== goalStep.player).map(p => (
                    <button key={p} onClick={() => confirmGoal(p)}
                      style={{ border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white, textAlign: "center" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => confirmGoal(null)}
                    style={{ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: C.grayDark, color: C.gray }}>
                    어시없음
                  </button>
                  <button onClick={() => { setIsOwnGoal(true); confirmGoal(null); }}
                    style={{ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.red}30`, color: C.red }}>
                    자책골
                  </button>
                </div>
                <button onClick={() => setGoalStep(null)}
                  style={{ width: "100%", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.grayLight, marginTop: 8 }}>
                  뒤로
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 교체 모달 */}
      {showSubModal && (
        <SubstitutionModal
          currentLineup={currentLineup} bench={bench}
          currentGk={currentGk} currentDefenders={currentDefs}
          onConfirm={handleSubConfirm} onClose={() => setShowSubModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/SoccerRecorder.jsx
git commit -m "feat(soccer): add SoccerRecorder component"
```

---

### Task 8: SoccerMatchView Component

**Files:**
- Create: `src/components/game/SoccerMatchView.jsx`

- [ ] **Step 1: Create SoccerMatchView**

```jsx
// src/components/game/SoccerMatchView.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers, calcSoccerPlayerStats, calcSoccerPlayerPoint } from '../../utils/soccerScoring';
import OpponentSelector from './OpponentSelector';
import LineupSelector from './LineupSelector';
import SoccerRecorder from './SoccerRecorder';

/**
 * 축구 경기 메인 뷰
 * 상태: "selectOpponent" → "selectLineup" → "playing" → "matchFinished" → (다음경기 or summary)
 */
export default function SoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onAddOpponent, onGoToSummary, gameSettings, styles: s,
}) {
  const { C } = useTheme();
  const [viewState, setViewState] = useState("selectOpponent");
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [viewingMatchIdx, setViewingMatchIdx] = useState(null);

  const currentMatch = currentMatchIdx >= 0 ? soccerMatches[currentMatchIdx] : null;
  const finishedMatches = soccerMatches.filter(m => m.status === "finished");
  const viewingMatch = viewingMatchIdx !== null ? soccerMatches[viewingMatchIdx] : null;

  // 경기 생성
  const handleOpponentSelect = (name) => {
    setSelectedOpponent(name);
    setViewState("selectLineup");
  };

  const handleLineupConfirm = ({ lineup, gk, defenders }) => {
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders });
    setViewState("playing");
    setViewingMatchIdx(null);
  };

  // 이벤트 기록
  const handleAddEvent = (event) => {
    onAddEvent(currentMatchIdx, event);
  };

  const handleDeleteEvent = (eventId) => {
    onDeleteEvent(currentMatchIdx, eventId);
  };

  // 경기 종료
  const handleFinishMatch = () => {
    onFinishMatch(currentMatchIdx);
    setViewState("matchFinished");
  };

  // 다음 경기
  const handleNextMatch = () => {
    setSelectedOpponent(null);
    setViewState("selectOpponent");
  };

  // 과거 경기 보기
  if (viewingMatch) {
    const { ourScore, opponentScore } = calcSoccerScore(viewingMatch.events);
    const csPlayers = getCleanSheetPlayers(viewingMatch);
    return (
      <div>
        <button onClick={() => setViewingMatchIdx(null)}
          style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>
          ← 돌아가기
        </button>
        <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray }}>제{viewingMatch.matchIdx + 1}경기</div>
          <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0" }}>
            <span style={{ color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</span>
            <span style={{ color: C.gray }}> : </span>
            <span style={{ color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {viewingMatch.opponent}</div>
          {csPlayers.length > 0 && (
            <div style={{ fontSize: 11, color: C.yellow, marginTop: 6 }}>🛡 클린시트: {csPlayers.join(", ")}</div>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>이벤트 로그</div>
        {viewingMatch.events.sort((a, b) => a.timestamp - b.timestamp).map(e => (
          <div key={e.id} style={{ padding: "5px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11, color: C.white }}>
            {e.type === "goal" && `⚽ ${e.player}${e.assist ? ` ← ${e.assist}` : ""}`}
            {e.type === "owngoal" && `🔴 ${e.player} (자책골)`}
            {e.type === "opponentGoal" && `⚽ 상대골 (GK: ${e.currentGk || ""})`}
            {e.type === "sub" && `🔄 ${e.playerOut} → ${e.playerIn} (${e.position})`}
          </div>
        ))}
      </div>
    );
  }

  // 경기 종료 후 요약
  if (viewState === "matchFinished" && finishedMatches.length > 0) {
    const lastMatch = finishedMatches[finishedMatches.length - 1];
    const { ourScore, opponentScore } = calcSoccerScore(lastMatch.events);
    const result = ourScore > opponentScore ? "승" : ourScore < opponentScore ? "패" : "무";
    const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
    const csPlayers = getCleanSheetPlayers(lastMatch);

    return (
      <div>
        {/* 완료된 경기 목록 */}
        {finishedMatches.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>오늘 경기</div>
            {finishedMatches.slice(0, -1).map((m, i) => {
              const sc = calcSoccerScore(m.events);
              return (
                <div key={i} onClick={() => setViewingMatchIdx(m.matchIdx)}
                  style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 12, cursor: "pointer", color: C.white }}>
                  <span>제{m.matchIdx + 1}경기 vs {m.opponent}</span>
                  <span style={{ fontWeight: 700 }}>{sc.ourScore}:{sc.opponentScore}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 방금 끝난 경기 결과 */}
        <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray }}>제{lastMatch.matchIdx + 1}경기 종료</div>
          <div style={{ fontSize: 28, fontWeight: 900, margin: "8px 0" }}>
            {ourScore} : {opponentScore}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: resultColor }}>vs {lastMatch.opponent} — {result}리</div>
          {csPlayers.length > 0 && (
            <div style={{ fontSize: 12, color: C.yellow, marginTop: 8 }}>🛡 클린시트: {csPlayers.join(", ")}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleNextMatch}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>
            다음 경기
          </button>
          <button onClick={onGoToSummary}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.green, color: C.bg }}>
            전체 마감
          </button>
        </div>
      </div>
    );
  }

  // 경기 진행 중
  if (viewState === "playing" && currentMatch) {
    return (
      <SoccerRecorder
        match={currentMatch} attendees={attendees}
        onAddEvent={handleAddEvent} onDeleteEvent={handleDeleteEvent}
        onFinishMatch={handleFinishMatch} styles={s}
      />
    );
  }

  // 라인업 선택
  if (viewState === "selectLineup" && selectedOpponent) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setViewState("selectOpponent")}
            style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>
            ←
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {selectedOpponent} — 라인업</div>
        </div>
        <LineupSelector attendees={attendees} onConfirm={handleLineupConfirm} styles={s} />
      </div>
    );
  }

  // 상대팀 선택 (기본)
  return (
    <div>
      {finishedMatches.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>오늘 경기 ({finishedMatches.length}경기)</div>
          {finishedMatches.map((m, i) => {
            const sc = calcSoccerScore(m.events);
            return (
              <div key={i} onClick={() => setViewingMatchIdx(m.matchIdx)}
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: C.cardLight, borderRadius: 8, marginBottom: 4, fontSize: 13, cursor: "pointer", color: C.white }}>
                <span>제{m.matchIdx + 1}경기 vs {m.opponent}</span>
                <span style={{ fontWeight: 700 }}>{sc.ourScore}:{sc.opponentScore}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ ...s.card }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>
          {finishedMatches.length > 0 ? `제${finishedMatches.length + 1}경기` : "경기 생성"}
        </div>
        <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent} styles={s} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/rh/Desktop/python_dev/footsal_webapp && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/game/SoccerMatchView.jsx
git commit -m "feat(soccer): add SoccerMatchView component"
```

---

### Task 9: App.jsx Integration

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add SoccerMatchView import**

At the top of `src/App.jsx`, add after the PushMatchView import:

```js
import SoccerMatchView from './components/game/SoccerMatchView';
import { calcSoccerPlayerStats, calcSoccerPlayerPoint, buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from './utils/soccerScoring';
```

- [ ] **Step 2: Add "soccer" to setup mode buttons**

In the setup phase section (around line 598-603), find the match mode buttons and add a soccer button:

```jsx
<button onClick={() => { set('matchMode', 'soccer'); set('courtCount', 1); }} style={s.btn(matchMode === "soccer" ? C.accent : C.grayDark, matchMode === "soccer" ? C.bg : C.white)}>축구</button>
```

- [ ] **Step 3: Hide team/court/draft settings when soccer mode**

Wrap the team count, court count, draft mode, and rotation sections with `{matchMode !== "soccer" && (...)}` guards. Soccer doesn't need any of these.

- [ ] **Step 4: Skip teamBuild for soccer — go straight to match phase**

In `goToTeamBuild` function (around line 365), add at the beginning:

```js
    if (matchMode === "soccer") {
      // 축구: 팀빌드 건너뛰고 바로 경기 진행
      dispatch({ type: 'START_MATCHES', schedule: null, pushState: null });
      return;
    }
```

- [ ] **Step 5: Add soccerMatches to gameState memo and autoSave deps**

In the `gameState` useMemo (around line 194), add `soccerMatches: state.soccerMatches,` and `currentMatchIdx: state.currentMatchIdx,` and `opponents: state.opponents,` to the object.

Add `state.soccerMatches` to the useMemo dependency array.

In the autoSave useEffect deps (around line 228), add `state.soccerMatches`:

```js
  }, [allEvents, completedMatches, currentRoundIdx, phase, gks, pushState, state.soccerMatches]);
```

- [ ] **Step 6: Add soccer dispatch handlers**

After the existing `unconfirmLastPushRound` function (around line 357), add:

```js
  // Soccer handlers
  const createSoccerMatch = ({ opponent, lineup, gk, defenders }) => {
    dispatch({ type: 'CREATE_SOCCER_MATCH', opponent, lineup, gk, defenders });
  };

  const addSoccerEvent = (matchIdx, event) => {
    dispatch({ type: 'ADD_SOCCER_EVENT', matchIdx, event });
  };

  const deleteSoccerEvent = (matchIdx, eventId) => {
    dispatch({ type: 'DELETE_SOCCER_EVENT', matchIdx, eventId });
  };

  const finishSoccerMatch = (matchIdx) => {
    dispatch({ type: 'FINISH_SOCCER_MATCH', matchIdx });
  };

  const addOpponent = (name) => {
    const newOpponents = [...(state.opponents || []), name];
    dispatch({ type: 'SET_OPPONENTS', opponents: newOpponents });
    // 설정에도 저장
    import('./config/settings').then(({ saveSettings }) => {
      saveSettings(teamContext?.team, { opponents: newOpponents });
    });
  };
```

- [ ] **Step 7: Render SoccerMatchView in match phase**

In the match phase rendering (around line 884), add soccer condition before the existing push/schedule/free conditions:

```jsx
          {matchMode === "soccer" ? (
            <SoccerMatchView
              soccerMatches={state.soccerMatches} currentMatchIdx={state.currentMatchIdx}
              attendees={attendees} opponents={state.opponents || gameSettings.opponents || []}
              onCreateMatch={createSoccerMatch} onAddEvent={addSoccerEvent}
              onDeleteEvent={deleteSoccerEvent} onFinishMatch={finishSoccerMatch}
              onAddOpponent={addOpponent} onGoToSummary={() => set('phase', 'summary')}
              gameSettings={gameSettings} styles={s}
            />
          ) : matchMode === "push" ? (
```

- [ ] **Step 8: Add soccer "경기마감" button condition**

In the match phase header buttons (around line 799), update the condition to include soccer:

```jsx
{(allRoundsComplete || matchMode === "free" || matchMode === "soccer" || (matchMode === "push" && completedMatches.length > 0)) && (
```

- [ ] **Step 9: Add soccer summary phase**

In the summary phase (around line 927), add soccer-specific summary before the existing content. Wrap the existing summary in `{matchMode !== "soccer" ? (...existing...) : (...soccer summary...)}`:

The soccer summary shows:
- 오늘 전체 경기 요약 테이블 (경기번호, 상대팀, 결과, 클린시트)
- 선수별 기록 (골, 어시, 자책, 클린시트, 포인트)

```jsx
      {matchMode === "soccer" ? (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>📊 경기 결과</div>
            <div style={s.card}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["#", "상대팀", "결과", "CS"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {state.soccerMatches.filter(m => m.status === "finished").map(m => {
                    const sc = require('./utils/soccerScoring').calcSoccerScore(m.events);
                    const cs = require('./utils/soccerScoring').getCleanSheetPlayers(m);
                    const result = sc.ourScore > sc.opponentScore ? "승" : sc.ourScore < sc.opponentScore ? "패" : "무";
                    return (
                      <tr key={m.matchIdx}>
                        <td style={s.td()}>{m.matchIdx + 1}</td>
                        <td style={s.td(true)}>{m.opponent}</td>
                        <td style={{ ...s.td(true), color: result === "승" ? C.green : result === "패" ? C.red : C.gray }}>{sc.ourScore}:{sc.opponentScore} {result}</td>
                        <td style={s.td()}>{cs.length > 0 ? "🛡" : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={s.section}>
            <div style={s.sectionTitle}>👤 선수별 기록</div>
            <div style={s.card}>
              {(() => {
                const stats = calcSoccerPlayerStats(state.soccerMatches.filter(m => m.status === "finished"));
                const rows = Object.entries(stats).map(([name, st]) => ({
                  name, ...st, point: calcSoccerPlayerPoint(st, gameSettings),
                })).sort((a, b) => b.point - a.point);
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.map(p => (
                        <tr key={p.name}>
                          <td style={s.td(true)}>{p.name}</td>
                          <td style={s.td()}>{p.games}</td>
                          <td style={s.td(p.goals > 0)}>{p.goals}</td>
                          <td style={s.td(p.assists > 0)}>{p.assists}</td>
                          <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                          <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                          <td style={s.td()}>{p.conceded}</td>
                          <td style={{ ...s.td(true), fontSize: 14, fontWeight: 800 }}>{p.point}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </>
      ) : (
        /* 기존 풋살 summary 코드 */
      )}
```

Note: Don't use `require()` — use the already-imported `calcSoccerScore` and `getCleanSheetPlayers` from the imports added in Step 1. The above is pseudo-code; replace `require(...)` calls with the imported functions.

- [ ] **Step 10: Add soccer handleFinalize**

In `handleFinalize` (around line 493), add a soccer branch at the top:

```js
  const handleFinalize = async () => {
    const gameTs = gameId?.startsWith("g_") ? parseInt(gameId.slice(2)) : null;
    const gameD = gameTs ? new Date(gameTs) : new Date();
    const dateStr = `${gameD.getFullYear()}-${String(gameD.getMonth() + 1).padStart(2, "0")}-${String(gameD.getDate()).padStart(2, "0")}`;
    const inputTime = new Date().toLocaleString("ko-KR");

    if (matchMode === "soccer") {
      const finished = state.soccerMatches.filter(m => m.status === "finished");
      if (finished.length === 0) { alert("종료된 경기가 없습니다."); return; }
      if (!confirm(`${gameD.getMonth() + 1}월 ${gameD.getDate()}일 축구기록을 확정하시겠습니까?\n\n${finished.length}경기 · 3종 로그를 저장합니다.`)) return;

      const eventLogRows = buildEventLogRows(finished, dateStr);
      const pointLogRows = buildPointLogRows(finished, dateStr, inputTime);
      const playerLogRows = buildPlayerLogRows(finished, dateStr, inputTime);

      try {
        const results = await Promise.all([
          AppSync.writeEventLog({ events: eventLogRows }, gameSettings.eventLogSheet),
          AppSync.writeSoccerPointLog({ events: pointLogRows }, gameSettings.pointLogSheet),
          AppSync.writeSoccerPlayerLog({ players: playerLogRows }, gameSettings.playerLogSheet),
        ]);
        await AppSync.finalizeState(gameId);
        await FirebaseSync.clearState(teamContext?.team, gameId);
        alert(`기록 확정 완료!\n\n이벤트로그: ${results[0]?.count || 0}건\n포인트로그: ${results[1]?.count || 0}건\n선수별집계: ${results[2]?.count || 0}명`);
      } catch (err) {
        alert("시트 저장 실패: " + err.message);
      }
      return;
    }

    // ... 기존 풋살 finalize 코드 ...
```

- [ ] **Step 11: Verify build**

Run: `cd /Users/rh/Desktop/python_dev/footsal_webapp && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 12: Commit**

```bash
git add src/App.jsx
git commit -m "feat(soccer): integrate soccer mode into App.jsx"
```

---

### Task 10: Apps Script + AppSync

**Files:**
- Modify: `apps-script/Code.js`
- Modify: `src/services/appSync.js`

- [ ] **Step 1: Add writeEventLog to Code.js**

In `apps-script/Code.js`, add after the `_writePlayerLog` function (around line 598):

```js
// ═══════════════════════════════════════════════════════════════
// 축구 이벤트로그 쓰기
// 컬럼: 경기일자, 경기번호, 상대팀명, 이벤트, 선수, 관련선수, 포지션, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeEventLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_이벤트로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:H1").setValues([["경기일자","경기번호","상대팀명","이벤트","선수","관련선수","포지션","입력시간"]]);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchNum || "", e.opponent || "",
        e.event || "", e.player || "", e.relatedPlayer || "",
        e.position || "", e.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 8).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 2: Add writeSoccerPointLog to Code.js**

```js
// ═══════════════════════════════════════════════════════════════
// 축구 포인트로그 쓰기
// 컬럼: 경기일자, 경기번호, 상대팀명, 득점, 어시, 실점, 자책골, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeSoccerPointLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_포인트로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:H1").setValues([["경기일자","경기번호","상대팀명","득점","어시","실점","자책골","입력시간"]]);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchId || "", e.opponent || "",
        e.scorer || "", e.assist || "", e.conceded || "",
        e.ownGoalPlayer || "", e.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 8).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 3: Add writeSoccerPlayerLog to Code.js**

```js
// ═══════════════════════════════════════════════════════════════
// 축구 선수별집계기록 쓰기
// 컬럼: 경기일자, 선수명, 전체경기, 필드경기, 키퍼경기, 골, 어시, 클린시트, 실점, 자책골, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeSoccerPlayerLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, message: "선수 데이터 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_선수별집계기록로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:K1").setValues([["경기일자","선수명","전체경기","필드경기","키퍼경기","골","어시","클린시트","실점","자책골","입력시간"]]);
      sheet.getRange("A1:K1").setFontWeight("bold");
    }

    var values = rows.map(function(p) {
      return [
        p.gameDate, p.name,
        Number(p.games) || 0, Number(p.fieldGames) || 0, Number(p.keeperGames) || 0,
        Number(p.goals) || 0, Number(p.assists) || 0, Number(p.cleanSheets) || 0,
        Number(p.conceded) || 0, Number(p.owngoals) || 0,
        p.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 11).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 4: Add routing in doPost**

In the `doPost` function's action router (around line 172-176), add before the final `return _errorResponse`:

```js
    } else if (action === "writeEventLog") {
      return _jsonResponse(_writeEventLog(body.data, body.eventLogSheet || ""));
    } else if (action === "writeSoccerPointLog") {
      return _jsonResponse(_writeSoccerPointLog(body.data, body.pointLogSheet || ""));
    } else if (action === "writeSoccerPlayerLog") {
      return _jsonResponse(_writeSoccerPlayerLog(body.data, body.playerLogSheet || ""));
    }
```

- [ ] **Step 5: Add methods to appSync.js**

In `src/services/appSync.js`, add before the `verifyAuth` method:

```js
  async writeEventLog(data, eventLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeEventLog", data: { ...data, team }, eventLogSheet: eventLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("이벤트로그 저장 실패:", e.message); return null; }
  },

  async writeSoccerPointLog(data, pointLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeSoccerPointLog", data: { ...data, team }, pointLogSheet: pointLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("축구 포인트로그 저장 실패:", e.message); return null; }
  },

  async writeSoccerPlayerLog(data, playerLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeSoccerPlayerLog", data: { ...data, team }, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("축구 선수별집계 저장 실패:", e.message); return null; }
  },
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/rh/Desktop/python_dev/footsal_webapp && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add apps-script/Code.js src/services/appSync.js
git commit -m "feat(soccer): add Apps Script functions and AppSync methods for soccer logs"
```

---

### Task 11: Settings Screen - Opponents Management

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx`

- [ ] **Step 1: Read current SettingsScreen to understand structure**

Read `src/components/common/SettingsScreen.jsx` to find where to add the opponents management UI.

- [ ] **Step 2: Add opponents setting field**

Add a section for managing the opponents list in the settings screen. This should include:
- Display current opponents list
- Add new opponent input
- Remove opponent button (✕)

The section should be conditionally shown when the team mode is "축구", or always shown as a general setting. Add after the existing scoring rules section:

```jsx
{/* 상대팀 관리 */}
<div style={{ marginBottom: 16 }}>
  <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>등록된 상대팀</div>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
    {(localSettings.opponents || []).map(name => (
      <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: C.cardLight, fontSize: 12, color: C.white }}>
        <span>{name}</span>
        <span onClick={() => {
          const next = (localSettings.opponents || []).filter(n => n !== name);
          setLocalSettings(prev => ({ ...prev, opponents: next }));
        }} style={{ fontSize: 10, color: C.red, cursor: "pointer", fontWeight: 700 }}>✕</span>
      </div>
    ))}
    {(localSettings.opponents || []).length === 0 && <span style={{ fontSize: 12, color: C.grayDark }}>없음</span>}
  </div>
  <div style={{ display: "flex", gap: 6 }}>
    <input placeholder="새 상대팀 이름" value={newOpponent || ""} onChange={e => setNewOpponent(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") {
          const name = (newOpponent || "").trim();
          if (name && !(localSettings.opponents || []).includes(name)) {
            setLocalSettings(prev => ({ ...prev, opponents: [...(prev.opponents || []), name] }));
            setNewOpponent("");
          }
        }
      }}
      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}` }} />
    <button onClick={() => {
      const name = (newOpponent || "").trim();
      if (name && !(localSettings.opponents || []).includes(name)) {
        setLocalSettings(prev => ({ ...prev, opponents: [...(prev.opponents || []), name] }));
        setNewOpponent("");
      }
    }} style={{ padding: "8px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>추가</button>
  </div>
</div>
```

Add `const [newOpponent, setNewOpponent] = useState("");` to the component's state declarations.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/SettingsScreen.jsx
git commit -m "feat(soccer): add opponents management to settings"
```

---

### Task 12: Load Opponents from Settings on Mount

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Load opponents from settings into reducer on mount**

In `App.jsx`, in the `_loadAllData` or initial setup, add opponents loading. After the existing data loading resolves, add:

```js
// settings에서 opponents 로드
const opponents = gameSettings.opponents || [];
if (opponents.length > 0) {
  dispatch({ type: 'SET_OPPONENTS', opponents });
}
```

This should go in the `useEffect` on mount, after settings are loaded. The simplest place is right after `_loadAllData` or in its callback.

- [ ] **Step 2: Verify full flow works**

Run: `cd /Users/rh/Desktop/python_dev/footsal_webapp && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(soccer): load opponents from settings on mount"
```

---

## Self-Review Checklist

### Spec Coverage
| Spec Requirement | Task |
|-----------------|------|
| 11 vs 11 인원 | Task 5 (LineupSelector: 11명 선택) |
| GK/DF만 구분 | Task 5 (포지션 토글: 일반→GK→DF→일반) |
| 교체 시점 기록 | Task 6 (SubstitutionModal) + Task 2 (ADD_SOCCER_EVENT sub type) |
| 상대팀 이름 관리 | Task 4 (OpponentSelector) + Task 11 (Settings) |
| 골+1, 어시+1, 자책-1, 클린시트+1 | Task 1 (soccerScoring.js) |
| 보너스 없음 | Task 9 (soccer summary에서 크로바/고구마 미표시) |
| 이벤트 입력 시 자동 timestamp | Task 7 (SoccerRecorder: Date.now()) |
| 하루 1~N경기 | Task 8 (SoccerMatchView: 다음 경기 버튼) |
| 이벤트로그 로우데이터 | Task 1 (buildEventLogRows) + Task 10 (writeEventLog) |
| 포인트로그 현행 | Task 1 (buildPointLogRows) + Task 10 (writeSoccerPointLog) |
| 선수별집계기록로그 현행 | Task 1 (buildPlayerLogRows) + Task 10 (writeSoccerPlayerLog) |
| 실점 시 현재 GK 기록 | Task 7 (opponentGoal event에 currentGk 포함) |
| 셋업→경기생성→진행→종료→다음/마감 | Task 8 (SoccerMatchView viewState flow) |
| 설정에서 시트명 변경 가능 | Task 3 (settings defaults) + Task 10 (sheetName 파라미터) |
| Firebase 자동저장 | Task 9 (soccerMatches를 gameState에 추가) |

### Placeholder Scan
- No TBD, TODO, or "implement later" found
- All code blocks contain complete implementation
- All file paths are exact

### Type Consistency
- `soccerMatches` array shape: consistent across Task 1 (scoring), Task 2 (reducer), Task 8 (view), Task 9 (App)
- Event types: `goal`, `owngoal`, `opponentGoal`, `sub` — consistent across all tasks
- `calcSoccerScore` return shape `{ ourScore, opponentScore }` — used consistently in Task 1, 7, 8, 9
- `getCurrentLineup`, `getCurrentGk`, `getCurrentDefenders` — used in Task 7 (SoccerRecorder)
- `buildEventLogRows`, `buildPointLogRows`, `buildPlayerLogRows` — called in Task 9 (handleFinalize)

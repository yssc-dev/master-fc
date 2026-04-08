# 시각적 포메이션 경기 기록 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 텍스트 기반 라인업/이벤트 입력을 피치 그래픽 기반 포메이션 UI로 교체한다.

**Architecture:** 6종 포메이션 프리셋 데이터를 기반으로 SVG 피치 위에 선수를 원형으로 배치하고, 선수 탭 시 액션 메뉴(골/어시/자책)를 표시한다. 출전명단 선택 → 포메이션 배치 → 경기 진행 → 종료의 4단계 흐름이며, 각 단계가 Firebase에 자동 저장되어 재접속 시 복원된다.

**Tech Stack:** React 19, SVG, Firebase Realtime DB, Google Apps Script

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/utils/formations.js` | 포메이션 6종 프리셋 데이터 (좌표 + 포지션 태그) |
| `src/components/game/RosterSelector.jsx` | Step 1: 전체 명단에서 출전 선수 체크 (11~18명) |
| `src/components/game/FormationPitch.jsx` | SVG 피치 그래픽 + 선수 원형 배치 (재사용 가능) |
| `src/components/game/PlayerActionMenu.jsx` | 선수 탭 시 액션 팝업 (⚽골/🅰️어시/🔴자책) |
| `src/components/game/FormationSetup.jsx` | Step 2: 포메이션 선택 + 포지션에 선수 배치 |
| `src/components/game/FormationRecorder.jsx` | Step 3-4: 경기 진행 + 종료 (피치 + 이벤트 + 하단 버튼) |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/game/SubstitutionModal.jsx` | MF 포지션 지원 추가 (positions 배열 기반) |
| `src/components/tournament/TournamentMatchManager.jsx` | FormationRecorder 사용 + Firebase 자동 저장/복원 |

---

### Task 1: Formation Presets Data

**Files:**
- Create: `src/utils/formations.js`

- [ ] **Step 1: Create formations.js with 6 presets**

```js
// src/utils/formations.js

export const FORMATIONS = {
  "4-4-2": {
    label: "4-4-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 15, y: 50, role: "MF" }, { x: 38, y: 53, role: "MF" }, { x: 62, y: 53, role: "MF" }, { x: 85, y: 50, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-3-3": {
    label: "4-3-3",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 25, y: 52, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 75, y: 52, role: "MF" },
      { x: 20, y: 25, role: "FW" }, { x: 50, y: 20, role: "FW" }, { x: 80, y: 25, role: "FW" },
    ],
  },
  "3-5-2": {
    label: "3-5-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 25, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 75, y: 78, role: "DF" },
      { x: 10, y: 55, role: "MF" }, { x: 30, y: 50, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 70, y: 50, role: "MF" }, { x: 90, y: 55, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-2-3-1": {
    label: "4-2-3-1",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 35, y: 58, role: "MF" }, { x: 65, y: 58, role: "MF" },
      { x: 20, y: 38, role: "MF" }, { x: 50, y: 35, role: "MF" }, { x: 80, y: 38, role: "MF" },
      { x: 50, y: 18, role: "FW" },
    ],
  },
  "3-4-3": {
    label: "3-4-3",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 25, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 75, y: 78, role: "DF" },
      { x: 15, y: 52, role: "MF" }, { x: 40, y: 50, role: "MF" }, { x: 60, y: 50, role: "MF" }, { x: 85, y: 52, role: "MF" },
      { x: 20, y: 25, role: "FW" }, { x: 50, y: 20, role: "FW" }, { x: 80, y: 25, role: "FW" },
    ],
  },
  "5-3-2": {
    label: "5-3-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 10, y: 72, role: "DF" }, { x: 30, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 70, y: 78, role: "DF" }, { x: 90, y: 72, role: "DF" },
      { x: 25, y: 50, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 75, y: 50, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

export const ROLE_COLORS = {
  GK: "#eab308",
  DF: "#3b82f6",
  MF: "#22c55e",
  FW: "#ef4444",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/formations.js
git commit -m "feat(formation): add formation presets data"
```

---

### Task 2: FormationPitch Component

**Files:**
- Create: `src/components/game/FormationPitch.jsx`

- [ ] **Step 1: Create SVG pitch component**

This is a reusable pitch graphic that renders a green field with lines and player circles at given positions. Used by both FormationSetup and FormationRecorder.

Props:
- `positions`: array of `{x, y, role}` from formations.js
- `assignments`: object `{posIdx: playerName}` mapping position index to player name
- `onPlayerTap(posIdx, playerName)`: callback when a player circle is tapped
- `onEmptyTap(posIdx)`: callback when an unassigned position circle is tapped
- `highlightIdx`: optional position index to highlight (for selection mode)
- `size`: width in pixels (height = size * 1.4 for pitch aspect ratio)

The pitch should be a div with green gradient background, white field lines (center circle, penalty areas), and player circles with names.

```jsx
// src/components/game/FormationPitch.jsx
import { useTheme } from '../../hooks/useTheme';
import { ROLE_COLORS } from '../../utils/formations';

export default function FormationPitch({ positions, assignments = {}, onPlayerTap, onEmptyTap, highlightIdx, size = 340 }) {
  const { C } = useTheme();
  const h = size * 1.45;
  const pad = 8;

  return (
    <div style={{ position: "relative", width: size, height: h, margin: "0 auto", borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg, #1a472a 0%, #2d6a3e 50%, #1a472a 100%)", border: `2px solid ${C.grayDark}` }}>
      {/* Field lines */}
      <svg width={size} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Border */}
        <rect x={pad} y={pad} width={size - pad * 2} height={h - pad * 2} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} rx={4} />
        {/* Center line */}
        <line x1={pad} y1={h / 2} x2={size - pad} y2={h / 2} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        {/* Center circle */}
        <circle cx={size / 2} cy={h / 2} r={size * 0.12} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        {/* Top penalty area */}
        <rect x={size * 0.25} y={pad} width={size * 0.5} height={h * 0.12} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        {/* Bottom penalty area */}
        <rect x={size * 0.25} y={h - pad - h * 0.12} width={size * 0.5} height={h * 0.12} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        {/* Top goal */}
        <rect x={size * 0.38} y={pad - 2} width={size * 0.24} height={h * 0.03} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
        {/* Bottom goal */}
        <rect x={size * 0.38} y={h - pad - h * 0.03 + 2} width={size * 0.24} height={h * 0.03} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      </svg>

      {/* Player circles */}
      {positions.map((pos, idx) => {
        const player = assignments[idx];
        const px = (pos.x / 100) * (size - pad * 2) + pad;
        const py = (pos.y / 100) * (h - pad * 2) + pad;
        const roleColor = ROLE_COLORS[pos.role] || C.white;
        const isHighlight = highlightIdx === idx;
        const hasPlayer = !!player;

        return (
          <div key={idx}
            onClick={() => hasPlayer ? onPlayerTap?.(idx, player) : onEmptyTap?.(idx)}
            style={{
              position: "absolute",
              left: px - 22, top: py - 22,
              width: 44, height: 44,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 10,
            }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: hasPlayer ? roleColor + "cc" : "rgba(255,255,255,0.15)",
              border: isHighlight ? "3px solid #fff" : `2px solid ${hasPlayer ? roleColor : "rgba(255,255,255,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
              boxShadow: isHighlight ? "0 0 12px rgba(255,255,255,0.5)" : hasPlayer ? `0 2px 6px ${roleColor}44` : "none",
              transition: "all 0.15s",
            }}>
              {hasPlayer ? player.slice(-2) : pos.role}
            </div>
            {hasPlayer && (
              <div style={{ fontSize: 8, color: "#fff", fontWeight: 700, marginTop: 1, textShadow: "0 1px 3px rgba(0,0,0,0.8)", whiteSpace: "nowrap", maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
                {player}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/FormationPitch.jsx
git commit -m "feat(formation): add FormationPitch SVG component"
```

---

### Task 3: PlayerActionMenu Component

**Files:**
- Create: `src/components/game/PlayerActionMenu.jsx`

- [ ] **Step 1: Create action popup**

A floating popup that appears when a player is tapped on the pitch. Shows player name and action buttons.

```jsx
// src/components/game/PlayerActionMenu.jsx
import { useTheme } from '../../hooks/useTheme';

export default function PlayerActionMenu({ player, position, onGoal, onAssist, onOwnGoal, onClose }) {
  const { C } = useTheme();

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: C.card, borderRadius: 16, padding: 20, maxWidth: 280, width: "100%", textAlign: "center",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.white, marginBottom: 4 }}>{player}</div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 16 }}>{position}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => onGoal(player)}
            style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.green}25`, color: C.green }}>
            ⚽ 골
          </button>
          <button onClick={() => onAssist(player)}
            style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.accent}25`, color: C.accent }}>
            🅰️ 어시스트
          </button>
          <button onClick={() => onOwnGoal(player)}
            style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.red}25`, color: C.red }}>
            🔴 자책골
          </button>
        </div>
        <button onClick={onClose}
          style={{ marginTop: 10, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>
          취소
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/PlayerActionMenu.jsx
git commit -m "feat(formation): add PlayerActionMenu popup"
```

---

### Task 4: RosterSelector Component

**Files:**
- Create: `src/components/game/RosterSelector.jsx`

- [ ] **Step 1: Create roster selection component**

Step 1 of the flow: select attending players (11~18) from the full roster.

```jsx
// src/components/game/RosterSelector.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function RosterSelector({ allPlayers, onConfirm }) {
  const { C } = useTheme();
  const [selected, setSelected] = useState(new Set());

  const toggle = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const count = selected.size;
  const canConfirm = count >= 11;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>출전 명단 선택</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: canConfirm ? C.green : C.accent }}>{count}명 선택</div>
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>스타팅 11명 + 후보 선수를 선택하세요 (최소 11명)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
        {allPlayers.map(name => {
          const isSelected = selected.has(name);
          return (
            <div key={name} onClick={() => toggle(name)}
              style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: isSelected ? `${C.accent}22` : C.cardLight,
                color: isSelected ? C.accent : C.grayLight,
                border: isSelected ? `1px solid ${C.accent}` : `1px solid ${C.grayDark}`,
              }}>
              {name}
            </div>
          );
        })}
      </div>
      <button onClick={() => canConfirm && onConfirm([...selected])}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
          background: canConfirm ? C.accent : C.grayDark, color: canConfirm ? C.bg : C.gray,
          opacity: canConfirm ? 1 : 0.5,
        }}>
        다음 ({count}명)
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/RosterSelector.jsx
git commit -m "feat(formation): add RosterSelector component"
```

---

### Task 5: FormationSetup Component

**Files:**
- Create: `src/components/game/FormationSetup.jsx`

- [ ] **Step 1: Create formation setup component**

Step 2: Choose formation preset, then tap each position circle on the pitch to assign a player.

```jsx
// src/components/game/FormationSetup.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS, ROLE_COLORS } from '../../utils/formations';
import FormationPitch from './FormationPitch';

export default function FormationSetup({ selectedPlayers, onConfirm, onBack }) {
  const { C } = useTheme();
  const [formation, setFormation] = useState("4-4-2");
  const [assignments, setAssignments] = useState({}); // { posIdx: playerName }
  const [selectingPos, setSelectingPos] = useState(null); // posIdx being assigned

  const formData = FORMATIONS[formation];
  const assignedNames = new Set(Object.values(assignments));
  const unassigned = selectedPlayers.filter(n => !assignedNames.has(n));
  const assignedCount = Object.keys(assignments).length;
  const canStart = assignedCount === 11;

  const handleEmptyTap = (posIdx) => { setSelectingPos(posIdx); };

  const handlePlayerTap = (posIdx) => {
    // Tapping assigned position → unassign
    setAssignments(prev => { const next = { ...prev }; delete next[posIdx]; return next; });
  };

  const handleAssignPlayer = (name) => {
    if (selectingPos === null) return;
    setAssignments(prev => ({ ...prev, [selectingPos]: name }));
    setSelectingPos(null);
  };

  const handleFormationChange = (key) => {
    setFormation(key);
    setAssignments({}); // 포메이션 변경 시 배치 초기화
    setSelectingPos(null);
  };

  const handleConfirm = () => {
    if (!canStart) return;
    const gk = Object.entries(assignments).find(([idx]) => formData.positions[idx].role === "GK")?.[1] || "";
    const positionMap = {};
    Object.entries(assignments).forEach(([idx, name]) => {
      positionMap[name] = formData.positions[idx].role;
    });
    const subs = selectedPlayers.filter(n => !assignedNames.has(n));
    onConfirm({ formation, assignments, gk, positionMap, subs });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>포메이션 · 선수 배치</div>
        <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: canStart ? C.green : C.gray }}>{assignedCount}/11</div>
      </div>

      {/* Formation selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
        {FORMATION_KEYS.map(key => (
          <button key={key} onClick={() => handleFormationChange(key)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              background: formation === key ? C.accent : C.grayDark, color: formation === key ? C.bg : C.grayLight }}>
            {FORMATIONS[key].label}
          </button>
        ))}
      </div>

      {/* Pitch */}
      <FormationPitch
        positions={formData.positions}
        assignments={assignments}
        onPlayerTap={handlePlayerTap}
        onEmptyTap={handleEmptyTap}
        highlightIdx={selectingPos}
      />

      {/* Player selection for position */}
      {selectingPos !== null && (
        <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${C.accent}` }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8 }}>
            {formData.positions[selectingPos].role} 포지션에 배치할 선수
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {unassigned.map(name => (
              <button key={name} onClick={() => handleAssignPlayer(name)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>
                {name}
              </button>
            ))}
          </div>
          <button onClick={() => setSelectingPos(null)}
            style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 11, cursor: "pointer", background: C.grayDark, color: C.gray }}>
            취소
          </button>
        </div>
      )}

      {/* Unassigned players */}
      {selectingPos === null && unassigned.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.gray }}>
          후보: {unassigned.join(", ")}
        </div>
      )}

      {/* Start button */}
      <button onClick={handleConfirm}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 14,
          background: canStart ? C.green : C.grayDark, color: canStart ? C.bg : C.gray,
          opacity: canStart ? 1 : 0.5,
        }}>
        경기 시작
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/FormationSetup.jsx
git commit -m "feat(formation): add FormationSetup component"
```

---

### Task 6: FormationRecorder Component

**Files:**
- Create: `src/components/game/FormationRecorder.jsx`

- [ ] **Step 1: Create the main match recording component**

Step 3-4: Live match recording on the formation pitch. Handles goals (via player tap), opponent goals, substitutions, formation changes, and match finish.

```jsx
// src/components/game/FormationRecorder.jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS } from '../../utils/formations';
import { generateEventId } from '../../utils/idGenerator';
import FormationPitch from './FormationPitch';
import PlayerActionMenu from './PlayerActionMenu';

export default function FormationRecorder({
  formation: initFormation, assignments: initAssignments, positionMap: initPositionMap,
  subs: initSubs, gk: initGk, opponent, startedAt,
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch,
}) {
  const { C } = useTheme();
  const [formation, setFormation] = useState(initFormation);
  const [assignments, setAssignments] = useState(initAssignments);
  const [positionMap, setPositionMap] = useState(initPositionMap);
  const [subs, setSubs] = useState(initSubs);
  const [gk, setGk] = useState(initGk);
  const [actionPlayer, setActionPlayer] = useState(null); // { posIdx, name, role }
  const [goalFlow, setGoalFlow] = useState(null); // { type: "selectAssist", scorer } or { type: "selectScorer", assister }
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subOut, setSubOut] = useState(null);

  const events = initEvents || [];
  const formData = FORMATIONS[formation];

  // Score
  let ourScore = 0, opponentScore = 0;
  for (const e of events) {
    if (e.type === "goal") ourScore++;
    else if (e.type === "owngoal" || e.type === "opponentGoal") opponentScore++;
  }

  const currentGk = gk;
  const pitchPlayers = Object.values(assignments);

  // Player tap on pitch
  const handlePlayerTap = (posIdx, name) => {
    if (goalFlow) {
      // In goal flow: selecting assist or scorer
      if (goalFlow.type === "selectAssist") {
        onAddEvent({ type: "goal", player: goalFlow.scorer, assist: name, id: generateEventId(), timestamp: Date.now() });
        setGoalFlow(null);
      } else if (goalFlow.type === "selectScorer") {
        onAddEvent({ type: "goal", player: name, assist: goalFlow.assister, id: generateEventId(), timestamp: Date.now() });
        setGoalFlow(null);
      }
      return;
    }
    const role = formData.positions[posIdx]?.role || positionMap[name] || "FW";
    setActionPlayer({ posIdx, name, role });
  };

  // Action menu handlers
  const handleGoal = (player) => {
    setActionPlayer(null);
    setGoalFlow({ type: "selectAssist", scorer: player });
  };

  const handleAssist = (player) => {
    setActionPlayer(null);
    setGoalFlow({ type: "selectScorer", assister: player });
  };

  const handleOwnGoal = (player) => {
    onAddEvent({ type: "owngoal", player, id: generateEventId(), timestamp: Date.now() });
    setActionPlayer(null);
  };

  const handleNoAssist = () => {
    if (goalFlow?.type === "selectAssist") {
      onAddEvent({ type: "goal", player: goalFlow.scorer, assist: null, id: generateEventId(), timestamp: Date.now() });
    }
    setGoalFlow(null);
  };

  // Opponent goal
  const handleOpponentGoal = () => {
    if (!confirm("상대팀 골을 기록하시겠습니까?")) return;
    onAddEvent({ type: "opponentGoal", currentGk, id: generateEventId(), timestamp: Date.now() });
  };

  // Substitution
  const handleSubOut = (posIdx, name) => {
    setSubOut({ posIdx, name });
    setShowSubModal(false);
  };

  const handleSubIn = (subName) => {
    if (!subOut) return;
    const role = formData.positions[subOut.posIdx]?.role || "FW";
    onAddEvent({ type: "sub", playerOut: subOut.name, playerIn: subName, position: role, id: generateEventId(), timestamp: Date.now() });
    // Update assignments
    setAssignments(prev => ({ ...prev, [subOut.posIdx]: subName }));
    setPositionMap(prev => { const next = { ...prev }; delete next[subOut.name]; next[subName] = role; return next; });
    setSubs(prev => [...prev.filter(n => n !== subName), subOut.name]);
    if (role === "GK") setGk(subName);
    setSubOut(null);
  };

  // Formation change
  const handleFormationChange = (key) => {
    const newForm = FORMATIONS[key];
    const currentPlayers = Object.values(assignments);
    const newAssignments = {};
    const newPosMap = {};
    currentPlayers.forEach((name, i) => {
      if (i < 11) {
        newAssignments[i] = name;
        newPosMap[name] = newForm.positions[i].role;
      }
    });
    setFormation(key);
    setAssignments(newAssignments);
    setPositionMap(newPosMap);
    const newGk = Object.entries(newAssignments).find(([idx]) => newForm.positions[idx].role === "GK")?.[1] || gk;
    setGk(newGk);
    setShowFormationPicker(false);
  };

  // Finish
  const handleFinish = () => {
    if (!confirm(`${ourScore} : ${opponentScore} (vs ${opponent})\n경기를 종료하시겠습니까?`)) return;
    onFinishMatch({ formation, assignments, positionMap, subs, gk });
  };

  const formatTime = (ts) => {
    if (!startedAt) return "";
    return `${Math.floor((ts - startedAt) / 60000)}'`;
  };

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div>
      {/* Scoreboard */}
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", background: C.cardLight, borderRadius: 12, padding: "10px 8px", marginBottom: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gray }}>우리팀</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</div>
        </div>
        <div style={{ fontSize: 11, color: C.gray }}>vs {opponent}</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gray }}>상대팀</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</div>
        </div>
      </div>

      {/* Goal flow indicator */}
      {goalFlow && (
        <div style={{ padding: "8px 12px", background: `${C.green}15`, borderRadius: 8, marginBottom: 8, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>
            {goalFlow.type === "selectAssist" ? `⚽ ${goalFlow.scorer} 골! 어시스트 선수를 탭하세요` : `🅰️ ${goalFlow.assister} 어시! 골 선수를 탭하세요`}
          </div>
          <button onClick={handleNoAssist} style={{ marginTop: 4, padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 11, cursor: "pointer", background: C.grayDark, color: C.gray }}>
            {goalFlow.type === "selectAssist" ? "어시 없음 (단독골)" : "취소"}
          </button>
        </div>
      )}

      {/* Pitch */}
      <FormationPitch
        positions={formData.positions}
        assignments={assignments}
        onPlayerTap={handlePlayerTap}
        onEmptyTap={() => {}}
      />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={handleOpponentGoal}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.red}20`, color: C.red }}>
          ⚽ 상대골
        </button>
        <button onClick={() => { setShowSubModal(true); setSubOut(null); }}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.accent}20`, color: C.accent }}>
          🔄 교체
        </button>
        <button onClick={() => setShowFormationPicker(true)}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.grayDarker}`, color: C.grayLight }}>
          📋 포메이션
        </button>
        <button onClick={handleFinish}
          style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.green}20`, color: C.green }}>
          🏁 종료
        </button>
      </div>

      {/* Subs bench */}
      {subs.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.gray }}>
          <span style={{ fontWeight: 600 }}>후보:</span> {subs.join(", ")}
        </div>
      )}

      {/* Event log */}
      {sortedEvents.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>기록 ({sortedEvents.length})</div>
          {sortedEvents.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11 }}>
              <span style={{ color: C.grayDark, minWidth: 24 }}>{formatTime(e.timestamp)}</span>
              {e.type === "goal" && <><span>⚽</span><span style={{ fontWeight: 600, color: C.white }}>{e.player}</span>{e.assist && <span style={{ color: C.gray }}> ← {e.assist}</span>}</>}
              {e.type === "owngoal" && <><span>🔴</span><span style={{ color: C.red }}>{e.player} (자책)</span></>}
              {e.type === "opponentGoal" && <><span>⚽</span><span style={{ color: C.red }}>상대골</span>{e.currentGk && <span style={{ color: C.gray }}> GK:{e.currentGk}</span>}</>}
              {e.type === "sub" && <><span>🔄</span><span style={{ color: C.red }}>{e.playerOut}</span><span style={{ color: C.gray }}>→</span><span style={{ color: C.green }}>{e.playerIn}</span></>}
              <button onClick={() => onDeleteEvent(e.id)} style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 9, padding: "2px 5px", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Player action menu */}
      {actionPlayer && !goalFlow && (
        <PlayerActionMenu
          player={actionPlayer.name} position={actionPlayer.role}
          onGoal={handleGoal} onAssist={handleAssist} onOwnGoal={handleOwnGoal}
          onClose={() => setActionPlayer(null)}
        />
      )}

      {/* Sub modal */}
      {showSubModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowSubModal(false)}>
          <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 360, width: "100%", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            {!subOut ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.white, textAlign: "center", marginBottom: 12 }}>🔄 나가는 선수</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(assignments).map(([idx, name]) => (
                    <button key={idx} onClick={() => handleSubOut(Number(idx), name)}
                      style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>
                      <span style={{ fontSize: 10, color: C.gray }}>{formData.positions[idx]?.role}</span> {name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.white, textAlign: "center", marginBottom: 4 }}>🔄 들어오는 선수</div>
                <div style={{ fontSize: 12, color: C.red, textAlign: "center", marginBottom: 12 }}>{subOut.name} → ?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {subs.map(name => (
                    <button key={name} onClick={() => { handleSubIn(name); setShowSubModal(false); }}
                      style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>
                      {name}
                    </button>
                  ))}
                </div>
                {subs.length === 0 && <div style={{ textAlign: "center", color: C.gray, fontSize: 12 }}>후보가 없습니다</div>}
              </>
            )}
            <button onClick={() => { setShowSubModal(false); setSubOut(null); }}
              style={{ marginTop: 12, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>취소</button>
          </div>
        </div>
      )}

      {/* Formation picker */}
      {showFormationPicker && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowFormationPicker(false)}>
          <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 300, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white, textAlign: "center", marginBottom: 12 }}>📋 포메이션 변경</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FORMATION_KEYS.map(key => (
                <button key={key} onClick={() => handleFormationChange(key)}
                  style={{ padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    background: formation === key ? C.accent : C.grayDarker, color: formation === key ? C.bg : C.white }}>
                  {FORMATIONS[key].label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowFormationPicker(false)}
              style={{ marginTop: 10, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/game/FormationRecorder.jsx
git commit -m "feat(formation): add FormationRecorder match component"
```

---

### Task 7: Update TournamentMatchManager

**Files:**
- Modify: `src/components/tournament/TournamentMatchManager.jsx`

- [ ] **Step 1: Replace LineupSelector + SoccerRecorder with new components**

Rewrite TournamentMatchManager to use the new 3-step flow:
1. RosterSelector (출전명단)
2. FormationSetup (포메이션 배치)
3. FormationRecorder (경기 진행)

Also add Firebase auto-save for in-progress matches.

Key changes:
- Replace `import LineupSelector` and `import SoccerRecorder` with `import RosterSelector`, `import FormationSetup`, `import FormationRecorder`
- Change phase flow: `list → roster → formation → playing → finished`
- Add `matchState` object that holds all formation/assignment/event data
- On each state change, save to `tournaments/{team}/{tournamentId}/activeGame` via Firebase
- On mount, check for activeGame and restore

Read the current TournamentMatchManager.jsx, then rewrite it completely with the new flow. The match finish logic (buildEventLogRows, writeTournamentEventLog, writeTournamentPlayerRecord, updateTournamentMatchScore) should be preserved from the existing implementation.

Important: The `buildEventLogRows` function from `soccerScoring.js` creates event log rows from a soccerMatch object. The FormationRecorder's data structure is slightly different (it uses `assignments` and `positionMap` instead of `lineup`, `gk`, `defenders`). When finishing the match, convert to the soccerMatch format:
```js
const soccerMatch = {
  matchIdx: selectedMatch.matchNum - 1,
  opponent,
  lineup: Object.values(matchState.assignments),
  gk: matchState.gk,
  defenders: Object.entries(matchState.positionMap).filter(([,r]) => r === "DF").map(([n]) => n),
  events: matchState.events,
  startedAt: matchState.startedAt,
  status: "finished",
};
```

For Firebase auto-save, use the existing `FirebaseSync` directly:
```js
import FirebaseSync from '../../services/firebaseSync';

// Save (debounced)
const saveRef = useRef(null);
const autoSave = (state) => {
  if (saveRef.current) clearTimeout(saveRef.current);
  saveRef.current = setTimeout(() => {
    const teamSafe = (teamName || "").replace(/[.#$/\[\]]/g, "_");
    const path = `tournaments/${teamSafe}/${tournament.id}/activeGame`;
    set(ref(firebaseDb, path), { ...state, updatedAt: Date.now() });
  }, 800);
};

// Load on mount
useEffect(() => {
  const teamSafe = (teamName || "").replace(/[.#$/\[\]]/g, "_");
  const path = `tournaments/${teamSafe}/${tournament.id}/activeGame`;
  get(ref(firebaseDb, path)).then(snap => {
    if (snap.exists()) {
      const saved = snap.val();
      setMatchState(saved);
      setPhase(saved.phase || "list");
      setSelectedMatch(saved.selectedMatch || null);
    }
  });
}, []);
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/TournamentMatchManager.jsx
git commit -m "feat(formation): integrate FormationRecorder into TournamentMatchManager"
```

---

### Task 8: Update SubstitutionModal for MF

**Files:**
- Modify: `src/components/game/SubstitutionModal.jsx`

- [ ] **Step 1: Update getPosition to support MF and accept positionMap**

The existing SubstitutionModal determines position as GK/DF/FW only. Update it to accept an optional `positionMap` prop (`{playerName: role}`) and use that if available, falling back to the old GK/DF/FW logic.

In `SubstitutionModal.jsx`, change:
```js
export default function SubstitutionModal({ currentLineup, bench, currentGk, currentDefenders, onConfirm, onClose }) {
```
to:
```js
export default function SubstitutionModal({ currentLineup, bench, currentGk, currentDefenders, positionMap, onConfirm, onClose }) {
```

And update `getPosition`:
```js
  const getPosition = (name) => {
    if (positionMap && positionMap[name]) return positionMap[name];
    if (name === currentGk) return "GK";
    if (currentDefenders?.includes(name)) return "DF";
    return "FW";
  };
```

This is backward-compatible — existing callers that don't pass `positionMap` will work as before.

- [ ] **Step 2: Commit**

```bash
git add src/components/game/SubstitutionModal.jsx
git commit -m "feat(formation): add MF position support to SubstitutionModal"
```

---

## Self-Review

### Spec Coverage
| Spec Requirement | Task |
|-----------------|------|
| 포메이션 6종 프리셋 | Task 1 (formations.js) |
| 피치 그래픽 + 선수 원형 | Task 2 (FormationPitch) |
| 선수 탭 → 액션 메뉴 | Task 3 (PlayerActionMenu) + Task 6 |
| 출전명단 선택 (11~18명) | Task 4 (RosterSelector) |
| 포메이션 선택 + 선수 배치 | Task 5 (FormationSetup) |
| 상대골 하단 버튼 | Task 6 (FormationRecorder) |
| 교체 하단 버튼 | Task 6 (FormationRecorder sub modal) |
| 포메이션 변경 | Task 6 (FormationRecorder formation picker) |
| 경기 종료 + 로그 저장 | Task 7 (TournamentMatchManager finish logic) |
| Firebase 자동 저장/복원 | Task 7 |
| MF 포지션 지원 | Task 1 (role:"MF") + Task 8 (SubstitutionModal) |
| GK/DF/MF/FW 이벤트 로그 | Task 7 (positionMap 변환) |

### Type Consistency
- `FORMATIONS[key].positions[idx]`: `{x, y, role}` — consistent across Tasks 1, 2, 5, 6
- `assignments`: `{posIdx: playerName}` — consistent across Tasks 5, 6, 7
- `positionMap`: `{playerName: role}` — consistent across Tasks 5, 6, 7, 8
- `events`: same `{type, player, assist, id, timestamp}` format as existing — consistent

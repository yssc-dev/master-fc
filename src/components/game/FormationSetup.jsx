import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS } from '../../utils/formations';
import FormationPitch from './FormationPitch';

export default function FormationSetup({ selectedPlayers, onConfirm, onBack, title }) {
  const { C } = useTheme();
  const [formation, setFormation] = useState("4-4-2");
  const [assignments, setAssignments] = useState({});
  const [selectingPos, setSelectingPos] = useState(null);

  const formData = FORMATIONS[formation];
  const assignedNames = new Set(Object.values(assignments));
  const unassigned = selectedPlayers.filter(n => !assignedNames.has(n)).sort((a, b) => a.localeCompare(b, "ko"));
  const assignedCount = Object.keys(assignments).length;
  const canStart = assignedCount === 11;

  const handleEmptyTap = (posIdx) => { setSelectingPos(posIdx); };
  const handlePlayerTap = (posIdx) => { setAssignments(prev => { const next = { ...prev }; delete next[posIdx]; return next; }); };

  const handleAssignPlayer = (name) => {
    if (selectingPos === null) return;
    setAssignments(prev => ({ ...prev, [selectingPos]: name }));
    setSelectingPos(null);
  };

  const handleFormationChange = (key) => { setFormation(key); setAssignments({}); setSelectingPos(null); };

  const handleConfirm = () => {
    if (!canStart) return;
    const gk = Object.entries(assignments).find(([idx]) => formData.positions[idx].role === "GK")?.[1] || "";
    const positionMap = {};
    Object.entries(assignments).forEach(([idx, name]) => { positionMap[name] = formData.positions[idx].role; });
    const subs = selectedPlayers.filter(n => !assignedNames.has(n));
    onConfirm({ formation, assignments, gk, positionMap, subs });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title || "포메이션 · 선수 배치"}</div>
        <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: canStart ? C.green : C.gray }}>{assignedCount}/11</div>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
        {FORMATION_KEYS.map(key => (
          <button key={key} onClick={() => handleFormationChange(key)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              background: formation === key ? C.accent : C.grayDark, color: formation === key ? C.bg : C.grayLight }}>
            {FORMATIONS[key].label}
          </button>
        ))}
      </div>
      <FormationPitch positions={formData.positions} assignments={assignments} onPlayerTap={handlePlayerTap} onEmptyTap={handleEmptyTap} highlightIdx={selectingPos} />
      {selectingPos !== null && (
        <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${C.accent}` }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8 }}>{formData.positions[selectingPos].role} 포지션에 배치할 선수</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {unassigned.map(name => (
              <button key={name} onClick={() => handleAssignPlayer(name)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>{name}</button>
            ))}
          </div>
          <button onClick={() => setSelectingPos(null)} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 11, cursor: "pointer", background: C.grayDark, color: C.gray }}>취소</button>
        </div>
      )}
      {selectingPos === null && unassigned.length > 0 && <div style={{ marginTop: 10, fontSize: 11, color: C.gray }}>후보: {unassigned.join(", ")}</div>}
      <button onClick={handleConfirm}
        style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 14,
          background: canStart ? C.green : C.grayDark, color: canStart ? C.bg : C.gray, opacity: canStart ? 1 : 0.5 }}>
        경기 시작
      </button>
    </div>
  );
}

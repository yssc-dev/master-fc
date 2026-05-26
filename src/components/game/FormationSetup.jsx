import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS } from '../../utils/formations';
import FormationPitch from './FormationPitch';

export default function FormationSetup({ selectedPlayers, onConfirm, onBack, title }) {
  const { C } = useTheme();
  const [formation, setFormation] = useState("4-4-2");
  const [assignments, setAssignments] = useState({});
  const [selectingPos, setSelectingPos] = useState(null);   // 선택된 빈 슬롯
  const [selectedPlayer, setSelectedPlayer] = useState(null); // 선택된 선수

  const formData = FORMATIONS[formation];
  const assignedNames = new Set(Object.values(assignments));
  const unassigned = selectedPlayers.filter(n => !assignedNames.has(n)).sort((a, b) => a.localeCompare(b, "ko"));
  const assignedCount = Object.keys(assignments).length;
  const canStart = assignedCount === 11;

  // 빈 슬롯 탭
  const handleEmptyTap = (posIdx) => {
    if (selectedPlayer) {
      setAssignments(prev => ({ ...prev, [posIdx]: selectedPlayer }));
      setSelectedPlayer(null);
      setSelectingPos(null);
    } else {
      setSelectingPos(prev => prev === posIdx ? null : posIdx);
    }
  };
  // 점유 슬롯 탭: 선택선수 있으면 스왑(기존선수 후보로), 없으면 해제
  const handlePlayerTap = (posIdx) => {
    if (selectedPlayer) {
      setAssignments(prev => ({ ...prev, [posIdx]: selectedPlayer }));
      setSelectedPlayer(null);
      setSelectingPos(null);
    } else {
      setAssignments(prev => { const next = { ...prev }; delete next[posIdx]; return next; });
    }
  };
  // 선수 칩 탭: 슬롯이 선택돼 있으면 배치, 아니면 선수 선택 토글
  const handlePlayerChip = (name) => {
    if (selectingPos !== null) {
      setAssignments(prev => ({ ...prev, [selectingPos]: name }));
      setSelectingPos(null);
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(prev => prev === name ? null : name);
    }
  };

  const handleFormationChange = (key) => { setFormation(key); setAssignments({}); setSelectingPos(null); setSelectedPlayer(null); };

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
      <FormationPitch positions={formData.positions} assignments={assignments}
        onPlayerTap={handlePlayerTap} onEmptyTap={handleEmptyTap}
        highlightIdx={selectingPos} pendingPlayer={selectedPlayer} />
      <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${selectedPlayer ? C.accent : C.grayDark}` }}>
        <div style={{ fontSize: 12, color: selectedPlayer ? C.accent : C.gray, fontWeight: 700, marginBottom: 8 }}>
          {selectedPlayer ? `${selectedPlayer} → 배치할 위치를 탭하세요` : selectingPos !== null ? `${formData.positions[selectingPos].role} 자리에 넣을 선수를 탭하세요` : `후보 (${unassigned.length}) — 선수를 탭한 뒤 위치를 탭`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {unassigned.map(name => (
            <button key={name} onClick={() => handlePlayerChip(name)}
              style={{ padding: "8px 12px", borderRadius: 8, border: selectedPlayer === name ? `2px solid ${C.accent}` : "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: selectedPlayer === name ? `${C.accent}30` : C.grayDarker, color: C.white }}>{name}</button>
          ))}
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>모든 선수 배치 완료</span>}
        </div>
      </div>
      <button onClick={handleConfirm}
        style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 14,
          background: canStart ? C.green : C.grayDark, color: canStart ? C.bg : C.gray, opacity: canStart ? 1 : 0.5 }}>
        경기 시작
      </button>
    </div>
  );
}

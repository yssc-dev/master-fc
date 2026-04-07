import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function LineupSelector({ attendees, onConfirm, styles: s }) {
  const { C } = useTheme();
  const [selected, setSelected] = useState(new Set());
  const [positions, setPositions] = useState({});

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
        const np = { ...prev };
        Object.keys(np).forEach(k => { if (np[k] === "GK") delete np[k]; });
        np[name] = "GK";
        return np;
      }
      if (current === "GK") return { ...prev, [name]: "DF" };
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

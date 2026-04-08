import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function RosterSelector({ allPlayers, onConfirm }) {
  const { C } = useTheme();
  const [selected, setSelected] = useState(new Set());

  const toggle = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
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
              style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: isSelected ? `${C.accent}22` : C.cardLight, color: isSelected ? C.accent : C.grayLight,
                border: isSelected ? `1px solid ${C.accent}` : `1px solid ${C.grayDark}` }}>
              {name}
            </div>
          );
        })}
      </div>
      <button onClick={() => canConfirm && onConfirm([...selected])}
        style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
          background: canConfirm ? C.accent : C.grayDark, color: canConfirm ? C.bg : C.gray, opacity: canConfirm ? 1 : 0.5 }}>
        다음 ({count}명)
      </button>
    </div>
  );
}

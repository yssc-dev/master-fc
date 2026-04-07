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

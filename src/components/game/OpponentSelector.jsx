import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

// props: opponents(string[] = 오늘 참석팀), onSelect, onAddOpponent, onRemoveOpponent, onRenameOpponent, styles
export default function OpponentSelector({ opponents, onSelect, onAddOpponent, onRemoveOpponent, onRenameOpponent, styles: s }) {
  const { C } = useTheme();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [renaming, setRenaming] = useState(null); // 이름변경 중인 팀명
  const [renameValue, setRenameValue] = useState("");

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (opponents.includes(name)) { alert("이미 등록된 상대팀입니다."); return; }
    onAddOpponent(name);
    onSelect(name);
    setNewName("");
    setAdding(false);
  };

  const commitRename = (oldName) => {
    const v = renameValue.trim();
    if (v && v !== oldName) onRenameOpponent?.(oldName, v);
    setRenaming(null); setRenameValue("");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: C.gray }}>상대팀 선택</div>
        {opponents.length > 0 && (
          <button onClick={() => { setEditMode(e => !e); setRenaming(null); }}
            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: editMode ? C.accent : C.grayDark, color: editMode ? C.bg : C.gray, border: "none", cursor: "pointer" }}>
            {editMode ? "완료" : "편집"}
          </button>
        )}
      </div>
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
            renaming === name ? (
              <input key={name} autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && commitRename(name)} onBlur={() => commitRename(name)}
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, background: C.cardLight, color: C.white, border: `1px solid ${C.accent}`, width: 120 }} />
            ) : (
              <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 10px 8px 16px", borderRadius: 8, background: C.cardLight, color: C.white, border: `1px solid ${C.grayDark}`, fontSize: 13, fontWeight: 600 }}>
                <span onClick={() => editMode ? (setRenaming(name), setRenameValue(name)) : onSelect(name)} style={{ cursor: "pointer" }}>{name}</span>
                {editMode && (
                  <button onClick={() => onRemoveOpponent?.(name)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} aria-label={`${name} 제거`}>✕</button>
                )}
              </div>
            )
          ))}
          {!editMode && (
            <button onClick={() => setAdding(true)}
              style={{ padding: "8px 16px", borderRadius: 8, background: `${C.accent}20`, color: C.accent, border: `1px dashed ${C.accent}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              + 새 상대팀
            </button>
          )}
        </div>
      )}
    </div>
  );
}

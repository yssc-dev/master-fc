import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function SubstitutionModal({ currentLineup, bench, currentGk, currentDefenders, positionMap, onConfirm, onClose }) {
  const { C } = useTheme();
  const [playerOut, setPlayerOut] = useState(null);
  const [playerIn, setPlayerIn] = useState(null);

  const getPosition = (name) => {
    if (positionMap && positionMap[name]) return positionMap[name];
    if (name === currentGk) return "GK";
    if (currentDefenders?.includes(name)) return "DF";
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

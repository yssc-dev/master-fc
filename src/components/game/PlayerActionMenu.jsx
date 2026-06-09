import { useTheme } from '../../hooks/useTheme';

export default function PlayerActionMenu({ player, position, onGoal, onAssist, onOwnGoal, onYellowCard, onRedCard, onSub, onClose }) {
  const { C } = useTheme();
  const btn = (bg, color) => ({
    padding: "10px 0", borderRadius: 10, border: "none",
    fontSize: 14, fontWeight: 700, cursor: "pointer", background: bg, color,
  });
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 14, padding: 14, maxWidth: 260, width: "100%", textAlign: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{player}</span>
          <span style={{ fontSize: 11, color: C.gray }}>{position}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button onClick={() => onGoal(player)} style={btn(`${C.green}25`, C.green)}>⚽ 골</button>
          <button onClick={() => onAssist(player)} style={btn(`${C.accent}25`, C.accent)}>🅰️ 어시</button>
          <button onClick={() => onOwnGoal(player)} style={btn(`${C.red}25`, C.red)}>🔴 자책</button>
          {onSub && <button onClick={() => onSub(player)} style={btn(`${C.accent}20`, C.accent)}>🔄 교체</button>}
          <button onClick={() => onYellowCard(player)} style={btn("#eab30825", "#eab308")}>🟨 옐로</button>
          <button onClick={() => onRedCard(player)} style={btn("#ef444425", "#ef4444")}>🟥 레드</button>
        </div>
        <button onClick={onClose} style={{ marginTop: 8, padding: "9px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>취소</button>
      </div>
    </div>
  );
}

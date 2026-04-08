import { useTheme } from '../../hooks/useTheme';

export default function PlayerActionMenu({ player, position, onGoal, onAssist, onOwnGoal, onClose }) {
  const { C } = useTheme();
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 280, width: "100%", textAlign: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.white, marginBottom: 4 }}>{player}</div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 16 }}>{position}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => onGoal(player)} style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.green}25`, color: C.green }}>⚽ 골</button>
          <button onClick={() => onAssist(player)} style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.accent}25`, color: C.accent }}>🅰️ 어시스트</button>
          <button onClick={() => onOwnGoal(player)} style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.red}25`, color: C.red }}>🔴 자책골</button>
        </div>
        <button onClick={onClose} style={{ marginTop: 10, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>취소</button>
      </div>
    </div>
  );
}

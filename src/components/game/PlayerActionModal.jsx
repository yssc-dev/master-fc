import { useTheme } from '../../hooks/useTheme';

export default function PlayerActionModal({ player, onGoal, onAssist, onOwnGoal, onCancel, styles: s }) {
  const { C } = useTheme();
  return (
    <div onClick={onCancel} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 20, minWidth: 260, maxWidth: "80vw", textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: C.white }}>{player}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onGoal} style={{ ...s.btn(C.green), flex: 1, padding: "12px 0", fontSize: 15 }}>⚽ 골</button>
          <button onClick={onAssist} style={{ ...s.btn(C.accent, C.bg), flex: 1, padding: "12px 0", fontSize: 15 }}>👟 어시</button>
          <button onClick={onOwnGoal} style={{ ...s.btn(C.red), flex: 1, padding: "12px 0", fontSize: 15 }}>🔴 자책골</button>
        </div>
        <button onClick={onCancel} style={{ ...s.btnSm(C.grayDark), marginTop: 10, width: "100%" }}>취소</button>
      </div>
    </div>
  );
}

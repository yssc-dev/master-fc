import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

export default function PlayerActionMenu({ player, position, onGoal, onAssist, onOwnGoal, onYellowCard, onRedCard, onSub, onClose }) {
  const { C } = useTheme();
  const btn = (bg, color) => ({
    padding: "12px 0", borderRadius: 10, border: "none",
    fontSize: 14, fontWeight: 700, cursor: "pointer", background: bg, color,
  });
  return (
    <Modal onClose={onClose} maxWidth={300}
      title={<>{player} <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>{position}</span></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={() => onGoal(player)} style={btn(`${C.green}25`, C.green)}>⚽ 골</button>
        <button onClick={() => onAssist(player)} style={btn(`${C.accent}25`, C.accent)}>🅰️ 어시</button>
        <button onClick={() => onOwnGoal(player)} style={btn(`${C.red}25`, C.red)}>🔴 자책</button>
        {onSub && <button onClick={() => onSub(player)} style={btn(`${C.accent}20`, C.accent)}>🔄 교체</button>}
        <button onClick={() => onYellowCard(player)} style={btn("#eab30825", "#eab308")}>🟨 옐로</button>
        <button onClick={() => onRedCard(player)} style={btn("#ef444425", "#ef4444")}>🟥 레드</button>
      </div>
    </Modal>
  );
}

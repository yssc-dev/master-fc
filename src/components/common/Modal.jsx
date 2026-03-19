import { useTheme } from '../../hooks/useTheme';

export default function Modal({ onClose, children, title, maxWidth = 460 }) {
  const { C } = useTheme();
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 40 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 16, width: "90%", maxWidth, maxHeight: "80vh", overflow: "auto" }}>
        {title && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{title}</span>
            <button onClick={onClose} style={{ background: C.grayDark, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>닫기</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

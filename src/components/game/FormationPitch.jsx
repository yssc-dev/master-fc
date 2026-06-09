import { useTheme } from '../../hooks/useTheme';
import { ROLE_COLORS } from '../../utils/formations';

export default function FormationPitch({ positions, assignments = {}, onPlayerTap, onEmptyTap, highlightIdx, size = 340 }) {
  const { C } = useTheme();
  const h = size * 1.45;
  const pad = 8;

  return (
    <div style={{ position: "relative", width: size, height: h, margin: "0 auto", borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg, #1a472a 0%, #2d6a3e 50%, #1a472a 100%)", border: `2px solid ${C.grayDark}` }}>
      <svg width={size} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
        <rect x={pad} y={pad} width={size - pad * 2} height={h - pad * 2} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} rx={4} />
        <line x1={pad} y1={h / 2} x2={size - pad} y2={h / 2} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        <circle cx={size / 2} cy={h / 2} r={size * 0.12} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        <rect x={size * 0.25} y={pad} width={size * 0.5} height={h * 0.12} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        <rect x={size * 0.25} y={h - pad - h * 0.12} width={size * 0.5} height={h * 0.12} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        <rect x={size * 0.38} y={pad - 2} width={size * 0.24} height={h * 0.03} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
        <rect x={size * 0.38} y={h - pad - h * 0.03 + 2} width={size * 0.24} height={h * 0.03} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      </svg>
      {positions.map((pos, idx) => {
        const player = assignments[idx];
        const px = (pos.x / 100) * (size - pad * 2) + pad;
        const py = (pos.y / 100) * (h - pad * 2) + pad;
        const roleColor = ROLE_COLORS[pos.role] || C.white;
        const isHighlight = highlightIdx === idx;
        const hasPlayer = !!player;
        return (
          <div key={idx}
            onClick={() => hasPlayer ? onPlayerTap?.(idx, player) : onEmptyTap?.(idx)}
            style={{ position: "absolute", left: px - 22, top: py - 22, width: 44, height: 44, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: hasPlayer ? roleColor + "cc" : "rgba(255,255,255,0.15)",
              border: isHighlight ? "3px solid #fff" : `2px solid ${hasPlayer ? roleColor : "rgba(255,255,255,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
              boxShadow: isHighlight ? "0 0 12px rgba(255,255,255,0.5)" : hasPlayer ? `0 2px 6px ${roleColor}44` : "none",
              transition: "all 0.15s",
            }}>
              {hasPlayer ? player.slice(-2) : pos.role}
            </div>
            {hasPlayer && (
              <div style={{ fontSize: 8, color: "#fff", fontWeight: 700, marginTop: 1, textShadow: "0 1px 3px rgba(0,0,0,0.8)", whiteSpace: "nowrap", maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
                {player}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

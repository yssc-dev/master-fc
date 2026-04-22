import { useTheme } from '../../hooks/useTheme';

const PIE = [
  "var(--app-blue)",
  "var(--app-green)",
  "var(--app-orange)",
  "var(--app-purple)",
  "var(--app-divider)",
];

export default function AssistSynergyDonut({ scorer, total, assisters }) {
  const { C } = useTheme();
  let acc = 0;
  const OR = 54, IR = 38;

  return (
    <div>
      <div style={{ padding: "0 4px 8px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.white, letterSpacing: "-0.022em" }}>
          {scorer}
        </div>
        <div style={{ fontSize: 13, color: C.gray }}>어시스트 분포</div>
      </div>
      <div style={{
        background: C.card,
        border: `0.5px solid ${C.borderColor}`,
        borderRadius: 14,
        padding: "16px 14px",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <svg width={120} height={120} viewBox="-60 -60 120 120">
          {assisters.map((a, i) => {
            const start = (acc / 100) * Math.PI * 2;
            acc += a.pct;
            const end = (acc / 100) * Math.PI * 2;
            const large = end - start > Math.PI ? 1 : 0;
            const x1 = Math.sin(start) * OR, y1 = -Math.cos(start) * OR;
            const x2 = Math.sin(end)   * OR, y2 = -Math.cos(end)   * OR;
            const x3 = Math.sin(end)   * IR, y3 = -Math.cos(end)   * IR;
            const x4 = Math.sin(start) * IR, y4 = -Math.cos(start) * IR;
            return (
              <path key={i}
                d={`M${x1},${y1} A${OR},${OR} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${IR},${IR} 0 ${large} 0 ${x4},${y4} Z`}
                fill={PIE[i % PIE.length]} />
            );
          })}
          <text textAnchor="middle" dy="-2"
            style={{
              fill: "var(--app-text-primary)",
              fontSize: 28, fontWeight: 700,
              letterSpacing: "-0.022em",
              fontVariantNumeric: "tabular-nums",
            }}>{total}</text>
          <text textAnchor="middle" y="14"
            style={{ fill: "var(--app-text-secondary)", fontSize: 10, fontWeight: 500 }}>골</text>
        </svg>

        <div style={{ flex: 1 }}>
          {assisters.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              padding: "4px 0",
              borderBottom: i === assisters.length - 1 ? "none" : `0.5px solid ${C.borderColor}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: PIE[i % PIE.length], flex: "none",
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 500, color: C.white,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{a.name}</span>
              </div>
              <span style={{
                fontSize: 14, fontWeight: 600, color: C.white,
                fontVariantNumeric: "tabular-nums",
              }}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

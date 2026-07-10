// src/components/dashboard/analytics/SoloGoalDonut.jsx
// 순위 멘트("단독드리블골 N명 중 K위") 대신 연속 스펙트럼 해석:
// 비율이 낮을수록 동료 어시를 받아 마무리, 높을수록 단독으로 만들어내는 유형.
export default function SoloGoalDonut({ data, C }) {
  if (!data || data.total === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        골 기록 없음
      </div>
    );
  }

  const { solo, total, soloRatio } = data;
  const size = 110, r = 44, c = size / 2, stroke = 16;
  const circ = 2 * Math.PI * r;
  const soloArc = circ * soloRatio;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>🎯 단독골 비율 (어시 없는 골)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={C.grayDarker} strokeWidth={stroke} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={C.accent} strokeWidth={stroke}
            strokeDasharray={`${soloArc} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />
          <text x={c} y={c} textAnchor="middle" dominantBaseline="middle" fill={C.gray} fontSize={14} fontWeight={700}>
            {Math.round(soloRatio * 100)}%
          </text>
        </svg>
        <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.6 }}>
          <div><span style={{ display: 'inline-block', width: 8, height: 8, background: C.accent, marginRight: 6 }}/>단독골 {solo} / 총 {total}골</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.accent, marginTop: 6, fontWeight: 600 }}>
        비율이 낮을수록 동료 어시로 마무리하는 유형, 높을수록 단독으로 만들어내는 유형입니다
      </div>
    </div>
  );
}

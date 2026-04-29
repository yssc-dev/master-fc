// src/components/dashboard/analytics/SoloGoalDonut.jsx
import { useMemo } from 'react';

export default function SoloGoalDonut({ data, player, ranking, C }) {
  const caption = useMemo(() => {
    if (!ranking) return null;
    const idx = ranking.soloHeroes.findIndex(x => x.player === player);
    if (idx >= 0) return `🎯 혼자 박는 자 ${ranking.soloHeroes.length}명 중 ${idx + 1}위`;
    return null;
  }, [ranking, player]);

  if (!data || data.total === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        골 기록 없음
      </div>
    );
  }

  const { solo, assisted, total, soloRatio } = data;
  const size = 110, r = 44, c = size / 2, stroke = 16;
  const circ = 2 * Math.PI * r;
  const soloArc = circ * soloRatio;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>🎯 단독골 vs 받아먹은 골</div>
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
          <div><span style={{ display: 'inline-block', width: 8, height: 8, background: C.accent, marginRight: 6 }}/>단독 {solo}골</div>
          <div><span style={{ display: 'inline-block', width: 8, height: 8, background: C.grayDarker, marginRight: 6 }}/>받아먹은 {assisted}골</div>
          <div style={{ marginTop: 4, fontSize: 10 }}>총 {total}골</div>
        </div>
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: C.accent, marginTop: 6, fontWeight: 600 }}>{caption}</div>
      )}
    </div>
  );
}

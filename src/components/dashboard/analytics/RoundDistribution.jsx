// src/components/dashboard/analytics/RoundDistribution.jsx
import { useMemo } from 'react';

export default function RoundDistribution({ data, player, ranking, C }) {
  const stats = useMemo(() => {
    if (!data || data.sampleCount === 0) return null;
    const rounds = Object.keys(data.meanByRound).map(Number).sort((a, b) => a - b);
    const maxR = rounds[rounds.length - 1];
    const minR = rounds[0];
    const maxV = Math.max(...rounds.map(r => data.meanByRound[r]));
    return { rounds, maxR, minR, maxV: maxV || 1 };
  }, [data]);

  const caption = useMemo(() => {
    if (!ranking) return null;
    const late = ranking.lateBloomers.findIndex(x => x.player === player);
    if (late >= 0) return `🏃 후반 폭격기 ${ranking.lateBloomers.length}명 중 ${late + 1}위`;
    const early = ranking.earlyBirds.findIndex(x => x.player === player);
    if (early >= 0) return `🎯 초반 강자 ${ranking.earlyBirds.length}명 중 ${early + 1}위`;
    return null;
  }, [ranking, player]);

  if (!stats) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        라운드 분포 데이터 없음 (골/어시 이벤트 없음)
      </div>
    );
  }

  const { rounds, maxR, minR, maxV } = stats;
  const W = 280, H = 120, padL = 24, padR = 8, padT = 8, padB = 18;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xOf = (r) => padL + (maxR === minR ? innerW / 2 : ((r - minR) / (maxR - minR)) * innerW);
  const yOf = (v) => padT + innerH - (v / maxV) * innerH;
  const barW = Math.max(8, innerW / Math.max(rounds.length * 1.5, 1));

  // tendency 표시: 0~1 percentile → 차트 가로축에 마커 위치
  const tendencyX = data.tendency != null ? padL + data.tendency * innerW : null;
  const tendencyPct = data.tendency != null ? Math.round(data.tendency * 100) : null;
  const tendencyLabel = data.tendency == null
    ? '—'
    : data.tendency > 0.5 ? `후반 ${tendencyPct}%`
    : data.tendency < 0.5 ? `초반 ${100 - tendencyPct}%`
    : '중립';

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>📊 라운드 분포</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke={C.grayDarker} strokeWidth={0.5} />
        {rounds.map(r => {
          const v = data.meanByRound[r];
          const x = xOf(r) - barW / 2;
          const y = yOf(v);
          return (
            <g key={r}>
              <rect x={x} y={y} width={barW} height={padT + innerH - y} fill={C.accent} fillOpacity={0.6} />
              <text x={xOf(r)} y={H - 4} textAnchor="middle" fill={C.gray} fontSize={9}>R{r}</text>
            </g>
          );
        })}
        {tendencyX != null && (
          <g>
            <line x1={tendencyX} y1={padT} x2={tendencyX} y2={padT + innerH} stroke={C.orange} strokeWidth={1.5} strokeDasharray="3 2" />
            <text x={tendencyX} y={padT - 1} textAnchor="middle" fill={C.orange} fontSize={9} fontWeight={700}>▼</text>
          </g>
        )}
      </svg>
      <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>
        골/어시 {data.eventCount ?? data.sampleCount}회 · 활동 라운드 {data.activeRoundCount ?? rounds.length}개 · 성향 {tendencyLabel}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontWeight: 600 }}>{caption}</div>
      )}
    </div>
  );
}

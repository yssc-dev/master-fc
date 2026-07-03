// src/components/dashboard/analytics/RoundDistribution.jsx
import { useMemo } from 'react';

export default function RoundDistribution({ data, player, ranking, threshold = 10, C }) {
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
    const suffix = ` (골+어시 ${threshold}회 이상)`;
    const late = ranking.lateBloomers.findIndex(x => x.player === player);
    if (late >= 0) return `🏃 후반 폭격기 ${ranking.lateBloomers.length}명 중 ${late + 1}위${suffix}`;
    const early = ranking.earlyBirds.findIndex(x => x.player === player);
    if (early >= 0) return `🎯 초반 강자 ${ranking.earlyBirds.length}명 중 ${early + 1}위${suffix}`;
    return null;
  }, [ranking, player, threshold]);

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

  // tendency는 세션 진행도(0~1) 평균 — 막대 x축(선수의 활동 라운드 범위)과 좌표계가 달라
  // 차트 위 마커 대신 별도 0~100% 게이지로 표시 (겹쳐 그리면 위치가 거짓말이 됨)
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
      </svg>
      {tendencyPct != null && (
        <div style={{ marginTop: 6 }}>
          <div style={{ position: 'relative', height: 14, borderRadius: 7, background: C.grayDarker, overflow: 'visible' }}>
            <div style={{
              position: 'absolute', top: -2, bottom: -2, left: `calc(${tendencyPct}% - 1.5px)`,
              width: 3, borderRadius: 2, background: C.orange,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.gray, marginTop: 2 }}>
            <span>세션 초반</span><span>중반</span><span>후반</span>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>
        골/어시 {data.eventCount ?? data.sampleCount}회 · 활동 라운드 {data.activeRoundCount ?? rounds.length}개 · 성향 {tendencyLabel}
      </div>
      <div style={{ fontSize: 9, color: C.gray, marginTop: 2, lineHeight: 1.5, opacity: 0.7 }}>
        막대 = 절대 횟수 · 성향 = 세션별 라운드 진행도(0~100%) 평균. 세션마다 총 라운드 수가 달라서 "마지막 R"이 아닌 "끝쯤"인지로 환산.
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontWeight: 600 }}>{caption}</div>
      )}
    </div>
  );
}

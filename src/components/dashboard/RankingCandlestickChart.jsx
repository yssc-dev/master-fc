import { useMemo } from 'react';

function buildCandlesticks(dates, rankings) {
  if (!dates || !rankings || rankings.length === 0) return [];

  const monthMap = {};
  dates.forEach((dateStr, i) => {
    if (rankings[i] == null) return;
    const month = dateStr.substring(0, 7);
    if (!monthMap[month]) monthMap[month] = [];
    monthMap[month].push(rankings[i]);
  });

  const sortedMonths = Object.keys(monthMap).sort();
  let prevClose = null;

  return sortedMonths.map(month => {
    const ranks = monthMap[month];
    const open = prevClose != null ? prevClose : ranks[0];
    const close = ranks[ranks.length - 1];
    const high = Math.min(...ranks);
    const low = Math.max(...ranks);
    prevClose = close;

    const m = parseInt(month.split('-')[1]);
    return { month, label: `${m}월`, open, close, high, low, improved: close < open };
  });
}

export default function RankingCandlestickChart({ playerName, rankingHistory, currentRank, C }) {
  const candles = useMemo(() => {
    if (!rankingHistory?.dates || !rankingHistory?.players?.[playerName]) return [];
    return buildCandlesticks(rankingHistory.dates, rankingHistory.players[playerName]);
  }, [rankingHistory, playerName]);

  if (candles.length === 0) {
    return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터가 부족합니다</div>;
  }

  // 차트 수치
  const W = 320, H = 200;
  const padTop = 25, padBottom = 25, padLeft = 28, padRight = 10;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  // Y축 범위 (랭킹 - 작을수록 상단)
  const allRanks = candles.flatMap(c => [c.open, c.close, c.high, c.low]);
  const minRank = Math.max(1, Math.min(...allRanks) - 1);
  const maxRank = Math.max(...allRanks) + 1;

  const yScale = (rank) => padTop + ((rank - minRank) / (maxRank - minRank || 1)) * chartH;
  const candleW = Math.min(20, (chartW / candles.length) * 0.6);
  const gap = chartW / candles.length;

  // Y축 눈금
  const yTicks = [];
  const step = Math.max(1, Math.ceil((maxRank - minRank) / 5));
  for (let r = Math.ceil(minRank); r <= maxRank; r += step) yTicks.push(r);

  const RED = "#ef4444", BLUE = "#3b82f6", GRAY = "#6b7280";

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.accent }}>{currentRank}</span>
        <span style={{ fontSize: 13, color: C.gray, marginLeft: 4 }}>위</span>
        {candles.length > 1 && (() => {
          const first = candles[0].open;
          const last = candles[candles.length - 1].close;
          const diff = first - last;
          if (diff === 0) return null;
          return (
            <span style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? RED : BLUE, marginLeft: 8 }}>
              {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
            </span>
          );
        })()}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* 배경 그리드 */}
        {yTicks.map(r => (
          <g key={r}>
            <line x1={padLeft} y1={yScale(r)} x2={W - padRight} y2={yScale(r)}
              stroke={C.grayDarker || "#333"} strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={padLeft - 4} y={yScale(r) + 3} textAnchor="end"
              fontSize={9} fill={C.gray || "#888"}>{r}</text>
          </g>
        ))}

        {/* 캔들 */}
        {candles.map((c, i) => {
          const cx = padLeft + gap * i + gap / 2;
          const color = c.close < c.open ? RED : c.close > c.open ? BLUE : GRAY;
          const bodyTop = Math.min(yScale(c.open), yScale(c.close));
          const bodyH = Math.max(2, Math.abs(yScale(c.open) - yScale(c.close)));

          return (
            <g key={c.month}>
              {/* 심지 (고가~저가) */}
              <line x1={cx} y1={yScale(c.high)} x2={cx} y2={yScale(c.low)}
                stroke={color} strokeWidth={1} />
              {/* 몸통 (시가~종가) */}
              <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                fill={color} rx={1} />
              {/* X축 라벨 */}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={9} fill={C.gray || "#888"}>
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 10, color: C.gray }}>
        <span><span style={{ color: RED }}>■</span> 상승</span>
        <span><span style={{ color: BLUE }}>■</span> 하락</span>
        <span>시가=전월종가 종가=월말랭킹</span>
      </div>
    </div>
  );
}

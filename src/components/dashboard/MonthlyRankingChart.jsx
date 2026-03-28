import { useState, useMemo } from 'react';

function buildAllPlayerCandles(dates, players, month) {
  if (!dates || !players) return [];

  const result = [];
  for (const [name, rankings] of Object.entries(players)) {
    const monthRanks = [];
    let prevClose = null;

    // 이전 월들의 종가 구하기
    const allMonths = new Set(dates.map(d => d.substring(0, 7)));
    const sortedMonths = [...allMonths].sort();
    const monthIdx = sortedMonths.indexOf(month);

    // 이전 월 종가 계산
    if (monthIdx > 0) {
      for (let i = 0; i < dates.length; i++) {
        if (rankings[i] == null) continue;
        const m = dates[i].substring(0, 7);
        if (m < month) prevClose = rankings[i];
      }
    }

    // 해당 월 데이터 수집
    for (let i = 0; i < dates.length; i++) {
      if (rankings[i] == null) continue;
      if (dates[i].substring(0, 7) === month) {
        monthRanks.push(rankings[i]);
      }
    }

    if (monthRanks.length === 0) continue;

    const open = prevClose != null ? prevClose : monthRanks[0];
    const close = monthRanks[monthRanks.length - 1];
    const high = Math.min(...monthRanks);
    const low = Math.max(...monthRanks);

    result.push({ name, open, close, high, low, improved: close < open });
  }

  // 종가(현재 랭킹) 순으로 정렬
  result.sort((a, b) => a.close - b.close);
  return result;
}

export default function MonthlyRankingChart({ rankingHistory, C }) {
  const months = useMemo(() => {
    if (!rankingHistory?.dates) return [];
    const set = new Set(rankingHistory.dates.map(d => d.substring(0, 7)));
    return [...set].filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  }, [rankingHistory]);

  const [selectedMonth, setSelectedMonth] = useState(() => months[months.length - 1] || "");

  const candles = useMemo(() => {
    if (!selectedMonth || !rankingHistory) return [];
    return buildAllPlayerCandles(rankingHistory.dates, rankingHistory.players, selectedMonth);
  }, [rankingHistory, selectedMonth]);

  if (months.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터 없음</div>;

  const monthLabel = (m) => `${parseInt(m.split('-')[1])}월`;

  // 상위 20명만 표시 (너무 많으면 읽기 어려움)
  const TOP_N = 20;
  const displayCandles = candles.slice(0, TOP_N);

  const W = 320, padTop = 10, padBottom = 25, padLeft = 58, padRight = 10;
  const rowH = 28;
  const H = padTop + displayCandles.length * rowH + padBottom;

  const allRanks = displayCandles.flatMap(c => [c.open, c.close, c.high, c.low]);
  const minRank = Math.max(1, Math.min(...allRanks) - 1);
  const maxRank = Math.max(...allRanks) + 1;
  const chartW = W - padLeft - padRight;

  // 1위가 우측(바깥), 낮은 순위가 좌측
  const xScale = (rank) => padLeft + chartW - ((rank - minRank) / (maxRank - minRank || 1)) * chartW;

  const RED = "#ef4444", BLUE = "#3b82f6", GRAY = "#6b7280";

  return (
    <div>
      {/* 월 선택 */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {months.map(m => (
          <button key={m} onClick={() => setSelectedMonth(m)}
            style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "none", background: m === selectedMonth ? C.accent : C.grayDarker,
              color: m === selectedMonth ? C.bg : C.gray,
            }}>
            {monthLabel(m)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 8, fontSize: 10, color: C.gray }}>
        <span><span style={{ color: RED }}>■</span> 상승</span>
        <span><span style={{ color: BLUE }}>■</span> 하락</span>
        <span>우=1위 좌=하위</span>
      </div>

      {/* 가로 캔들차트 (선수별) */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* X축 눈금 */}
        {(() => {
          const ticks = [];
          const step = Math.max(1, Math.ceil((maxRank - minRank) / 6));
          for (let r = Math.ceil(minRank); r <= maxRank; r += step) ticks.push(r);
          return ticks.map(r => (
            <g key={r}>
              <line x1={xScale(r)} y1={padTop} x2={xScale(r)} y2={H - padBottom}
                stroke={C.grayDarker || "#333"} strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={xScale(r)} y={H - 8} textAnchor="middle" fontSize={8} fill={C.gray}>{r}위</text>
            </g>
          ));
        })()}

        {/* 선수별 가로 캔들 */}
        {displayCandles.map((c, i) => {
          const cy = padTop + i * rowH + rowH / 2;
          const color = c.close < c.open ? RED : c.close > c.open ? BLUE : GRAY;
          const bodyLeft = Math.min(xScale(c.open), xScale(c.close));
          const bodyW = Math.max(3, Math.abs(xScale(c.open) - xScale(c.close)));
          const candleH = 14;

          return (
            <g key={c.name}>
              {/* 선수명 */}
              <text x={padLeft - 4} y={cy + 4} textAnchor="end" fontSize={9} fill={C.white} fontWeight={600}>
                {c.name}
              </text>
              {/* 심지 */}
              <line x1={xScale(c.high)} y1={cy} x2={xScale(c.low)} y2={cy}
                stroke={color} strokeWidth={1} />
              {/* 몸통 */}
              <rect x={bodyLeft} y={cy - candleH / 2} width={bodyW} height={candleH}
                fill={color} rx={2} />
              {/* 종가 숫자 - 캔들 우측 바깥 */}
              <text x={xScale(Math.min(c.open, c.close, c.high)) + 6} y={cy + 3}
                textAnchor="start" fontSize={9} fill={C.white} fontWeight={700}>
                {c.close}위
              </text>
            </g>
          );
        })}
      </svg>

      {candles.length > TOP_N && (
        <div style={{ textAlign: "center", fontSize: 10, color: C.gray, marginTop: 4 }}>
          상위 {TOP_N}명 표시 (전체 {candles.length}명)
        </div>
      )}

    </div>
  );
}

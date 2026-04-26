import { useMemo, useState } from 'react';
import { calcCrovaGogumaFreq } from '../../../utils/playerAnalyticsUtils';

export default function CrovaGogumaRankTab({ gameRecords, C }) {
  const [scope, setScope] = useState('all');

  const filtered = useMemo(() => {
    if (!gameRecords) return [];
    if (scope === 'all') return gameRecords;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const cutoffStr = cutoff.toISOString().substring(0, 10);
    return gameRecords.filter(gr => gr.gameDate && gr.gameDate >= cutoffStr);
  }, [gameRecords, scope]);

  const freq = useMemo(() => calcCrovaGogumaFreq(filtered), [filtered]);

  const crovaTop = useMemo(() =>
    Object.entries(freq.crova)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 5)
  , [freq]);

  const gogumaTop = useMemo(() =>
    Object.entries(freq.goguma)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 5)
  , [freq]);

  const toggleBtn = (val) => ({
    padding: "6px 14px", borderRadius: 50, fontSize: 11, fontWeight: 600,
    background: scope === val ? C.accent : "transparent",
    color: scope === val ? C.black : C.gray,
    border: `1px solid ${scope === val ? C.accent : C.grayDarker}`,
    cursor: "pointer",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}>
        <button onClick={() => setScope('all')} style={toggleBtn('all')}>전체 누적</button>
        <button onClick={() => setScope('recent3')} style={toggleBtn('recent3')}>최근 3개월</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <RankCard title="🍀 크로바" rows={crovaTop} color="#22c55e" C={C} />
        <RankCard title="🍠 고구마" rows={gogumaTop} color="#f97316" C={C} />
      </div>
    </div>
  );
}

function RankCard({ title, rows, color, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>-</div>
      ) : rows.map((r, i) => (
        <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.name}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.count}회</span>
        </div>
      ))}
    </div>
  );
}

import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TimePatternTab({ timeStats, C }) {
  const players = useMemo(() => {
    return Object.entries(timeStats)
      .filter(([, s]) => s.total >= 2)
      .map(([name, s]) => ({ name, ...s, earlyPct: Math.round((s.early / s.total) * 100), latePct: Math.round((s.late / s.total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [timeStats]);

  if (players.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터 부족</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>
        각 경기의 골을 시간순으로 전반/후반 절반으로 분류
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, fontSize: 10, color: C.gray }}>
        <span style={{ flex: 1 }}>선수</span>
        <span style={{ width: 30, textAlign: "center" }}>전반</span>
        <span style={{ flex: 2 }}>비율</span>
        <span style={{ width: 30, textAlign: "center" }}>후반</span>
        <span style={{ width: 30, textAlign: "center" }}>합계</span>
      </div>
      {players.map(p => (
        <div key={p.name} style={{ display: "flex", gap: 4, alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.white }}>{p.name}</span>
          <span style={{ width: 30, textAlign: "center", fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>{p.early}</span>
          <div style={{ flex: 2, display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: C.grayDarker }}>
            <div style={{ width: `${p.earlyPct}%`, background: "#3b82f6", borderRadius: "7px 0 0 7px", transition: "width 0.3s" }} />
            <div style={{ width: `${p.latePct}%`, background: "#f97316", borderRadius: "0 7px 7px 0", transition: "width 0.3s" }} />
          </div>
          <span style={{ width: 30, textAlign: "center", fontSize: 11, color: "#f97316", fontWeight: 700 }}>{p.late}</span>
          <span style={{ width: 30, textAlign: "center", fontSize: 11, color: C.gray }}>{p.total}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 10, color: C.gray }}>
        <span><span style={{ color: "#3b82f6" }}>■</span> 전반</span>
        <span><span style={{ color: "#f97316" }}>■</span> 후반</span>
      </div>
    </div>
  );
}

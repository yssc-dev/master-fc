import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { classifyTimeSlot } from '../../utils/playerAnalyticsUtils';

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
        당일 총 라운드의 전반/후반 기준 분류 · 태그는 총 5골 이상부터
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, fontSize: 10, color: C.gray }}>
        <span style={{ flex: 1 }}>선수</span>
        <span style={{ width: 70, textAlign: "center" }}>태그</span>
        <span style={{ width: 30, textAlign: "center" }}>전반</span>
        <span style={{ flex: 2 }}>비율</span>
        <span style={{ width: 30, textAlign: "center" }}>후반</span>
        <span style={{ width: 30, textAlign: "center" }}>합계</span>
      </div>
      {players.map(p => {
        const tag = classifyTimeSlot(p.early, p.late, p.total);
        return (
          <div key={p.name} style={{ display: "flex", gap: 4, alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.grayDarker}` }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.white }}>{p.name}</span>
            <span style={{ width: 70, textAlign: "center", fontSize: 10, fontWeight: 700, color: tag ? "#fbbf24" : C.gray }}>
              {tag ? `${tag.emoji} ${tag.label}` : "샘플부족"}
            </span>
            <span style={{ width: 30, textAlign: "center", fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>{p.early}</span>
            <div style={{ flex: 2, display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: C.grayDarker }}>
              <div style={{ width: `${p.earlyPct}%`, background: "#3b82f6", borderRadius: "7px 0 0 7px", transition: "width 0.3s" }} />
              <div style={{ width: `${p.latePct}%`, background: "#f97316", borderRadius: "0 7px 7px 0", transition: "width 0.3s" }} />
            </div>
            <span style={{ width: 30, textAlign: "center", fontSize: 11, color: "#f97316", fontWeight: 700 }}>{p.late}</span>
            <span style={{ width: 30, textAlign: "center", fontSize: 11, color: C.gray }}>{p.total}</span>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 10, color: C.gray }}>
        <span><span style={{ color: "#3b82f6" }}>■</span> 전반</span>
        <span><span style={{ color: "#f97316" }}>■</span> 후반</span>
      </div>
    </div>
  );
}

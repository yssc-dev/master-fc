import { useMemo } from 'react';

export default function CrovaGogumaRankTab({ members, C }) {
  const { crovaTop, gogumaTop } = useMemo(() => {
    const crovaMap = {}, gogumaMap = {};
    for (const p of members || []) {
      const name = p.name;
      if (!name) continue;
      const c = Number(p.crova) || 0;
      const g = Math.abs(Number(p.goguma) || 0); // 시트엔 음수로 저장 → 절대값
      if (c > 0) crovaMap[name] = c;
      if (g > 0) gogumaMap[name] = g;
    }
    const buildTop = (map) => {
      const arr = Object.entries(map)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
      let rank = 0, prevScore = null;
      const ranked = arr.map((row, i) => {
        if (row.score !== prevScore) { rank = i + 1; prevScore = row.score; }
        return { ...row, rank };
      });
      return ranked.filter(r => r.rank <= 5);
    };
    return { crovaTop: buildTop(crovaMap), gogumaTop: buildTop(gogumaMap) };
  }, [members]);

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 12, textAlign: "center" }}>
        대시보드 시트의 크로바/고구마 점수 누적 순위
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
      ) : rows.map((r) => (
        <div key={r.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
          <span style={{ color: C.white }}>{r.rank}. {r.name}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.score}점</span>
        </div>
      ))}
    </div>
  );
}

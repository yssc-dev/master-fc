import { useMemo } from 'react';
import { calcGoldenTrio } from '../../../utils/analyticsV2/calcGoldenTrio';

export default function GoldenTrioTab({ matchLogs, C }) {
  const trios = useMemo(() => calcGoldenTrio({ matchLogs: matchLogs || [], minRounds: 3, topN: 5 }), [matchLogs]);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }
  if (trios.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>조건을 만족하는 3인 조합이 없습니다. (최소 3경기 동행)</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>
        같은 팀으로 3경기 이상 뛴 3인 조합의 승률 TOP 5
      </div>
      {trios.map((t, i) => (
        <div key={t.members.join('|')} style={{ background: C.cardLight, borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>#{i + 1}</div>
            <div style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>
              {t.members.join(" + ")}
            </div>
            <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
              {t.games}경기 {t.wins}승 {t.draws}무 {t.losses}패
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>
            {Math.round(t.winRate * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}

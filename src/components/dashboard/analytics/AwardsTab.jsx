import { useMemo } from 'react';
import { calcAwards } from '../../../utils/analyticsV2/calcAwards';

export default function AwardsTab({ playerGameLogs, C }) {
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [] }), [playerGameLogs]);

  if (!playerGameLogs || playerGameLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>데이터가 없습니다.</div>;
  }

  return (
    <div>
      <AwardCard
        title="🔥 불꽃"
        subtitle="해트트릭 이상 (goals≥3 세션)"
        rows={awards.fireStarter}
        valueKey="count"
        suffix="회"
        C={C}
      />
      <AwardCard
        title="🛡️ 수호신"
        subtitle="세션 내 모든 GK경기(≥2경기) 무실점"
        rows={awards.guardian}
        valueKey="count"
        suffix="회"
        C={C}
      />
      <AwardCard
        title="😅 자책 랭킹"
        subtitle="가장 친절한 상대팀 조력자"
        rows={awards.owngoalKings}
        valueKey="total"
        suffix="골"
        C={C}
      />
    </div>
  );
}

function AwardCard({ title, subtitle, rows, valueKey, suffix, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title}</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 8 }}>{subtitle}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>아직 달성자가 없습니다.</div>
      ) : rows.map((r, i) => (
        <div key={r.player} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < rows.length - 1 ? `1px dashed ${C.grayDarker}` : "none", fontSize: 12 }}>
          <span style={{ color: C.white }}>{i + 1}. {r.player}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r[valueKey]}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

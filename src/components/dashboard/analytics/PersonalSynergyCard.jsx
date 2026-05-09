// 시너지 페어 통합 표 — 함께 뛴 모든 동료를 정렬 가능 테이블로 표시
// (a) 승률 = 함께 뛴 매치의 단순 승률 → "이 사람과 뛰면 이길 확률"
// (b) 케미 = 두 사람 평균 능력치 대비 함께 뛸 때 추가 효과 → "둘만의 호흡"
import { useState, useMemo } from 'react';

export default function PersonalSynergyCard({ data, C }) {
  const [sortKey, setSortKey] = useState('winRate'); // 'winRate' | 'liftSymmetric'
  const partners = data?.partners || [];

  const sorted = useMemo(() => {
    const arr = [...partners];
    arr.sort((a, b) => {
      // 표본부족은 항상 하단으로
      if (a.isLowSample !== b.isLowSample) return a.isLowSample ? 1 : -1;
      const dv = (b[sortKey] ?? 0) - (a[sortKey] ?? 0);
      if (dv !== 0) return dv;
      return b.games - a.games;
    });
    return arr;
  }, [partners, sortKey]);

  if (partners.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        함께 뛴 동료 없음
      </div>
    );
  }

  const Tab = ({ k, label }) => (
    <button
      onClick={() => setSortKey(k)}
      style={{
        padding: '6px 12px', fontSize: 11, fontWeight: 600,
        background: sortKey === k ? C.cardLight : 'transparent',
        color: sortKey === k ? C.white : C.gray,
        border: `1px solid ${sortKey === k ? C.gray : C.grayDarker}`,
        borderRadius: 50, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{label}</button>
  );

  const liftColor = (lift) => {
    if (lift > 0.05) return C.green || '#22c55e';
    if (lift < -0.05) return C.red || '#ef4444';
    return C.gray;
  };
  const winColor = (wr) => {
    if (wr >= 0.6) return C.green || '#22c55e';
    if (wr < 0.4) return C.red || '#ef4444';
    return C.white;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>🤝 나의 짝꿍 ({partners.length}명)</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Tab k="winRate" label="승률순" />
          <Tab k="liftSymmetric" label="케미순" />
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.gray, lineHeight: 1.6, marginBottom: 8 }}>
        <b>승률</b> 함께 뛴 매치의 팀 승률 · <b>케미</b> 두 사람 평균 대비 함께 뛸 때 추가 효과
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.grayDarker}` }}>
            <th style={{ textAlign: 'left', padding: '6px 4px', color: C.gray, fontWeight: 600 }}>동료</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', color: C.gray, fontWeight: 600, width: 50 }}>함께</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', color: sortKey === 'winRate' ? C.white : C.gray, fontWeight: 600, width: 60 }}>승률</th>
            <th style={{ textAlign: 'right', padding: '6px 4px', color: sortKey === 'liftSymmetric' ? C.white : C.gray, fontWeight: 600, width: 60 }}>케미</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const dim = p.isLowSample;
            const liftStr = `${p.liftSymmetric >= 0 ? '+' : ''}${(p.liftSymmetric * 100).toFixed(1)}`;
            return (
              <tr key={p.partner} style={{ borderBottom: `1px dashed ${C.grayDarker}`, opacity: dim ? 0.45 : 1 }}>
                <td style={{ padding: '6px 4px', color: C.white, fontWeight: 480 }}>
                  {p.partner}
                  {dim && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 50, border: `1px dashed ${C.gray}`, color: C.gray }}>표본부족</span>}
                </td>
                <td style={{ padding: '6px 4px', color: C.gray, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.games}</td>
                <td style={{ padding: '6px 4px', color: dim ? C.gray : winColor(p.winRate), textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(p.winRate * 100)}%</td>
                <td style={{ padding: '6px 4px', color: dim ? C.gray : liftColor(p.liftSymmetric), textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{liftStr}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

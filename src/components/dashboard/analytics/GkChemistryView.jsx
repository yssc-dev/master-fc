// src/components/dashboard/analytics/GkChemistryView.jsx
import { useState, useMemo } from 'react';

export default function GkChemistryView({ chem, C }) {
  const [selected, setSelected] = useState(null);
  const gks = chem?.gks || [];
  const activeGk = selected || gks[0] || null;
  const data = useMemo(() => activeGk ? chem.byGk[activeGk] : null, [chem, activeGk]);

  if (gks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        GK 케미 데이터 없음
      </div>
    );
  }

  const Row = ({ p, sign }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
      <span style={{ color: C.gray }}>{p.field}</span>
      <span style={{ color: sign === 'best' ? C.green : C.red, fontWeight: 600 }}>
        {Math.round(p.cleanRate * 100)}% · {p.cleanSheets}/{p.rounds}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        GK가 X일 때 같은 팀이었던 필드 멤버별 무실점률. 그날 같은 팀 로스터 기준 근사 (라운드별 5인 출전 미입력).
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {gks.map(g => (
          <button key={g} onClick={() => setSelected(g)} style={{
            padding: '4px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: g === activeGk ? C.accent : 'transparent',
            color: g === activeGk ? C.black : C.gray,
            border: `1px solid ${g === activeGk ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{g}</button>
        ))}
      </div>
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST 무실점</div>
            {data.pairs.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (페어당 5라운드 이상 필요)</div>
            ) : data.pairs.slice(0, 5).map(p => <Row key={p.field} p={p} sign="best" />)}
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
            {data.worst.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
            ) : data.worst.slice(0, 5).map(p => <Row key={p.field} p={p} sign="worst" />)}
          </div>
        </div>
      )}
    </div>
  );
}

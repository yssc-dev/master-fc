// src/components/dashboard/analytics/AssistPairList.jsx
export default function AssistPairList({ pairs, C }) {
  if (!pairs || pairs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        어시 페어 데이터 없음 (페어당 누적 3회 이상 필요)
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은 페어가 반복적으로 만든 골. 페어당 누적 ≥ 3회.
      </div>
      {pairs.map((p, i) => (
        <div key={`${p.assister}|${p.scorer}`} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', borderBottom: `1px dashed ${C.grayDarker}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: C.gray, width: 22, textAlign: 'right' }}>#{i + 1}</span>
            <span style={{ fontSize: 13, color: C.gray, fontWeight: 600 }}>
              {p.assister} <span style={{ color: C.accent }}>→</span> {p.scorer}
            </span>
          </div>
          <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{p.count}회</span>
        </div>
      ))}
    </div>
  );
}

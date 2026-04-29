// src/components/dashboard/analytics/PersonalSynergyCard.jsx
export default function PersonalSynergyCard({ data, C }) {
  if (!data || (data.best.length === 0 && data.worst.length === 0)) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>
        함께 뛴 페어 표본 부족
      </div>
    );
  }

  const Row = ({ p, sign }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
      <span style={{ color: C.gray }}>{p.partner}</span>
      <span style={{ color: sign === 'best' ? C.green : C.red, fontWeight: 600 }}>
        {Math.round(p.winRate * 100)}% · {p.games}경기
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>🤝 나의 짝꿍</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST</div>
          {data.best.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : data.best.map(p => <Row key={p.partner} p={p} sign="best" />)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
          {data.worst.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : data.worst.map(p => <Row key={p.partner} p={p} sign="worst" />)}
        </div>
      </div>
    </div>
  );
}

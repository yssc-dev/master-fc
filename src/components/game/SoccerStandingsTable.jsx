import { useTheme } from '../../hooks/useTheme';

// 축구 상대별 전적 표(우리팀 기준) + 합계 행 — 모달/마감화면 공용
export default function SoccerStandingsTable({ records, total, styles: s }) {
  const { C } = useTheme();
  const gdCell = (gd) => (
    <td style={{ ...s.td(true), color: gd > 0 ? C.green : gd < 0 ? C.red : C.white }}>{gd > 0 ? `+${gd}` : gd}</td>
  );
  const cols = ["상대", "경기", "승", "무", "패", "득", "실", "득실"];

  if (!records || records.length === 0) {
    return <div style={{ fontSize: 13, color: C.gray, textAlign: "center", padding: 20 }}>확정된 경기가 없습니다.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
        <thead><tr>{cols.map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {records.map(r => (
            <tr key={r.opponent}>
              <td style={s.td(true)}>{r.opponent}</td>
              <td style={s.td()}>{r.played}</td>
              <td style={{ ...s.td(r.wins > 0), ...(r.wins > 0 && { color: C.green }) }}>{r.wins}</td>
              <td style={s.td()}>{r.draws}</td>
              <td style={{ ...s.td(r.losses > 0), ...(r.losses > 0 && { color: C.red }) }}>{r.losses}</td>
              <td style={s.td()}>{r.gf}</td>
              <td style={s.td()}>{r.ga}</td>
              {gdCell(r.gf - r.ga)}
            </tr>
          ))}
          {total && total.played > 0 && (
            <tr style={{ borderTop: `2px solid ${C.grayDark}` }}>
              <td style={{ ...s.td(true), fontWeight: 800 }}>합계</td>
              <td style={{ ...s.td(true), fontWeight: 800 }}>{total.played}</td>
              <td style={{ ...s.td(true), fontWeight: 800, color: C.green }}>{total.wins}</td>
              <td style={{ ...s.td(true), fontWeight: 800 }}>{total.draws}</td>
              <td style={{ ...s.td(true), fontWeight: 800, color: C.red }}>{total.losses}</td>
              <td style={{ ...s.td(true), fontWeight: 800 }}>{total.gf}</td>
              <td style={{ ...s.td(true), fontWeight: 800 }}>{total.ga}</td>
              {gdCell(total.gf - total.ga)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

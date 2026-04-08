import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';

export default function TournamentPlayerRecords({ tournamentId }) {
  const { C } = useTheme();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("point");

  useEffect(() => {
    AppSync.getTournamentPlayerRecords(tournamentId).then(p => setPlayers(p)).finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>;
  if (players.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>선수 기록이 없습니다</div>;

  const sorted = [...players].sort((a, b) => {
    if (sortKey === "point") return b.point - a.point || b.goals - a.goals;
    if (sortKey === "goals") return b.goals - a.goals;
    if (sortKey === "assists") return b.assists - a.assists;
    return b.point - a.point;
  });

  const th = { padding: "6px 3px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.grayDarker}`, fontWeight: 600, fontSize: 10, cursor: "pointer" };
  const td = (hl) => ({ padding: "6px 3px", textAlign: "center", borderBottom: `1px solid ${C.grayDarker}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 11 });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 8 }}>개인 기록</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>선수</th><th style={th}>경기</th>
          <th style={{ ...th, color: sortKey === "goals" ? C.accent : C.gray }} onClick={() => setSortKey("goals")}>골</th>
          <th style={{ ...th, color: sortKey === "assists" ? C.accent : C.gray }} onClick={() => setSortKey("assists")}>어시</th>
          <th style={th}>CS</th><th style={th}>자책</th>
          <th style={{ ...th, color: sortKey === "point" ? C.accent : C.gray }} onClick={() => setSortKey("point")}>포인트</th>
        </tr></thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.name}>
              <td style={{ ...td(true), textAlign: "left" }}>{i < 3 && p.point > 0 ? ["🥇","🥈","🥉"][i] + " " : ""}{p.name}</td>
              <td style={td()}>{p.games}</td>
              <td style={td(p.goals > 0)}>{p.goals}</td>
              <td style={td(p.assists > 0)}>{p.assists}</td>
              <td style={td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
              <td style={{ ...td(p.owngoals > 0), color: p.owngoals > 0 ? "#ef4444" : C.gray }}>{p.owngoals}</td>
              <td style={{ ...td(true), fontSize: 13, fontWeight: 800 }}>{p.point}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

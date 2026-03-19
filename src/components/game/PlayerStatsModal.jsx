import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

export default function PlayerStatsModal({ attendees, calcPlayerPoints, onClose, styles: s }) {
  const { C } = useTheme();
  const [sortKey, setSortKey] = useState("total");

  const cols = ["선수", "골", "어시", "자책", "클린", "실점", "🍀", "🍠", "합계"];
  const colKeys = ["name", "goals", "assists", "owngoals", "cleanSheets", "conceded", "crova", "goguma", "total"];

  const rows = attendees.map(p => {
    const pts = calcPlayerPoints(p);
    return { name: p, ...pts };
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
    return (b[sortKey] || 0) - (a[sortKey] || 0);
  });

  return (
    <Modal onClose={onClose} title="오늘의 선수기록" maxWidth={500}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{cols.map((h, ci) => <th key={h} style={{ ...s.th, cursor: "pointer", color: sortKey === colKeys[ci] ? C.accent : C.gray }} onClick={(e) => { e.stopPropagation(); setSortKey(colKeys[ci]); }}>{h}{sortKey === colKeys[ci] ? " ▼" : ""}</th>)}</tr></thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.name}>
              <td style={s.td(true)}>{p.name}</td>
              <td style={s.td(p.goals > 0)}>{p.goals}</td>
              <td style={s.td(p.assists > 0)}>{p.assists}</td>
              <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals > 0 ? `-${p.owngoals}` : 0}</td>
              <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
              <td style={s.td()}>{p.conceded}</td>
              <td style={{ ...s.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>
              <td style={{ ...s.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>
              <td style={{ ...s.td(true), fontSize: 13, fontWeight: 800, color: p.total > 0 ? C.green : p.total < 0 ? C.red : C.white }}>{p.total > 0 ? `+${p.total}` : p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TournamentSchedule({ schedule, ourTeamName, onUpdateScore }) {
  const { C } = useTheme();
  const [editingMatch, setEditingMatch] = useState(null);
  const [editHome, setEditHome] = useState("");
  const [editAway, setEditAway] = useState("");

  const startEdit = (m) => { setEditingMatch(m.matchNum); setEditHome(m.homeScore !== null ? String(m.homeScore) : ""); setEditAway(m.awayScore !== null ? String(m.awayScore) : ""); };
  const saveScore = (matchNum) => {
    const h = parseInt(editHome), a = parseInt(editAway);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { alert("올바른 스코어를 입력하세요."); return; }
    onUpdateScore(matchNum, h, a);
    setEditingMatch(null);
  };

  const grouped = {};
  schedule.forEach(m => { const key = m.date || "미정"; if (!grouped[key]) grouped[key] = []; grouped[key].push(m); });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 10 }}>경기 일정</div>
      {Object.entries(grouped).map(([date, matches]) => (
        <div key={date} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, marginBottom: 4, padding: "4px 0", borderBottom: `1px solid ${C.grayDarker}` }}>{date}</div>
          {matches.map(m => {
            const isOurs = m.home === ourTeamName || m.away === ourTeamName;
            const isFinished = m.homeScore !== null && m.awayScore !== null;
            const isEditing = editingMatch === m.matchNum;
            return (
              <div key={m.matchNum} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 3, background: isOurs ? `${C.accent}11` : C.cardLight, borderRadius: 8, borderLeft: isOurs ? `3px solid ${C.accent}` : "3px solid transparent" }}>
                <span style={{ fontSize: 10, color: C.grayDark, minWidth: 30 }}>{m.round}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: isOurs ? 700 : 400, color: C.white, textAlign: "right" }}>{m.home || "미정"}</span>
                {isEditing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 100, justifyContent: "center" }}>
                    <input value={editHome} onChange={e => setEditHome(e.target.value)} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                    <span style={{ color: C.gray }}>:</span>
                    <input value={editAway} onChange={e => setEditAway(e.target.value)} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                    <button onClick={() => saveScore(m.matchNum)} style={{ padding: "2px 6px", borderRadius: 4, background: C.green, color: C.bg, border: "none", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>OK</button>
                  </div>
                ) : (
                  <div onClick={() => !isOurs && startEdit(m)} style={{ minWidth: 60, textAlign: "center", cursor: isOurs ? "default" : "pointer" }}>
                    {isFinished ? <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{m.homeScore} : {m.awayScore}</span>
                      : <span style={{ fontSize: 11, color: C.grayDark }}>{isOurs ? "경기관리" : "스코어 입력"}</span>}
                  </div>
                )}
                <span style={{ flex: 1, fontSize: 12, fontWeight: isOurs ? 700 : 400, color: C.white }}>{m.away || "미정"}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function TournamentSchedule({ schedule, ourTeamName, teams, onUpdateScore, onUpdateMatch, isAdmin, defaultDate }) {
  const { C } = useTheme();
  const [editingMatch, setEditingMatch] = useState(null);
  const [editData, setEditData] = useState({});
  const [showAll, setShowAll] = useState(false);

  const startEdit = (m) => {
    setEditingMatch(m.matchNum);
    setEditData({
      date: m.date || defaultDate || new Date().toISOString().slice(0, 10), home: m.home || "", away: m.away || "",
      homeScore: m.homeScore !== null ? String(m.homeScore) : "",
      awayScore: m.awayScore !== null ? String(m.awayScore) : "",
    });
  };

  const saveEdit = async (matchNum) => {
    const updates = {};
    const orig = schedule.find(m => m.matchNum === matchNum);
    if (editData.date !== (orig.date || "")) updates.date = editData.date;
    if (editData.home !== (orig.home || "")) updates.home = editData.home;
    if (editData.away !== (orig.away || "")) updates.away = editData.away;

    // 스코어 변경
    const h = editData.homeScore !== "" ? parseInt(editData.homeScore) : null;
    const a = editData.awayScore !== "" ? parseInt(editData.awayScore) : null;
    const hasScore = h !== null && a !== null && !isNaN(h) && !isNaN(a);

    if (Object.keys(updates).length > 0 && onUpdateMatch) {
      updates.ourTeam = ourTeamName;
      await onUpdateMatch(matchNum, updates);
    }
    if (hasScore && (h !== orig.homeScore || a !== orig.awayScore)) {
      await onUpdateScore(matchNum, h, a);
    }
    setEditingMatch(null);
  };

  // 우리팀 경기만 표시
  const ourSchedule = schedule.filter(m => m.isOurs);

  // 다음 경기 찾기 (미완료 중 첫 번째)
  const nextMatch = ourSchedule.find(m => m.status !== "finished");
  // 최근 결과 (완료된 경기 중 마지막)
  const lastResult = [...ourSchedule].reverse().find(m => m.status === "finished");

  // 표시할 경기: 축소 모드에서는 최근결과 + 다음경기만
  const displaySchedule = showAll ? ourSchedule : ourSchedule.filter(m =>
    (lastResult && m.matchNum === lastResult.matchNum) || (nextMatch && m.matchNum === nextMatch.matchNum)
  );

  const grouped = {};
  displaySchedule.forEach(m => { const key = m.date || "미정"; if (!grouped[key]) grouped[key] = []; grouped[key].push(m); });
  // 날짜순 정렬
  const sortedEntries = Object.entries(grouped).sort((a, b) => {
    if (a[0] === "미정") return 1;
    if (b[0] === "미정") return -1;
    return a[0].localeCompare(b[0]);
  });

  const is = { input: { padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, fontSize: 12 } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>경기 일정</div>
        <button onClick={() => setShowAll(!showAll)}
          style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, cursor: "pointer", background: showAll ? C.accent : C.grayDarker, color: showAll ? C.bg : C.grayLight }}>
          {showAll ? "간략히" : `전체 일정 (${ourSchedule.length})`}
        </button>
      </div>
      {sortedEntries.map(([date, matches]) => (
        <div key={date} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, marginBottom: 4, padding: "4px 0", borderBottom: `1px solid ${C.grayDarker}` }}>{date}</div>
          {matches.map(m => {
            const isOurs = m.home === ourTeamName || m.away === ourTeamName;
            const isFinished = m.homeScore !== null && m.awayScore !== null;
            const isEditing = editingMatch === m.matchNum;

            if (isEditing && isAdmin) {
              return (
                <div key={m.matchNum} style={{ padding: "10px", background: C.card, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.accent}` }}>
                  <div style={{ fontSize: 11, color: C.gray, marginBottom: 6 }}>제{m.matchNum}경기 편집</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.gray, minWidth: 30 }}>날짜</span>
                    <input type="date" value={editData.date} onChange={e => setEditData(p => ({ ...p, date: e.target.value }))} style={{ ...is.input, flex: 1 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <select value={editData.home} onChange={e => setEditData(p => ({ ...p, home: e.target.value }))} style={{ ...is.input, flex: 1 }}>
                      <option value="">홈팀 선택</option>
                      {(teams || []).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span style={{ color: C.gray, fontSize: 12 }}>vs</span>
                    <select value={editData.away} onChange={e => setEditData(p => ({ ...p, away: e.target.value }))} style={{ ...is.input, flex: 1 }}>
                      <option value="">원정팀 선택</option>
                      {(teams || []).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {!isOurs && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.gray, minWidth: 30 }}>스코어</span>
                      <input value={editData.homeScore} onChange={e => setEditData(p => ({ ...p, homeScore: e.target.value }))} placeholder="-" style={{ ...is.input, width: 40, textAlign: "center" }} />
                      <span style={{ color: C.gray }}>:</span>
                      <input value={editData.awayScore} onChange={e => setEditData(p => ({ ...p, awayScore: e.target.value }))} placeholder="-" style={{ ...is.input, width: 40, textAlign: "center" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => saveEdit(m.matchNum)} style={{ flex: 1, padding: "6px 0", borderRadius: 6, background: C.green, color: C.bg, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>저장</button>
                    <button onClick={() => setEditingMatch(null)} style={{ flex: 1, padding: "6px 0", borderRadius: 6, background: C.grayDark, color: C.grayLight, border: "none", fontSize: 12, cursor: "pointer" }}>취소</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.matchNum} onClick={() => isAdmin && startEdit(m)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 3, background: isOurs ? `${C.accent}11` : C.cardLight, borderRadius: 8, borderLeft: isOurs ? `3px solid ${C.accent}` : "3px solid transparent", cursor: isAdmin ? "pointer" : "default" }}>
                <span style={{ fontSize: 10, color: C.grayDark, minWidth: 20 }}>#{m.matchNum}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: isOurs ? 700 : 400, color: C.white, textAlign: "right" }}>{m.home || "미정"}</span>
                <div style={{ minWidth: 50, textAlign: "center" }}>
                  {isFinished ? <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{m.homeScore}:{m.awayScore}</span>
                    : <span style={{ fontSize: 11, color: C.grayDark }}>vs</span>}
                </div>
                <span style={{ flex: 1, fontSize: 12, fontWeight: isOurs ? 700 : 400, color: C.white }}>{m.away || "미정"}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

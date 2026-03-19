import { useState } from 'react';
import { C, TEAM_COLORS } from '../../config/constants';
import CourtRecorder from './CourtRecorder';

export default function FreeMatchView({ teams, teamNames, teamColorIndices, gks, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinishMatch, completedMatches, attendees, onGkChange, styles: s, isExtraRound }) {
  const [courtMatches, setCourtMatches] = useState({});
  const [activeCourtTab, setActiveCourtTab] = useState(0);
  const [settingCourt, setSettingCourt] = useState(null);
  const [selection, setSelection] = useState({ home: null, away: null });

  const courtCount2 = courtCount === 2;
  const courts = courtCount2 ? [0, 1] : [0];

  const courtHasMatch = (ci) => courtMatches[ci] && courtMatches[ci].home !== null && courtMatches[ci].away !== null;

  const getMatchInfo = (ci) => {
    const cm = courtMatches[ci];
    if (!cm || cm.home === null || cm.away === null) return null;
    return {
      homeIdx: cm.home, awayIdx: cm.away,
      matchId: `F${completedMatches.length + ci + 1}_C${ci}`,
      homeTeam: teamNames[cm.home], awayTeam: teamNames[cm.away],
      homeGk: gks[cm.home] || null, awayGk: gks[cm.away] || null,
      homeColor: TEAM_COLORS[teamColorIndices[cm.home]],
      awayColor: TEAM_COLORS[teamColorIndices[cm.away]],
      homePlayers: teams[cm.home],
      awayPlayers: teams[cm.away],
    };
  };

  const activeMatchInfo = getMatchInfo(activeCourtTab);

  const handleSetCourt = () => {
    if (selection.home === null || selection.away === null || selection.home === selection.away) return;
    setCourtMatches(prev => ({ ...prev, [settingCourt]: { home: selection.home, away: selection.away } }));
    setSelection({ home: null, away: null });
    setSettingCourt(null);
  };

  const handleConfirmRound = () => {
    const results = [];
    for (const ci of courts) {
      const mi = getMatchInfo(ci);
      if (!mi) continue;
      const evts = allEvents.filter(e => e.matchId === mi.matchId);
      const homeScore = evts.filter(e => e.scoringTeam === mi.homeTeam).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
      const awayScore = evts.filter(e => e.scoringTeam === mi.awayTeam).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
      results.push({ ...mi, homeScore, awayScore, court: courtCount2 ? (ci === 0 ? "A구장" : "B구장") : "", mercenaries: [] });
    }
    if (results.length === 0) { alert("진행 중인 경기가 없습니다"); return; }
    const msg = results.map(r => `${r.court ? r.court + ": " : ""}${r.homeTeam} ${r.homeScore}:${r.awayScore} ${r.awayTeam}`).join("\n");
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;
    results.forEach(r => onFinishMatch(r));
    setCourtMatches({});
  };

  if (settingCourt !== null) {
    return (
      <div>
        <div style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>{courtCount2 ? (settingCourt === 0 ? "A구장" : "B구장") : ""} 대진 선택</div>
        <div style={s.card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>홈팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setSelection(prev => ({ ...prev, home: idx }))}
                  style={{ ...s.matchBtn(selection.home === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: selection.away === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", color: C.gray, fontSize: 18, fontWeight: 900 }}>VS</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6, textAlign: "center" }}>원정팀</div>
              {teamNames.map((name, idx) => (
                <button key={idx} onClick={() => setSelection(prev => ({ ...prev, away: idx }))}
                  style={{ ...s.matchBtn(selection.away === idx ? TEAM_COLORS[teamColorIndices[idx]] : null), width: "100%", marginBottom: 4, opacity: selection.home === idx ? 0.3 : 1 }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { setSettingCourt(null); setSelection({ home: null, away: null }); }} style={s.btn(C.grayDark)}>취소</button>
            <button onClick={handleSetCourt}
              disabled={selection.home === null || selection.away === null || selection.home === selection.away}
              style={{ ...s.btnFull(C.green), flex: 1, opacity: (selection.home !== null && selection.away !== null && selection.home !== selection.away) ? 1 : 0.4 }}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {courtCount2 && (
        <div style={s.tabRow}>
          {courts.map(ci => {
            const mi = getMatchInfo(ci);
            return (
              <button key={ci} onClick={() => setActiveCourtTab(ci)}
                style={{ ...s.tab(activeCourtTab === ci), fontSize: 11, padding: "8px 4px" }}>
                <div>{ci === 0 ? "A구장" : "B구장"}</div>
                {mi && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>{mi.homeTeam} vs {mi.awayTeam}</div>}
                {!mi && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.5 }}>미설정</div>}
              </button>
            );
          })}
        </div>
      )}

      {!courtHasMatch(activeCourtTab) ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ color: C.gray, marginBottom: 12 }}>{courtCount2 ? (activeCourtTab === 0 ? "A구장" : "B구장") : ""} 대진을 설정하세요</div>
          <button onClick={() => setSettingCourt(activeCourtTab)} style={s.btn(C.accent, C.bg)}>대진 설정</button>
        </div>
      ) : (
        <div>
          <CourtRecorder
            key={`free_${activeCourtTab}_${courtMatches[activeCourtTab]?.home}_${courtMatches[activeCourtTab]?.away}`}
            matchInfo={activeMatchInfo}
            homePlayers={activeMatchInfo.homePlayers}
            awayPlayers={activeMatchInfo.awayPlayers}
            allEvents={allEvents} onRecordEvent={onRecordEvent} onUndoEvent={onUndoEvent}
            onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent}
            onFinish={() => { }} onGkChange={onGkChange} styles={s}
            courtLabel={courtCount2 ? (activeCourtTab === 0 ? "A구장" : "B구장") : ""}
            attendees={attendees}
          />
        </div>
      )}

      {courts.some(ci => courtHasMatch(ci)) && (
        <div style={{ marginTop: 12 }}>
          <button onClick={handleConfirmRound} style={{ ...s.btnFull(C.accent, C.bg) }}>경기 종료 확정</button>
        </div>
      )}
    </div>
  );
}

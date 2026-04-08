import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import LineupSelector from '../game/LineupSelector';
import SoccerRecorder from '../game/SoccerRecorder';
import { calcSoccerScore, buildEventLogRows } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import AppSync from '../../services/appSync';

export default function TournamentMatchManager({ tournament, schedule, ourTeamName, attendees, gameSettings, onScheduleUpdate }) {
  const { C } = useTheme();
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [phase, setPhase] = useState("list");
  const [currentMatch, setCurrentMatch] = useState(null);
  const [scoreEdit, setScoreEdit] = useState(null);

  const ourMatches = schedule.filter(m => m.isOurs && m.status !== "finished");
  const otherMatches = schedule.filter(m => !m.isOurs && m.status !== "finished");

  const handleLineupConfirm = ({ lineup, gk, defenders }) => {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    setCurrentMatch({ matchIdx: 0, opponent, lineup, gk, defenders, events: [], startedAt: Date.now(), ourScore: 0, opponentScore: 0, status: "playing" });
    setPhase("playing");
  };

  const handleAddEvent = (event) => {
    setCurrentMatch(prev => {
      const events = [...prev.events, { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() }];
      let ourScore = 0, opponentScore = 0;
      for (const ev of events) { if (ev.type === "goal") ourScore++; else if (ev.type === "owngoal" || ev.type === "opponentGoal") opponentScore++; }
      return { ...prev, events, ourScore, opponentScore };
    });
  };

  const handleDeleteEvent = (eventId) => {
    setCurrentMatch(prev => {
      const events = prev.events.filter(e => e.id !== eventId);
      let ourScore = 0, opponentScore = 0;
      for (const ev of events) { if (ev.type === "goal") ourScore++; else if (ev.type === "owngoal" || ev.type === "opponentGoal") opponentScore++; }
      return { ...prev, events, ourScore, opponentScore };
    });
  };

  const handleFinishMatch = async () => {
    const { ourScore, opponentScore } = calcSoccerScore(currentMatch.events);
    const isHome = selectedMatch.home === ourTeamName;
    const homeScore = isHome ? ourScore : opponentScore;
    const awayScore = isHome ? opponentScore : ourScore;

    await AppSync.updateTournamentMatchScore(tournament.id, selectedMatch.matchNum, homeScore, awayScore);

    const finished = [{ ...currentMatch, status: "finished", matchIdx: selectedMatch.matchNum - 1 }];
    const eventRows = buildEventLogRows(finished, tournament.startDate || new Date().toISOString().slice(0, 10));
    await AppSync.writeTournamentEventLog(tournament.id, { events: eventRows });

    // 선수기록 재집계
    const allEvents = await AppSync.getTournamentEventLog(tournament.id);
    const pStats = {};
    const ensure = (n) => { if (!pStats[n]) pStats[n] = { name: n, games: 0, fieldGames: 0, keeperGames: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, owngoals: 0, point: 0 }; };
    for (const e of allEvents) {
      if (e.event === "출전") { ensure(e.player); pStats[e.player].games++; if (e.position === "GK") pStats[e.player].keeperGames++; else pStats[e.player].fieldGames++; }
      if (e.event === "골") { ensure(e.player); pStats[e.player].goals++; if (e.relatedPlayer) { ensure(e.relatedPlayer); pStats[e.relatedPlayer].assists++; } }
      if (e.event === "자책골") { ensure(e.player); pStats[e.player].owngoals++; }
      if (e.event === "실점" && e.player) { ensure(e.player); pStats[e.player].conceded++; }
      if (e.event === "교체") { ensure(e.player); pStats[e.player].games++; if (e.position === "GK") pStats[e.player].keeperGames++; else pStats[e.player].fieldGames++; }
    }
    Object.values(pStats).forEach(p => { p.point = p.goals + p.assists + (p.owngoals * (gameSettings?.ownGoalPoint ?? -1)) + (p.cleanSheets * (gameSettings?.cleanSheetPoint ?? 1)); });
    await AppSync.writeTournamentPlayerRecord(tournament.id, { players: Object.values(pStats) });

    onScheduleUpdate();
    setPhase("finished");
  };

  const handleOtherScore = async (matchNum, home, away) => {
    await AppSync.updateTournamentMatchScore(tournament.id, matchNum, home, away);
    onScheduleUpdate();
    setScoreEdit(null);
  };

  if (phase === "playing" && currentMatch) {
    return (
      <div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>제{selectedMatch.matchNum}경기 · {selectedMatch.round}</div>
        <SoccerRecorder match={currentMatch} attendees={attendees} onAddEvent={handleAddEvent} onDeleteEvent={handleDeleteEvent} onFinishMatch={handleFinishMatch} styles={{ card: { background: C.card, borderRadius: 12, padding: 14 } }} />
      </div>
    );
  }

  if (phase === "lineup" && selectedMatch) {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    return (
      <div>
        <button onClick={() => setPhase("list")} style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 돌아가기</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 12 }}>vs {opponent} — 라인업</div>
        <LineupSelector attendees={attendees} onConfirm={handleLineupConfirm} styles={{}} />
      </div>
    );
  }

  if (phase === "finished") {
    return (
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.green, marginBottom: 8 }}>경기 기록 완료</div>
        <button onClick={() => { setPhase("list"); setSelectedMatch(null); setCurrentMatch(null); }}
          style={{ padding: "10px 24px", borderRadius: 10, background: C.accent, color: C.bg, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>돌아가기</button>
      </div>
    );
  }

  return (
    <div>
      {ourMatches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 6 }}>우리팀 경기 (미완료)</div>
          {ourMatches.map(m => {
            const opponent = m.home === ourTeamName ? m.away : m.home;
            return (
              <div key={m.matchNum} onClick={() => { setSelectedMatch(m); setPhase("lineup"); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: `${C.accent}11`, borderRadius: 10, marginBottom: 6, cursor: "pointer", borderLeft: `3px solid ${C.accent}` }}>
                <div>
                  <div style={{ fontSize: 11, color: C.gray }}>제{m.matchNum}경기 · {m.date || "미정"}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.white, marginTop: 2 }}>vs {opponent}</div>
                </div>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>기록 →</div>
              </div>
            );
          })}
        </div>
      )}
      {otherMatches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, marginBottom: 6 }}>타팀 경기 (스코어 입력)</div>
          {otherMatches.map(m => (
            <div key={m.matchNum} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: C.cardLight, borderRadius: 8, marginBottom: 3 }}>
              <span style={{ flex: 1, fontSize: 12, color: C.white, textAlign: "right" }}>{m.home}</span>
              {scoreEdit?.matchNum === m.matchNum ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input value={scoreEdit.home} onChange={e => setScoreEdit(p => ({ ...p, home: e.target.value }))} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                  <span style={{ color: C.gray }}>:</span>
                  <input value={scoreEdit.away} onChange={e => setScoreEdit(p => ({ ...p, away: e.target.value }))} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                  <button onClick={() => handleOtherScore(m.matchNum, parseInt(scoreEdit.home), parseInt(scoreEdit.away))}
                    style={{ padding: "2px 8px", borderRadius: 4, background: C.green, color: C.bg, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>OK</button>
                  <button onClick={() => setScoreEdit(null)} style={{ padding: "2px 6px", borderRadius: 4, background: C.grayDark, color: C.gray, border: "none", fontSize: 10, cursor: "pointer" }}>취소</button>
                </div>
              ) : (
                <button onClick={() => setScoreEdit({ matchNum: m.matchNum, home: "", away: "" })}
                  style={{ padding: "4px 10px", borderRadius: 6, background: C.grayDarker, color: C.grayLight, border: "none", fontSize: 11, cursor: "pointer" }}>스코어 입력</button>
              )}
              <span style={{ flex: 1, fontSize: 12, color: C.white }}>{m.away}</span>
            </div>
          ))}
        </div>
      )}
      {ourMatches.length === 0 && otherMatches.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.gray, fontSize: 13 }}>모든 경기가 완료되었습니다</div>}
    </div>
  );
}

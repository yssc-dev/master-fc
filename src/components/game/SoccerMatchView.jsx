import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers, calcSoccerPlayerStats, calcSoccerPlayerPoint } from '../../utils/soccerScoring';
import OpponentSelector from './OpponentSelector';
import LineupSelector from './LineupSelector';
import SoccerRecorder from './SoccerRecorder';

export default function SoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onAddOpponent, onGoToSummary, gameSettings, styles: s,
}) {
  const { C } = useTheme();
  const [viewState, setViewState] = useState("selectOpponent");
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [viewingMatchIdx, setViewingMatchIdx] = useState(null);

  const currentMatch = currentMatchIdx >= 0 ? soccerMatches[currentMatchIdx] : null;
  const finishedMatches = soccerMatches.filter(m => m.status === "finished");
  const viewingMatch = viewingMatchIdx !== null ? soccerMatches[viewingMatchIdx] : null;

  const handleOpponentSelect = (name) => {
    setSelectedOpponent(name);
    setViewState("selectLineup");
  };

  const handleLineupConfirm = ({ lineup, gk, defenders }) => {
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders });
    setViewState("playing");
    setViewingMatchIdx(null);
  };

  const handleAddEvent = (event) => { onAddEvent(currentMatchIdx, event); };
  const handleDeleteEvent = (eventId) => { onDeleteEvent(currentMatchIdx, eventId); };

  const handleFinishMatch = () => {
    onFinishMatch(currentMatchIdx);
    setViewState("matchFinished");
  };

  const handleNextMatch = () => {
    setSelectedOpponent(null);
    setViewState("selectOpponent");
  };

  // Viewing a past match
  if (viewingMatch) {
    const { ourScore, opponentScore } = calcSoccerScore(viewingMatch.events);
    const csPlayers = getCleanSheetPlayers(viewingMatch);
    return (
      <div>
        <button onClick={() => setViewingMatchIdx(null)}
          style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>
          ← 돌아가기
        </button>
        <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray }}>제{viewingMatch.matchIdx + 1}경기</div>
          <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0" }}>
            <span style={{ color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</span>
            <span style={{ color: C.gray }}> : </span>
            <span style={{ color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {viewingMatch.opponent}</div>
          {csPlayers.length > 0 && (
            <div style={{ fontSize: 11, color: C.yellow, marginTop: 6 }}>🛡 클린시트: {csPlayers.join(", ")}</div>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>이벤트 로그</div>
        {[...viewingMatch.events].sort((a, b) => a.timestamp - b.timestamp).map(e => (
          <div key={e.id} style={{ padding: "5px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11, color: C.white }}>
            {e.type === "goal" && `⚽ ${e.player}${e.assist ? ` ← ${e.assist}` : ""}`}
            {e.type === "owngoal" && `🔴 ${e.player} (자책골)`}
            {e.type === "opponentGoal" && `⚽ 상대골 (GK: ${e.currentGk || ""})`}
            {e.type === "sub" && `🔄 ${e.playerOut} → ${e.playerIn} (${e.position})`}
          </div>
        ))}
      </div>
    );
  }

  // After match finished
  if (viewState === "matchFinished" && finishedMatches.length > 0) {
    const lastMatch = finishedMatches[finishedMatches.length - 1];
    const { ourScore, opponentScore } = calcSoccerScore(lastMatch.events);
    const result = ourScore > opponentScore ? "승" : ourScore < opponentScore ? "패" : "무";
    const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
    const csPlayers = getCleanSheetPlayers(lastMatch);

    return (
      <div>
        {finishedMatches.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>오늘 경기</div>
            {finishedMatches.slice(0, -1).map((m, i) => {
              const sc = calcSoccerScore(m.events);
              return (
                <div key={i} onClick={() => setViewingMatchIdx(m.matchIdx)}
                  style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 12, cursor: "pointer", color: C.white }}>
                  <span>제{m.matchIdx + 1}경기 vs {m.opponent}</span>
                  <span style={{ fontWeight: 700 }}>{sc.ourScore}:{sc.opponentScore}</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray }}>제{lastMatch.matchIdx + 1}경기 종료</div>
          <div style={{ fontSize: 28, fontWeight: 900, margin: "8px 0" }}>{ourScore} : {opponentScore}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: resultColor }}>vs {lastMatch.opponent} — {result}리</div>
          {csPlayers.length > 0 && (
            <div style={{ fontSize: 12, color: C.yellow, marginTop: 8 }}>🛡 클린시트: {csPlayers.join(", ")}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleNextMatch}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>
            다음 경기
          </button>
          <button onClick={onGoToSummary}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.green, color: C.bg }}>
            전체 마감
          </button>
        </div>
      </div>
    );
  }

  // Playing
  if (viewState === "playing" && currentMatch) {
    return (
      <SoccerRecorder
        match={currentMatch} attendees={attendees}
        onAddEvent={handleAddEvent} onDeleteEvent={handleDeleteEvent}
        onFinishMatch={handleFinishMatch} styles={s}
      />
    );
  }

  // Lineup selection
  if (viewState === "selectLineup" && selectedOpponent) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setViewState("selectOpponent")}
            style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>
            ←
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {selectedOpponent} — 라인업</div>
        </div>
        <LineupSelector attendees={attendees} onConfirm={handleLineupConfirm} styles={s} />
      </div>
    );
  }

  // Opponent selection (default)
  return (
    <div>
      {finishedMatches.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>오늘 경기 ({finishedMatches.length}경기)</div>
          {finishedMatches.map((m, i) => {
            const sc = calcSoccerScore(m.events);
            return (
              <div key={i} onClick={() => setViewingMatchIdx(m.matchIdx)}
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: C.cardLight, borderRadius: 8, marginBottom: 4, fontSize: 13, cursor: "pointer", color: C.white }}>
                <span>제{m.matchIdx + 1}경기 vs {m.opponent}</span>
                <span style={{ fontWeight: 700 }}>{sc.ourScore}:{sc.opponentScore}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ ...s.card }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>
          {finishedMatches.length > 0 ? `제${finishedMatches.length + 1}경기` : "경기 생성"}
        </div>
        <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent} styles={s} />
      </div>
    </div>
  );
}

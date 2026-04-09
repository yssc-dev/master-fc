import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import OpponentSelector from './OpponentSelector';
import RosterSelector from './RosterSelector';
import FormationSetup from './FormationSetup';
import FormationRecorder from './FormationRecorder';

export default function SoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onAddOpponent, onGoToSummary, gameSettings, styles: s,
}) {
  const { C } = useTheme();
  const [viewState, setViewState] = useState("selectOpponent");
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [viewingMatchIdx, setViewingMatchIdx] = useState(null);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [matchFormation, setMatchFormation] = useState(null);

  const currentMatch = currentMatchIdx >= 0 ? soccerMatches[currentMatchIdx] : null;
  const finishedMatches = soccerMatches.filter(m => m.status === "finished");
  const viewingMatch = viewingMatchIdx !== null ? soccerMatches[viewingMatchIdx] : null;

  // 상대팀 선택
  const handleOpponentSelect = (name) => {
    setSelectedOpponent(name);
    setViewState("roster");
  };

  // 출전명단 확정
  const handleRosterConfirm = (players) => {
    setSelectedPlayers(players);
    setViewState("formation");
  };

  // 포메이션 확정 → 경기 생성
  const handleFormationConfirm = ({ formation, assignments, gk, positionMap, subs }) => {
    setMatchFormation({ formation, assignments, gk, positionMap, subs });
    const lineup = Object.values(assignments);
    const defenders = Object.entries(positionMap).filter(([, r]) => r === "DF").map(([n]) => n);
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders });
    setViewState("playing");
    setViewingMatchIdx(null);
  };

  // 이벤트
  const handleAddEvent = (event) => {
    onAddEvent(currentMatchIdx, { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() });
  };
  const handleDeleteEvent = (eventId) => { onDeleteEvent(currentMatchIdx, eventId); };

  // 경기 종료
  const handleFinishMatch = () => {
    onFinishMatch(currentMatchIdx);
    setViewState("matchFinished");
    setMatchFormation(null);
  };

  const handleNextMatch = () => {
    setSelectedOpponent(null);
    setSelectedPlayers([]);
    setMatchFormation(null);
    setViewState("selectOpponent");
  };

  // 과거 경기 보기
  if (viewingMatch) {
    const { ourScore, opponentScore } = calcSoccerScore(viewingMatch.events);
    const csPlayers = getCleanSheetPlayers(viewingMatch);
    return (
      <div>
        <button onClick={() => setViewingMatchIdx(null)} style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 돌아가기</button>
        <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.gray }}>제{viewingMatch.matchIdx + 1}경기</div>
          <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0" }}>
            <span style={{ color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</span>
            <span style={{ color: C.gray }}> : </span>
            <span style={{ color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {viewingMatch.opponent}</div>
          {csPlayers.length > 0 && <div style={{ fontSize: 11, color: C.yellow, marginTop: 6 }}>🛡 클린시트: {csPlayers.join(", ")}</div>}
        </div>
        {[...viewingMatch.events].sort((a, b) => a.timestamp - b.timestamp).map(e => (
          <div key={e.id} style={{ padding: "5px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11, color: C.white }}>
            {e.type === "goal" && `⚽ ${e.player}${e.assist ? ` ← ${e.assist}` : ""}`}
            {e.type === "owngoal" && `🔴 ${e.player} (자책골)`}
            {e.type === "opponentGoal" && `⚽ 상대골 (GK: ${e.currentGk || ""})`}
            {e.type === "opponentOwnGoal" && `🔴 상대 자책골`}
            {e.type === "sub" && `🔄 ${e.playerOut} → ${e.playerIn} (${e.position})`}
            {e.type === "yellowCard" && `🟨 ${e.player} 옐로카드`}
            {e.type === "redCard" && `🟥 ${e.player} 레드카드`}
          </div>
        ))}
      </div>
    );
  }

  // 경기 종료 후
  if (viewState === "matchFinished" && finishedMatches.length > 0) {
    const lastMatch = finishedMatches[finishedMatches.length - 1];
    const { ourScore, opponentScore } = calcSoccerScore(lastMatch.events);
    const result = ourScore > opponentScore ? "승" : ourScore < opponentScore ? "패" : "무";
    const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
    return (
      <div>
        {finishedMatches.length > 1 && (
          <div style={{ marginBottom: 12 }}>
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
          <div style={{ fontSize: 28, fontWeight: 900, margin: "8px 0" }}>{ourScore} : {opponentScore}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: resultColor }}>vs {lastMatch.opponent} — {result}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleNextMatch} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>다음 경기</button>
          <button onClick={onGoToSummary} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.green, color: C.bg }}>전체 마감</button>
        </div>
      </div>
    );
  }

  // 경기 진행 중 (포메이션 레코더)
  if (viewState === "playing" && currentMatch && matchFormation) {
    return (
      <FormationRecorder
        formation={matchFormation.formation}
        assignments={matchFormation.assignments}
        positionMap={matchFormation.positionMap}
        subs={matchFormation.subs}
        gk={matchFormation.gk}
        opponent={currentMatch.opponent}
        startedAt={Date.now()}
        events={currentMatch.events || []}
        onAddEvent={handleAddEvent}
        onDeleteEvent={handleDeleteEvent}
        onFinishMatch={handleFinishMatch}
      />
    );
  }

  // 포메이션 선택
  if (viewState === "formation" && selectedOpponent) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setViewState("roster")} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>←</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {selectedOpponent} — 포메이션</div>
        </div>
        <FormationSetup selectedPlayers={selectedPlayers} onConfirm={handleFormationConfirm} onBack={() => setViewState("roster")} />
      </div>
    );
  }

  // 출전명단 선택
  if (viewState === "roster" && selectedOpponent) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setViewState("selectOpponent")} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>←</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {selectedOpponent} — 출전 명단</div>
        </div>
        <RosterSelector allPlayers={attendees} onConfirm={handleRosterConfirm} />
      </div>
    );
  }

  // 상대팀 선택 (기본)
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

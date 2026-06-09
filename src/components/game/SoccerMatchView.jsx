import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import { FORMATIONS } from '../../utils/formations';
import OpponentSelector from './OpponentSelector';
import RosterSelector from './RosterSelector';
import FormationSetup from './FormationSetup';
import FormationRecorder from './FormationRecorder';
import AttendeeSelector from './AttendeeSelector';

export default function SoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onUpdateMatchFormation, onReopenMatch,
  onAddOpponent, onRemoveOpponent, onRenameOpponent, onGoToSummary, gameSettings, styles: s,
  savedFormation, onFormationChange,
  sortedPlayers, playerSortMode, rosterHandlers,
}) {
  const { C } = useTheme();

  // 저장된 포메이션 상태에서 복원
  const [viewState, setViewState] = useState(() => {
    if (savedFormation?.viewState) return savedFormation.viewState;
    if (currentMatchIdx >= 0 && soccerMatches[currentMatchIdx]?.status === "playing") return "playing";
    return "selectOpponent";
  });
  const [selectedOpponent, setSelectedOpponent] = useState(savedFormation?.selectedOpponent || null);
  const [viewingMatchIdx, setViewingMatchIdx] = useState(null);
  const [selectedPlayers, setSelectedPlayers] = useState(savedFormation?.selectedPlayers || []);
  const [matchFormation, setMatchFormation] = useState(savedFormation?.matchFormation || null);

  // 멀티탭 동기화: 다른 탭이 savedFormation 을 바꿨을 때 이 탭의 로컬 state 도 따라가야 함.
  // (CourtRecorder GK 버그와 같은 패턴 — useState 초기값만으론 prop 변경 후 sync 안 됨)
  useEffect(() => {
    if (savedFormation?.viewState !== undefined) {
      // 로컬에서 명단수정 중이면 원격 viewState 변화로 화면을 빼앗기지 않게 유지
      setViewState(local => local === "editRoster" ? local : savedFormation.viewState);
    }
  }, [savedFormation?.viewState]);
  useEffect(() => { setSelectedOpponent(savedFormation?.selectedOpponent || null); }, [savedFormation?.selectedOpponent]);
  useEffect(() => { setSelectedPlayers(savedFormation?.selectedPlayers || []); }, [savedFormation?.selectedPlayers]);
  useEffect(() => { setMatchFormation(savedFormation?.matchFormation || null); }, [savedFormation?.matchFormation]);

  // 상태 변경 시 리듀서에 저장 (Firebase 자동 저장됨)
  const saveFormationState = (updates) => {
    const current = { viewState, selectedOpponent, selectedPlayers, matchFormation, ...updates };
    onFormationChange?.(current);
  };

  const currentMatch = currentMatchIdx >= 0 ? soccerMatches[currentMatchIdx] : null;
  const finishedMatches = soccerMatches.filter(m => m.status === "finished");
  const viewingMatch = viewingMatchIdx !== null ? soccerMatches[viewingMatchIdx] : null;

  // 상대팀 선택 → 바로 포메이션으로
  const handleOpponentSelect = (name) => {
    setSelectedOpponent(name);
    setSelectedPlayers(attendees);
    setViewState("formation");
    saveFormationState({ viewState: "formation", selectedOpponent: name, selectedPlayers: attendees });
  };

  // 포메이션 확정 → 경기 생성
  const handleFormationConfirm = ({ formation, assignments, gk, positionMap, subs }) => {
    const mf = { formation, assignments, gk, positionMap, subs };
    setMatchFormation(mf);
    const lineup = Object.values(assignments);
    const defenders = Object.entries(positionMap).filter(([, r]) => r === "DF").map(([n]) => n);
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders, subs, formation, assignments, positionMap });
    setViewState("playing");
    setViewingMatchIdx(null);
    saveFormationState({ viewState: "playing", matchFormation: mf });
  };

  // 진행 중 포메이션/교체/카드로 배치가 바뀌면 경기 객체에 영구 반영(+로컬/멀티탭 동기화)
  const handleFormationStateChange = (updates) => {
    const merged = { ...(matchFormation || {}), ...updates };
    setMatchFormation(merged);
    onUpdateMatchFormation?.(currentMatchIdx, updates);
    saveFormationState({ matchFormation: merged });
  };

  // 경기 객체에서 레코더용 포메이션 복원 (저장돼 있으면 그대로, 없으면 lineup/gk/defenders로 4-4-2 재구성)
  const reconstructFormation = (m) => {
    if (m.formation && m.assignments && m.positionMap) {
      return { formation: m.formation, assignments: m.assignments, positionMap: m.positionMap, gk: m.gk || "", subs: m.subs || [] };
    }
    const formation = "4-4-2";
    const positions = FORMATIONS[formation].positions;
    const gk = m.gk || "";
    const defenders = m.defenders || [];
    const lineup = m.lineup || [];
    const others = lineup.filter(n => n !== gk && !defenders.includes(n));
    const assignments = {}; const positionMap = {};
    let di = 0, oi = 0;
    positions.forEach((pos, idx) => {
      let name = null;
      if (pos.role === "GK") name = gk || others[oi++] || null;
      else if (pos.role === "DF") name = defenders[di++] ?? others[oi++] ?? null;
      else name = others[oi++] ?? null;
      if (name) { assignments[idx] = name; positionMap[name] = pos.role; }
    });
    return { formation, assignments, positionMap, gk, subs: m.subs || [] };
  };

  // 끝난 경기 다시 열기(풀편집)
  const handleReopenMatch = (matchIdx) => {
    const m = soccerMatches[matchIdx];
    if (!m) return;
    if (!confirm(`제${matchIdx + 1}경기 (vs ${m.opponent}) 기록을 다시 열어 수정하시겠습니까?`)) return;
    const mf = reconstructFormation(m);
    onReopenMatch?.(matchIdx);
    setMatchFormation(mf);
    setViewState("playing");
    setViewingMatchIdx(null);
    saveFormationState({ viewState: "playing", matchFormation: mf });
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
    saveFormationState({ viewState: "matchFinished", matchFormation: null });
  };

  const handleNextMatch = () => {
    setSelectedOpponent(null);
    setSelectedPlayers([]);
    setMatchFormation(null);
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null, matchFormation: null });
  };

  // 과거 경기 보기
  if (viewingMatch) {
    const { ourScore, opponentScore } = calcSoccerScore(viewingMatch.events);
    const csPlayers = getCleanSheetPlayers(viewingMatch);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setViewingMatchIdx(null)} style={{ padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 돌아가기</button>
          {viewingMatch.opponent !== "휴식" && (
            <button onClick={() => handleReopenMatch(viewingMatch.matchIdx)} style={{ padding: "6px 14px", borderRadius: 8, background: `${C.accent}25`, color: C.accent, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ 수정</button>
          )}
        </div>
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
        startedAt={currentMatch.startedAt || Date.now()}
        events={currentMatch.events || []}
        onAddEvent={handleAddEvent}
        onDeleteEvent={handleDeleteEvent}
        onFinishMatch={handleFinishMatch}
        onStateChange={handleFormationStateChange}
      />
    );
  }

  // 포메이션 선택 (참석 멤버에서 바로 배치)
  if (viewState === "formation" && selectedOpponent) {
    return (
      <FormationSetup selectedPlayers={selectedPlayers} onConfirm={handleFormationConfirm} onBack={() => setViewState("selectOpponent")} title={`vs ${selectedOpponent}`} />
    );
  }

  if (viewState === "editRoster") {
    return (
      <div>
        <button onClick={() => setViewState("selectOpponent")} style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>← 완료</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 4 }}>참석명단 수정</div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>변경은 다음 경기부터 반영됩니다. (진행/종료된 경기는 그대로)</div>
        <AttendeeSelector
          attendees={attendees} sortedPlayers={sortedPlayers || []} playerSortMode={playerSortMode}
          {...rosterHandlers} styles={s} />
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
              <div key={i} onClick={() => m.opponent !== "휴식" && setViewingMatchIdx(m.matchIdx)}
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: C.cardLight, borderRadius: 8, marginBottom: 4, fontSize: 13, cursor: m.opponent === "휴식" ? "default" : "pointer", color: C.white, opacity: m.opponent === "휴식" ? 0.5 : 1 }}>
                <span>{m.opponent === "휴식" ? `제${m.matchIdx + 1}경기 😴 휴식` : `제${m.matchIdx + 1}경기 vs ${m.opponent}`}</span>
                {m.opponent !== "휴식" && <span style={{ fontWeight: 700 }}>{sc.ourScore}:{sc.opponentScore}</span>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ ...s.card }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>
          {finishedMatches.length > 0 ? `제${finishedMatches.length + 1}경기` : "경기 생성"}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={() => setViewState("editRoster")}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            👥 명단 수정 ({attendees.length})
          </button>
        </div>
        <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent}
          onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent} styles={s} />
        <button onClick={() => {
          if (!confirm("이번 라운드를 휴식으로 처리하시겠습니까?")) return;
          onCreateMatch({ opponent: "휴식", lineup: [], gk: "", defenders: [] });
          onFinishMatch(currentMatchIdx >= 0 ? currentMatchIdx : soccerMatches.length);
        }}
          style={{ marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 10, border: `1px dashed ${C.grayDark}`, background: "transparent", fontSize: 13, color: C.gray, cursor: "pointer" }}>
          😴 휴식 (이번 라운드 스킵)
        </button>
      </div>
    </div>
  );
}

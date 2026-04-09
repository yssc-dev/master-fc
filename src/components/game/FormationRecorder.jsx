import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS } from '../../utils/formations';
import { generateEventId } from '../../utils/idGenerator';
import FormationPitch from './FormationPitch';
import PlayerActionMenu from './PlayerActionMenu';

export default function FormationRecorder({
  formation: initFormation, assignments: initAssignments, positionMap: initPositionMap,
  subs: initSubs, gk: initGk, opponent, startedAt, matchMinutes = 90,
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange,
}) {
  const { C } = useTheme();
  const [formation, setFormation] = useState(initFormation || "4-4-2");
  const [assignments, setAssignments] = useState(initAssignments || {});
  const [positionMap, setPositionMap] = useState(initPositionMap || {});
  const [subs, setSubs] = useState(initSubs || []);
  const [gk, setGk] = useState(initGk || "");
  const [actionPlayer, setActionPlayer] = useState(null);
  const [goalFlow, setGoalFlow] = useState(null);
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subOut, setSubOut] = useState(null);

  const events = Array.isArray(initEvents) ? initEvents : [];
  const formData = FORMATIONS[formation];

  let ourScore = 0, opponentScore = 0;
  for (const e of events) {
    if (e.type === "goal" || e.type === "opponentOwnGoal") ourScore++;
    else if (e.type === "owngoal" || e.type === "opponentGoal") opponentScore++;
  }

  const handlePlayerTap = (posIdx, name) => {
    if (goalFlow) {
      if (goalFlow.type === "selectAssist") {
        onAddEvent({ type: "goal", player: goalFlow.scorer, assist: name, id: generateEventId(), timestamp: Date.now() });
        setGoalFlow(null);
      } else if (goalFlow.type === "selectScorer") {
        onAddEvent({ type: "goal", player: name, assist: goalFlow.assister, id: generateEventId(), timestamp: Date.now() });
        setGoalFlow(null);
      }
      return;
    }
    const role = formData.positions[posIdx]?.role || positionMap[name] || "FW";
    setActionPlayer({ posIdx, name, role });
  };

  const handleGoal = (player) => { setActionPlayer(null); setGoalFlow({ type: "selectAssist", scorer: player }); };
  const handleAssist = (player) => { setActionPlayer(null); setGoalFlow({ type: "selectScorer", assister: player }); };
  const handleOwnGoal = (player) => { onAddEvent({ type: "owngoal", player, id: generateEventId(), timestamp: Date.now() }); setActionPlayer(null); };

  const handleYellowCard = (player) => {
    onAddEvent({ type: "yellowCard", player, id: generateEventId(), timestamp: Date.now() });
    setActionPlayer(null);
  };

  const handleRedCard = (player) => {
    if (!confirm(`${player}에게 레드카드를 부여하시겠습니까?\n해당 선수는 퇴장됩니다.`)) { setActionPlayer(null); return; }
    onAddEvent({ type: "redCard", player, id: generateEventId(), timestamp: Date.now() });
    // 퇴장: 피치에서 제거 (후보 투입 없음)
    const posIdx = Object.entries(assignments).find(([, n]) => n === player)?.[0];
    if (posIdx !== undefined) {
      const newAssignments = { ...assignments };
      delete newAssignments[posIdx];
      const newPosMap = { ...positionMap };
      delete newPosMap[player];
      setAssignments(newAssignments);
      setPositionMap(newPosMap);
      onStateChange?.({ assignments: newAssignments, positionMap: newPosMap });
    }
    setActionPlayer(null);
  };

  const handleNoAssist = () => {
    if (goalFlow?.type === "selectAssist") {
      onAddEvent({ type: "goal", player: goalFlow.scorer, assist: null, id: generateEventId(), timestamp: Date.now() });
    }
    setGoalFlow(null);
  };

  const [showOpponentGoalMenu, setShowOpponentGoalMenu] = useState(false);

  const handleOpponentGoal = (isOwnGoal) => {
    if (isOwnGoal) {
      onAddEvent({ type: "opponentOwnGoal", id: generateEventId(), timestamp: Date.now() });
    } else {
      onAddEvent({ type: "opponentGoal", currentGk: gk, id: generateEventId(), timestamp: Date.now() });
    }
    setShowOpponentGoalMenu(false);
  };

  const handleSubOut = (posIdx, name) => { setSubOut({ posIdx, name }); };
  const handleSubIn = (subName) => {
    if (!subOut) return;
    const role = formData.positions[subOut.posIdx]?.role || "FW";
    onAddEvent({ type: "sub", playerOut: subOut.name, playerIn: subName, position: role, id: generateEventId(), timestamp: Date.now() });
    const newAssignments = { ...assignments, [subOut.posIdx]: subName };
    const newPosMap = { ...positionMap }; delete newPosMap[subOut.name]; newPosMap[subName] = role;
    const newSubs = [...subs.filter(n => n !== subName), subOut.name];
    setAssignments(newAssignments);
    setPositionMap(newPosMap);
    setSubs(newSubs);
    if (role === "GK") setGk(subName);
    setSubOut(null);
    setShowSubModal(false);
    onStateChange?.({ assignments: newAssignments, positionMap: newPosMap, subs: newSubs, gk: role === "GK" ? subName : gk });
  };

  const handleFormationChange = (key) => {
    const newForm = FORMATIONS[key];
    const currentPlayers = Object.values(assignments);
    const newAssignments = {};
    const newPosMap = {};
    currentPlayers.forEach((name, i) => {
      if (i < 11) { newAssignments[i] = name; newPosMap[name] = newForm.positions[i].role; }
    });
    const newGk = Object.entries(newAssignments).find(([idx]) => newForm.positions[idx].role === "GK")?.[1] || gk;
    setFormation(key); setAssignments(newAssignments); setPositionMap(newPosMap); setGk(newGk); setShowFormationPicker(false);
    onStateChange?.({ formation: key, assignments: newAssignments, positionMap: newPosMap, gk: newGk });
  };

  const handleFinish = () => {
    if (!confirm(`${ourScore} : ${opponentScore} (vs ${opponent})\n경기를 종료하시겠습니까?`)) return;
    onFinishMatch({ formation, assignments, positionMap, subs, gk });
  };

  const formatTime = (ts) => startedAt ? `${Math.floor((ts - startedAt) / 60000)}'` : "";
  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div>
      {/* Scoreboard */}
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", background: C.cardLight, borderRadius: 12, padding: "10px 8px", marginBottom: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gray }}>우리팀</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.gray }}>vs {opponent}</div>
          {startedAt && <div style={{ fontSize: 10, color: C.grayDark, marginTop: 2 }}>{matchMinutes}분 경기</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gray }}>상대팀</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</div>
        </div>
      </div>

      {/* Goal flow */}
      {goalFlow && (
        <div style={{ padding: "8px 12px", background: `${C.green}15`, borderRadius: 8, marginBottom: 8, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>
            {goalFlow.type === "selectAssist" ? `⚽ ${goalFlow.scorer} 골! 어시스트 선수를 탭하세요` : `🅰️ ${goalFlow.assister} 어시! 골 선수를 탭하세요`}
          </div>
          <button onClick={handleNoAssist} style={{ marginTop: 4, padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 11, cursor: "pointer", background: C.grayDark, color: C.gray }}>
            {goalFlow.type === "selectAssist" ? "어시 없음 (단독골)" : "취소"}
          </button>
        </div>
      )}

      {/* Pitch */}
      <FormationPitch positions={formData.positions} assignments={assignments} onPlayerTap={handlePlayerTap} onEmptyTap={() => {}} />

      {/* Buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={() => setShowOpponentGoalMenu(true)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.red}20`, color: C.red }}>⚽ 상대골</button>
        <button onClick={() => { setShowSubModal(true); setSubOut(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.accent}20`, color: C.accent }}>🔄 교체</button>
        <button onClick={() => setShowFormationPicker(true)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>📋 포메이션</button>
        <button onClick={handleFinish} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: `${C.green}20`, color: C.green }}>🏁 종료</button>
      </div>

      {subs.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: C.gray }}><span style={{ fontWeight: 600 }}>후보:</span> {subs.join(", ")}</div>}

      {/* Events */}
      {sortedEvents.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>기록 ({sortedEvents.length})</div>
          {sortedEvents.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11 }}>
              <span style={{ color: C.grayDark, minWidth: 24 }}>{formatTime(e.timestamp)}</span>
              {e.type === "goal" && <><span>⚽</span><span style={{ fontWeight: 600, color: C.white }}>{e.player}</span>{e.assist && <span style={{ color: C.gray }}> ← {e.assist}</span>}</>}
              {e.type === "owngoal" && <><span>🔴</span><span style={{ color: C.red }}>{e.player} (자책)</span></>}
              {e.type === "opponentGoal" && <><span>⚽</span><span style={{ color: C.red }}>상대골</span>{e.currentGk && <span style={{ color: C.gray }}> GK:{e.currentGk}</span>}</>}
              {e.type === "opponentOwnGoal" && <><span>🔴</span><span style={{ color: C.green }}>상대 자책골 (+1)</span></>}
              {e.type === "yellowCard" && <><span>🟨</span><span style={{ color: "#eab308", fontWeight: 600 }}>{e.player}</span><span style={{ color: C.gray }}> 옐로카드</span></>}
              {e.type === "redCard" && <><span>🟥</span><span style={{ color: "#ef4444", fontWeight: 600 }}>{e.player}</span><span style={{ color: C.gray }}> 레드카드 (퇴장)</span></>}
              {e.type === "sub" && <><span>🔄</span><span style={{ color: C.red }}>{e.playerOut}</span><span style={{ color: C.gray }}>→</span><span style={{ color: C.green }}>{e.playerIn}</span></>}
              <button onClick={() => onDeleteEvent(e.id)} style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 9, padding: "2px 5px", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Opponent goal menu */}
      {showOpponentGoalMenu && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowOpponentGoalMenu(false)}>
          <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 280, width: "100%", textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 16 }}>상대팀 득점</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => handleOpponentGoal(false)}
                style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.red}25`, color: C.red }}>
                ⚽ 일반 실점
              </button>
              <button onClick={() => handleOpponentGoal(true)}
                style={{ padding: "14px 0", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", background: `${C.green}25`, color: C.green }}>
                🔴 상대 자책골 (우리팀 +1)
              </button>
            </div>
            <button onClick={() => setShowOpponentGoalMenu(false)}
              style={{ marginTop: 10, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDarker, color: C.grayLight }}>취소</button>
          </div>
        </div>
      )}

      {/* Action menu */}
      {actionPlayer && !goalFlow && (
        <PlayerActionMenu player={actionPlayer.name} position={actionPlayer.role} onGoal={handleGoal} onAssist={handleAssist} onOwnGoal={handleOwnGoal} onYellowCard={handleYellowCard} onRedCard={handleRedCard} onClose={() => setActionPlayer(null)} />
      )}

      {/* Sub modal */}
      {showSubModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setShowSubModal(false); setSubOut(null); }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 360, width: "100%", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            {!subOut ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.white, textAlign: "center", marginBottom: 12 }}>🔄 나가는 선수</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(assignments).map(([idx, name]) => (
                    <button key={idx} onClick={() => handleSubOut(Number(idx), name)}
                      style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>
                      <span style={{ fontSize: 10, color: C.gray }}>{formData.positions[idx]?.role}</span> {name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.white, textAlign: "center", marginBottom: 4 }}>🔄 들어오는 선수</div>
                <div style={{ fontSize: 12, color: C.red, textAlign: "center", marginBottom: 12 }}>{subOut.name} → ?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {subs.map(name => (
                    <button key={name} onClick={() => handleSubIn(name)}
                      style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>{name}</button>
                  ))}
                </div>
                {subs.length === 0 && <div style={{ textAlign: "center", color: C.gray, fontSize: 12 }}>후보가 없습니다</div>}
              </>
            )}
            <button onClick={() => { setShowSubModal(false); setSubOut(null); }}
              style={{ marginTop: 12, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>취소</button>
          </div>
        </div>
      )}

      {/* Formation picker */}
      {showFormationPicker && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowFormationPicker(false)}>
          <div style={{ background: C.card, borderRadius: 16, padding: 20, maxWidth: 300, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white, textAlign: "center", marginBottom: 12 }}>📋 포메이션 변경</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FORMATION_KEYS.map(key => (
                <button key={key} onClick={() => handleFormationChange(key)}
                  style={{ padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    background: formation === key ? C.accent : C.grayDarker, color: formation === key ? C.bg : C.white }}>{FORMATIONS[key].label}</button>
              ))}
            </div>
            <button onClick={() => setShowFormationPicker(false)}
              style={{ marginTop: 10, padding: "10px 0", width: "100%", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer", background: C.grayDark, color: C.grayLight }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

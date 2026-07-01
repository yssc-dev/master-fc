import { useState, useLayoutEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS, swapFormationSlots, defendersFromPositionMap } from '../../utils/formations';
import { generateEventId } from '../../utils/idGenerator';
import FormationPitch from './FormationPitch';
import PlayerActionMenu from './PlayerActionMenu';
import Modal from '../common/Modal';

// NOTE: 이 컴포넌트는 uncontrolled — init* props로 마운트 시 1회만 시드하고 이후 prop 변경 무시.
// 호출부(SoccerMatchView)는 경기 전환 시 key={currentMatchIdx}로 remount해 재시드함.
// prop→state 동기화 useEffect를 추가하지 않는 한 key= 를 제거하면 다른 경기 데이터가 stale로 남는다.
export default function FormationRecorder({
  formation: initFormation, assignments: initAssignments, positionMap: initPositionMap,
  subs: initSubs, gk: initGk, opponent, startedAt, matchMinutes = 90,
  events: initEvents, onAddEvent, onDeleteEvent, onFinishMatch, onStateChange, onFlowActiveChange,
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

  // 미확정 2탭 골 입력이 열려 있으면 상위에 알려 ◀▶ 네비를 잠근다(remount로 인한 골 유실 방지).
  // useLayoutEffect: paint 전 동기 실행으로 goalFlow 열림~navLocked 반영 사이 프레임 갭 제거.
  // cleanup: 언마운트/재실행 시 잠금 해제(navLocked 잔류 방지).
  useLayoutEffect(() => {
    onFlowActiveChange?.(goalFlow != null);
    return () => onFlowActiveChange?.(false);
  }, [goalFlow, onFlowActiveChange]);

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
      // GK 퇴장 시 gk를 비워야 이후 실점 귀속/클린시트가 퇴장 선수에게 가지 않음
      const wasGk = gk === player;
      if (wasGk) setGk("");
      onStateChange?.(wasGk
        ? { assignments: newAssignments, positionMap: newPosMap, gk: "" }
        : { assignments: newAssignments, positionMap: newPosMap });
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
  // 선수 액션 모달에서 바로 교체: 그 선수를 빼고 벤치 선택 단계로
  const handleSubFromAction = () => {
    if (!actionPlayer) return;
    setSubOut({ posIdx: actionPlayer.posIdx, name: actionPlayer.name });
    setShowSubModal(true);
    setActionPlayer(null);
  };
  const handleSubIn = (subName) => {
    if (!subOut) return;
    const role = formData.positions[subOut.posIdx]?.role || "FW";
    onAddEvent({ type: "sub", playerOut: subOut.name, playerIn: subName, position: role, posIdx: subOut.posIdx, id: generateEventId(), timestamp: Date.now() });
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

  // 출전 선수끼리 위치(포지션) 교대 — 교체 아님(이벤트 없음), 배치/역할/GK만 갱신.
  const handleSwap = (targetPosIdx) => {
    if (!subOut) return;
    const res = swapFormationSlots(
      { assignments, positionMap, gk, positions: formData.positions },
      subOut.posIdx, targetPosIdx
    );
    setAssignments(res.assignments);
    setPositionMap(res.positionMap);
    if (res.gk !== gk) {
      setGk(res.gk);
      // GK가 바뀌면 배경 기록(gkChange) — 무실점 경기도 두 GK를 집계(keeperGames/클린시트)에서
      // 알 수 있게 한다. 실점 귀속은 opponentGoal의 currentGk가 담당. 타임라인엔 표시 안 함.
      onAddEvent({ type: "gkChange", playerOut: gk, playerIn: res.gk, id: generateEventId(), timestamp: Date.now() });
    }
    setSubOut(null);
    setShowSubModal(false);
    // formation도 함께 전송 — 교대는 이벤트가 없어, 레거시(formation 미저장) 매치면 remount 시
    // reconstructFormation이 이벤트 재생 경로로 빠져 교대가 유실된다. formation을 실어 매치를
    // '모던'으로 승격해 저장된 assignments/gk가 복원되게 한다.
    // defenders도 재계산해 전송 — DF↔MF/GK 교대로 role이 바뀌면 클린시트 정합 유지.
    const defenders = defendersFromPositionMap(res.positionMap);
    onStateChange?.({ formation, assignments: res.assignments, positionMap: res.positionMap, gk: res.gk, defenders });
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
    const defenders = defendersFromPositionMap(newPosMap);
    onStateChange?.({ formation: key, assignments: newAssignments, positionMap: newPosMap, gk: newGk, defenders });
  };

  const handleFinish = () => {
    if (!confirm(`${ourScore} : ${opponentScore} (vs ${opponent})\n경기를 종료하시겠습니까?`)) return;
    onFinishMatch({ formation, assignments, positionMap, subs, gk });
  };

  const formatTime = (ts) => startedAt ? `${Math.floor((ts - startedAt) / 60000)}'` : "";
  // gkChange는 집계용 배경 기록 — 타임라인/기록 목록에는 표시하지 않음(포메이션 변경과 동일 취급).
  const sortedEvents = [...events].filter(e => e.type !== "gkChange").sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div>
      {/* Scoreboard */}
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", background: C.cardLight, borderRadius: 12, padding: "10px 8px", marginBottom: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gray }}>우리팀</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.gray }}>vs {opponent}</div>
          {startedAt && <div style={{ fontSize: 10, color: C.grayDark, marginTop: 2 }}>{matchMinutes}분 경기</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gray }}>상대팀</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</div>
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
        <button onClick={() => setShowFormationPicker(true)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: C.cardLight, color: C.grayLight }}>📋 포메이션</button>
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
              {e.type === "goal" && <><span>⚽</span><span style={{ fontWeight: 600, color: C.white }}>{e.player}</span>{e.assist && <span style={{ color: C.gray }}> · 🅰️ {e.assist}</span>}</>}
              {e.type === "owngoal" && <><span>🔴</span><span style={{ color: C.red }}>{e.player} (자책)</span></>}
              {e.type === "opponentGoal" && <><span>⚽</span><span style={{ color: C.red }}>상대골</span>{e.currentGk && <span style={{ color: C.gray }}> GK:{e.currentGk}</span>}</>}
              {e.type === "opponentOwnGoal" && <><span>🔴</span><span style={{ color: C.green }}>상대 자책골 (+1)</span></>}
              {e.type === "yellowCard" && <><span>🟨</span><span style={{ color: "#eab308", fontWeight: 600 }}>{e.player}</span><span style={{ color: C.gray }}> 옐로카드</span></>}
              {e.type === "redCard" && <><span>🟥</span><span style={{ color: "#ef4444", fontWeight: 600 }}>{e.player}</span><span style={{ color: C.gray }}> 레드카드 (퇴장)</span></>}
              {e.type === "sub" && <><span>🔄</span><span style={{ color: C.red }}>{e.playerOut}</span><span style={{ color: C.gray }}>→</span><span style={{ color: C.green }}>{e.playerIn}</span></>}
              <button onClick={() => {
                if (e.type === "sub" && !confirm("이 교체를 삭제하면 그 교체가 되돌려집니다(배치 복원). 계속하시겠습니까?")) return;
                onDeleteEvent(e.id);
              }} style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 9, padding: "2px 5px", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Opponent goal menu */}
      {showOpponentGoalMenu && (
        <Modal title="상대팀 득점" onClose={() => setShowOpponentGoalMenu(false)} maxWidth={300}>
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
        </Modal>
      )}

      {/* Action menu */}
      {actionPlayer && !goalFlow && (
        <PlayerActionMenu player={actionPlayer.name} position={actionPlayer.role} onGoal={handleGoal} onAssist={handleAssist} onOwnGoal={handleOwnGoal} onYellowCard={handleYellowCard} onRedCard={handleRedCard} onSub={handleSubFromAction} onClose={() => setActionPlayer(null)} />
      )}

      {/* Sub modal */}
      {showSubModal && (
        <Modal title={subOut ? `🔄 ${subOut.name} — 교체 / 위치교대` : "🔄 나가는 선수"} onClose={() => { setShowSubModal(false); setSubOut(null); }} maxWidth={360}>
          {!subOut ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(assignments).map(([idx, name]) => (
                <button key={idx} onClick={() => handleSubOut(Number(idx), name)}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.cardLight, color: C.white }}>
                  <span style={{ fontSize: 10, color: C.gray }}>{formData.positions[idx]?.role}</span> {name}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>후보 (교체 투입)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {subs.map(name => (
                  <button key={name} onClick={() => handleSubIn(name)}
                    style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.cardLight, color: C.white }}>{name}</button>
                ))}
                {subs.length === 0 && <span style={{ color: C.gray, fontSize: 12 }}>후보 없음</span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, margin: "14px 0 6px" }}>출전 선수 (위치 교대)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(assignments)
                  .filter(([idx]) => Number(idx) !== subOut.posIdx)
                  .map(([idx, name]) => (
                    <button key={idx} onClick={() => handleSwap(Number(idx))}
                      style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.accent}55`, fontSize: 13, fontWeight: 600, cursor: "pointer", background: `${C.accent}12`, color: C.white }}>
                      <span style={{ fontSize: 10, color: C.gray }}>{formData.positions[idx]?.role}</span> {name}
                    </button>
                  ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Formation picker */}
      {showFormationPicker && (
        <Modal title="📋 포메이션 변경" onClose={() => setShowFormationPicker(false)} maxWidth={300}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {FORMATION_KEYS.map(key => (
              <button key={key} onClick={() => handleFormationChange(key)}
                style={{ padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  background: formation === key ? C.accent : C.cardLight, color: formation === key ? C.bg : C.white }}>{FORMATIONS[key].label}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

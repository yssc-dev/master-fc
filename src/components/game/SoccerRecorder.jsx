import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getCurrentLineup, getCurrentGk, getCurrentDefenders, calcSoccerScore } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import SubstitutionModal from './SubstitutionModal';

export default function SoccerRecorder({ match, attendees, onAddEvent, onDeleteEvent, onFinishMatch, styles: s }) {
  const { C } = useTheme();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [goalStep, setGoalStep] = useState(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);

  const currentLineup = getCurrentLineup(match);
  const currentGk = getCurrentGk(match);
  const currentDefs = getCurrentDefenders(match);
  const bench = attendees.filter(p => !currentLineup.includes(p));
  const { ourScore, opponentScore } = calcSoccerScore(match.events);

  const handleGoalTap = () => { setShowGoalModal(true); setGoalStep(null); setIsOwnGoal(false); };

  const selectScorer = (player) => { setGoalStep({ player }); };

  const confirmGoal = (assist) => {
    if (isOwnGoal) {
      onAddEvent({ type: "owngoal", player: goalStep.player, id: generateEventId(), timestamp: Date.now() });
    } else {
      onAddEvent({ type: "goal", player: goalStep.player, assist: assist || null, id: generateEventId(), timestamp: Date.now() });
    }
    setShowGoalModal(false);
    setGoalStep(null);
  };

  const handleOpponentGoal = () => {
    if (!confirm("상대팀 골을 기록하시겠습니까?")) return;
    onAddEvent({ type: "opponentGoal", currentGk, id: generateEventId(), timestamp: Date.now() });
  };

  const handleSubConfirm = ({ playerOut, playerIn, position }) => {
    onAddEvent({ type: "sub", playerOut, playerIn, position, id: generateEventId(), timestamp: Date.now() });
    setShowSubModal(false);
  };

  const handleDelete = (eventId) => {
    if (!confirm("이 이벤트를 삭제하시겠습니까?")) return;
    onDeleteEvent(eventId);
  };

  const handleFinish = () => {
    if (!confirm(`${ourScore} : ${opponentScore} (vs ${match.opponent})\n경기를 종료하시겠습니까?`)) return;
    onFinishMatch();
  };

  const formatTime = (ts) => {
    if (!match.startedAt) return "";
    const diff = Math.floor((ts - match.startedAt) / 60000);
    return `${diff}'`;
  };

  const sortedEvents = [...match.events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div>
      {/* Scoreboard */}
      <div style={{
        display: "flex", justifyContent: "space-around", alignItems: "center",
        background: C.cardLight, borderRadius: 12, padding: "14px 8px", marginBottom: 12,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>우리팀</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: C.gray }}>vs</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginTop: 2 }}>{match.opponent}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>상대팀</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={handleGoalTap}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.green}25`, color: C.green }}>
          ⚽ 우리골
        </button>
        <button onClick={handleOpponentGoal}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.red}25`, color: C.red }}>
          ⚽ 상대골
        </button>
        <button onClick={() => setShowSubModal(true)}
          style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.accent}25`, color: C.accent }}>
          🔄 교체
        </button>
      </div>

      {/* Event log */}
      {sortedEvents.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>경기 기록 ({sortedEvents.length}건)</div>
          {sortedEvents.map(e => (
            <div key={e.id} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
              background: C.cardLight, borderRadius: 8, marginBottom: 4, fontSize: 12,
            }}>
              <span style={{ color: C.grayDark, fontSize: 11, minWidth: 28 }}>{formatTime(e.timestamp)}</span>
              {e.type === "goal" && <>
                <span>⚽</span>
                <span style={{ fontWeight: 600 }}>{e.player}</span>
                {e.assist && <span style={{ color: C.gray, fontSize: 11 }}> ← {e.assist}(어시)</span>}
                {!e.assist && <span style={{ color: C.grayDark, fontSize: 11 }}> (단독골)</span>}
              </>}
              {e.type === "owngoal" && <>
                <span>🔴</span>
                <span style={{ fontWeight: 600, color: C.red }}>{e.player}</span>
                <span style={{ color: C.gray, fontSize: 11 }}> (자책골)</span>
              </>}
              {e.type === "opponentGoal" && <>
                <span>⚽</span>
                <span style={{ color: C.red, fontWeight: 600 }}>상대골</span>
                {e.currentGk && <span style={{ color: C.gray, fontSize: 11 }}> (GK: {e.currentGk})</span>}
              </>}
              {e.type === "sub" && <>
                <span>🔄</span>
                <span style={{ color: C.red }}>{e.playerOut}</span>
                <span style={{ color: C.gray }}>→</span>
                <span style={{ color: C.green }}>{e.playerIn}</span>
                <span style={{ color: C.grayDark, fontSize: 10 }}>({e.position})</span>
              </>}
              <button onClick={() => handleDelete(e.id)}
                style={{ marginLeft: "auto", background: `${C.red}30`, border: "none", borderRadius: 4, color: C.red, fontSize: 10, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Finish match button */}
      <button onClick={handleFinish}
        style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: C.accent, color: C.bg }}>
        경기 종료
      </button>

      {/* Goal modal */}
      {showGoalModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => { setShowGoalModal(false); setGoalStep(null); }}>
          <div style={{
            background: C.card, borderRadius: 16, padding: 20, maxWidth: 360, width: "100%", maxHeight: "80vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>
            {!goalStep ? (
              <>
                <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 4 }}>⚽ 골 기록</div>
                <div style={{ textAlign: "center", fontSize: 12, color: C.gray, marginBottom: 14 }}>득점자를 선택하세요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentLineup.map(p => (
                    <button key={p} onClick={() => selectScorer(p)}
                      style={{ border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white, textAlign: "center" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShowGoalModal(false); setGoalStep(null); }}
                  style={{ width: "100%", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.grayLight, marginTop: 10 }}>
                  취소
                </button>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: C.white, marginBottom: 4 }}>
                  ⚽ {goalStep.player} 골!
                </div>
                <div style={{ textAlign: "center", fontSize: 12, color: C.gray, marginBottom: 14 }}>어시스트 선수를 선택하세요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentLineup.filter(p => p !== goalStep.player).map(p => (
                    <button key={p} onClick={() => confirmGoal(p)}
                      style={{ border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white, textAlign: "center" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => confirmGoal(null)}
                    style={{ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: C.grayDark, color: C.gray }}>
                    어시없음
                  </button>
                  <button onClick={() => { setIsOwnGoal(true); confirmGoal(null); }}
                    style={{ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.red}30`, color: C.red }}>
                    자책골
                  </button>
                </div>
                <button onClick={() => setGoalStep(null)}
                  style={{ width: "100%", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.grayLight, marginTop: 8 }}>
                  뒤로
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sub modal */}
      {showSubModal && (
        <SubstitutionModal
          currentLineup={currentLineup} bench={bench}
          currentGk={currentGk} currentDefenders={currentDefs}
          onConfirm={handleSubConfirm} onClose={() => setShowSubModal(false)}
        />
      )}
    </div>
  );
}

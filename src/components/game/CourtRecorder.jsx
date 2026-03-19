import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import PlayerActionModal from './PlayerActionModal';
import EventLog from './EventLog';

export default function CourtRecorder({ matchInfo, homePlayers: initHomePlayers, awayPlayers: initAwayPlayers, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinish, onMatchInfoUpdate, onGkChange, styles: s, courtLabel, attendees }) {
  const { C } = useTheme();
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [actionMode, setActionMode] = useState(null);
  const [pendingGoalPlayer, setPendingGoalPlayer] = useState(null);
  const [pendingAssistPlayer, setPendingAssistPlayer] = useState(null);
  const [homeGk, setHomeGk] = useState(matchInfo.homeGk || null);
  const [awayGk, setAwayGk] = useState(matchInfo.awayGk || null);
  const [mercs, setMercs] = useState([]);
  const [showMercPicker, setShowMercPicker] = useState(null);

  const { homeIdx, awayIdx, matchId, homeTeam, awayTeam, homeColor, awayColor } = matchInfo;

  const homeMercs = mercs.filter(m => m.side === "home").map(m => m.player);
  const awayMercs = mercs.filter(m => m.side === "away").map(m => m.player);
  const homePlayers = [...initHomePlayers, ...homeMercs];
  const awayPlayers = [...initAwayPlayers, ...awayMercs];

  const mercCandidates = (attendees || []).filter(p => !homePlayers.includes(p) && !awayPlayers.includes(p));

  const matchEvents = allEvents.filter(e => e.matchId === matchId);
  const homeScore = matchEvents.filter(e => e.scoringTeam === homeTeam).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);
  const awayScore = matchEvents.filter(e => e.scoringTeam === awayTeam).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0);

  const handlePlayerTap = (player, isHome) => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return; }
    if (actionMode === "selectAssist" && pendingGoalPlayer) {
      if (player === pendingGoalPlayer.player) return;
      const gp = pendingGoalPlayer;
      onRecordEvent(courtLabel, {
        type: "goal", matchId, player: gp.player, assist: player,
        team: gp.isHome ? homeTeam : awayTeam, scoringTeam: gp.isHome ? homeTeam : awayTeam,
        concedingTeam: gp.isHome ? awayTeam : homeTeam, concedingGk: gp.isHome ? awayGk : homeGk,
        concedingGkLoss: 1, homeTeam, awayTeam,
      });
      resetState();
      return;
    }
    if (actionMode === "selectScorer" && pendingAssistPlayer) {
      if (player === pendingAssistPlayer.player) return;
      const scorerIsHome = isHome;
      onRecordEvent(courtLabel, {
        type: "goal", matchId, player: player, assist: pendingAssistPlayer.player,
        team: scorerIsHome ? homeTeam : awayTeam, scoringTeam: scorerIsHome ? homeTeam : awayTeam,
        concedingTeam: scorerIsHome ? awayTeam : homeTeam, concedingGk: scorerIsHome ? awayGk : homeGk,
        concedingGkLoss: 1, homeTeam, awayTeam,
      });
      resetState();
      return;
    }
    setSelectedPlayer({ player, isHome });
    setActionMode(null);
  };

  const checkGk = () => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return false; }
    return true;
  };

  const handleGoal = () => {
    if (!checkGk()) return;
    setPendingGoalPlayer(selectedPlayer);
    setActionMode("selectAssist");
    setSelectedPlayer(null);
  };

  const handleAssist = () => {
    if (!checkGk()) return;
    setPendingAssistPlayer(selectedPlayer);
    setActionMode("selectScorer");
    setSelectedPlayer(null);
  };

  const handleOwnGoal = () => {
    if (!checkGk()) return;
    const sp = selectedPlayer;
    const ownTeam = sp.isHome ? homeTeam : awayTeam;
    const scoringTeam = sp.isHome ? awayTeam : homeTeam;
    const ownGk = sp.isHome ? homeGk : awayGk;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player: sp.player,
      team: ownTeam, scoringTeam, concedingTeam: ownTeam,
      concedingGk: ownGk, concedingGkLoss: 2,
      assist: null, homeTeam, awayTeam,
    });
    resetState();
  };

  const skipAssist = () => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: gp.player, assist: null,
      team: gp.isHome ? homeTeam : awayTeam, scoringTeam: gp.isHome ? homeTeam : awayTeam,
      concedingTeam: gp.isHome ? awayTeam : homeTeam, concedingGk: gp.isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
    resetState();
  };

  const resetState = () => {
    setSelectedPlayer(null);
    setActionMode(null);
    setPendingGoalPlayer(null);
    setPendingAssistPlayer(null);
  };

  const toggleGk = (player, isHome) => {
    if (isHome) {
      setHomeGk(prev => { const next = prev === player ? null : player; if (onGkChange) onGkChange(matchInfo.homeIdx, next); return next; });
    } else {
      setAwayGk(prev => { const next = prev === player ? null : player; if (onGkChange) onGkChange(matchInfo.awayIdx, next); return next; });
    }
  };

  const addMerc = (player, side) => { setMercs(prev => [...prev, { player, side }]); setShowMercPicker(null); };
  const removeMerc = (player) => { setMercs(prev => prev.filter(m => m.player !== player)); };

  const getPlayerStyle = (player, isHome) => {
    const color = isHome ? homeColor : awayColor;
    let extra = {};
    if (actionMode === "selectAssist" && pendingGoalPlayer) {
      if (player === pendingGoalPlayer.player) extra = { opacity: 0.3 };
      else if (isHome === pendingGoalPlayer.isHome) extra = { boxShadow: `0 0 0 2px ${C.accent}`, transform: "scale(1.02)" };
      else extra = { opacity: 0.3 };
    }
    if (actionMode === "selectScorer" && pendingAssistPlayer) {
      if (player === pendingAssistPlayer.player) extra = { opacity: 0.3 };
      else if (isHome === pendingAssistPlayer.isHome) extra = { boxShadow: `0 0 0 2px ${C.green}`, transform: "scale(1.02)" };
      else extra = { opacity: 0.3 };
    }
    return { ...s.matchBtn(color), width: "100%", marginBottom: 4, transition: "all 0.15s", ...extra };
  };

  const renderPlayerList = (players, isHome, mercsArr, teamName, color) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: C.gray, textAlign: "center", marginBottom: 4 }}>{teamName}</div>
      {players.map(p => {
        const isMerc = mercsArr.includes(p);
        return (
          <div key={p} style={{ display: "flex", gap: 3, marginBottom: 4, alignItems: "stretch" }}>
            <button onClick={() => handlePlayerTap(p, isHome)} style={{ ...getPlayerStyle(p, isHome), flex: 1, marginBottom: 0 }}>
              {(isHome ? homeGk : awayGk) === p && <span style={{ marginRight: 4, fontSize: 10 }}>🧤</span>}
              {isMerc && <span style={{ marginRight: 2, fontSize: 9, color: C.orange }}>(용병)</span>}
              {p}
            </button>
            <button onClick={() => toggleGk(p, isHome)}
              style={{ ...s.btnSm((isHome ? homeGk : awayGk) === p ? C.yellow : C.grayDarker, (isHome ? homeGk : awayGk) === p ? "#000" : C.gray), padding: "4px 6px", fontSize: 9, minWidth: 28 }}>
              GK
            </button>
            {isMerc && (
              <button onClick={() => removeMerc(p)}
                style={{ ...s.btnSm(C.redDim), padding: "4px 6px", fontSize: 9, minWidth: 24 }}>X</button>
            )}
          </div>
        );
      })}
      <button onClick={() => setShowMercPicker(isHome ? "home" : "away")}
        style={{ ...s.btnSm(C.grayDark, C.orange), width: "100%", marginTop: 4, fontSize: 11 }}>
        + 선수추가
      </button>
    </div>
  );

  return (
    <div style={{ ...s.card, border: `1px solid ${C.grayDark}` }}>
      {courtLabel && <div style={{ fontSize: 11, color: C.gray, marginBottom: 6, textAlign: "center" }}>{courtLabel}</div>}

      <div style={s.scoreboard}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: homeColor?.bg, marginBottom: 4 }}>{homeTeam}</div>
          <div style={{ color: homeScore > awayScore ? C.green : C.white }}>{homeScore}</div>
        </div>
        <div style={{ fontSize: 18, color: C.gray }}>:</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: awayColor?.bg, marginBottom: 4 }}>{awayTeam}</div>
          <div style={{ color: awayScore > homeScore ? C.green : C.white }}>{awayScore}</div>
        </div>
      </div>

      {actionMode === "selectAssist" && (
        <div style={{ textAlign: "center", padding: 8, background: `${C.accent}22`, borderRadius: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: C.white }}>
          <div>⚽ <b>{pendingGoalPlayer?.player}</b> 골! 어시스트 선수를 터치하세요</div>
          <button onClick={skipAssist} style={{ ...s.btnSm(C.grayDark), marginTop: 6 }}>어시 없음 (스킵)</button>
        </div>
      )}
      {actionMode === "selectScorer" && (
        <div style={{ textAlign: "center", padding: 8, background: `${C.green}22`, borderRadius: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: C.white }}>
          <div>👟 <b>{pendingAssistPlayer?.player}</b> 어시스트! 골 넣은 선수를 터치하세요</div>
        </div>
      )}

      {selectedPlayer && !actionMode && (
        <PlayerActionModal
          player={selectedPlayer.player}
          onGoal={handleGoal}
          onAssist={handleAssist}
          onOwnGoal={handleOwnGoal}
          onCancel={resetState}
          styles={s}
        />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {renderPlayerList(homePlayers, true, homeMercs, homeTeam, homeColor)}
        {renderPlayerList(awayPlayers, false, awayMercs, awayTeam, awayColor)}
      </div>

      {showMercPicker && (
        <div style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.orange }}>
            {showMercPicker === "home" ? homeTeam : awayTeam}에 선수 추가
          </div>
          {mercCandidates.length === 0 ? (
            <div style={{ fontSize: 12, color: C.gray }}>추가 가능한 선수가 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {mercCandidates.map(p => (
                <button key={p} onClick={() => addMerc(p, showMercPicker)}
                  style={{ ...s.btnSm(C.grayDarker, C.white), padding: "6px 10px" }}>
                  {p}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShowMercPicker(null)} style={{ ...s.btnSm(C.grayDark), marginTop: 8 }}>닫기</button>
        </div>
      )}

      <EventLog
        matchEvents={matchEvents} allEvents={allEvents} matchId={matchId}
        homePlayers={homePlayers} awayPlayers={awayPlayers}
        homeTeam={homeTeam} awayTeam={awayTeam}
        homeGk={homeGk} awayGk={awayGk}
        homeColor={homeColor} awayColor={awayColor}
        onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} styles={s}
      />
    </div>
  );
}

import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import EventLog from './EventLog';

/**
 * GK 선택 드롭다운 — 팀 소속 선수 + 외부 인원 (1스텝 GK 지정)
 * 외부 인원 선택 시 자동으로 용병 등록 + GK 지정
 */
function GkDropdown({ currentGk, teamPlayers, externalCandidates, opposingPlayers, onSelect, onSelectExternal, onClose, C, s }) {
  const [showOpponent, setShowOpponent] = useState(false);
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
      background: C.card, borderRadius: "0 0 10px 10px", padding: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)", border: `1px solid ${C.grayDark}`,
      borderTop: "none", maxHeight: 280, overflowY: "auto",
    }}>
      {/* 우리 선수 */}
      <div style={{ fontSize: 10, color: C.grayLight, fontWeight: 700, marginBottom: 4 }}>우리선수</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {teamPlayers.map(p => (
          <button key={p} onClick={() => { onSelect(p); onClose(); }}
            style={{
              ...s.btnSm(currentGk === p ? C.yellow : C.grayDarker, currentGk === p ? "#000" : C.white),
              padding: "6px 10px", fontSize: 12, fontWeight: currentGk === p ? 700 : 400,
            }}>
            {currentGk === p && "GK "}{p}
          </button>
        ))}
      </div>

      {/* 타팀선수 토글 */}
      {externalCandidates && externalCandidates.length > 0 && (
        <>
          <button onClick={() => setShowOpponent(v => !v)}
            style={{
              ...s.btnSm(C.grayDarker, C.orange),
              fontSize: 11, fontWeight: 700, marginTop: 8, width: "100%",
              border: `1px dashed ${C.orange}`,
            }}>
            {showOpponent ? "- 타팀선수 닫기" : "+ 타팀선수"}
          </button>
          {showOpponent && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {externalCandidates.map(p => {
                const isOpposing = opposingPlayers.includes(p);
                return (
                  <button key={p} onClick={() => { onSelectExternal(p); onClose(); }}
                    style={{
                      ...s.btnSm(C.grayDarker, C.orange),
                      padding: "6px 10px", fontSize: 12,
                      border: `1px dashed ${C.orange}`,
                    }}>
                    {p}{isOpposing ? "(상대팀)" : ""}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {currentGk && (
        <button onClick={() => { onSelect(null); onClose(); }}
          style={{ ...s.btnSm(C.redDim, "#fff"), marginTop: 6, fontSize: 10, width: "100%" }}>
          GK 해제
        </button>
      )}
    </div>
  );
}

/** 용병 선수 추가 피커 */
function MercPicker({ side, candidates, opposingPlayers, teamName, onAdd, onClose, C, s }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.orange }}>
        {teamName}에 선수 추가
      </div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: C.gray }}>추가 가능한 선수가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {candidates.map(p => {
            const isOpposing = opposingPlayers.includes(p);
            return (
              <button key={p} onClick={() => onAdd(p, side)}
                style={{
                  ...s.btnSm(C.grayDarker, isOpposing ? C.orange : C.white),
                  padding: "6px 10px",
                  border: isOpposing ? `1px dashed ${C.orange}` : "none",
                }}>
                {isOpposing && <span style={{ fontSize: 8, marginRight: 3 }}>상대</span>}
                {p}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={onClose} style={{ ...s.btnSm(C.grayDark), marginTop: 8 }}>닫기</button>
    </div>
  );
}

export default function CourtRecorder({ matchInfo, homePlayers: initHomePlayers, awayPlayers: initAwayPlayers, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinish, onMatchInfoUpdate, onGkChange, styles: s, courtLabel, attendees }) {
  const { C } = useTheme();
  const [actionMode, setActionMode] = useState(null);
  const [pendingGoalPlayer, setPendingGoalPlayer] = useState(null);
  const [homeGk, setHomeGk] = useState(matchInfo.homeGk || null);
  const [awayGk, setAwayGk] = useState(matchInfo.awayGk || null);
  const [mercs, setMercs] = useState([]);
  const [showMercPicker, setShowMercPicker] = useState(null);
  const [gkDropdown, setGkDropdown] = useState(null); // "home" | "away" | null

  const { homeIdx, awayIdx, matchId, homeTeam, awayTeam, homeColor, awayColor } = matchInfo;

  const homeMercs = mercs.filter(m => m.side === "home").map(m => m.player);
  const awayMercs = mercs.filter(m => m.side === "away").map(m => m.player);
  // 상대팀 용병으로 간 선수는 원래 팀 명단에서 제외
  const homePlayers = [...initHomePlayers.filter(p => !awayMercs.includes(p)), ...homeMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  const awayPlayers = [...initAwayPlayers.filter(p => !homeMercs.includes(p)), ...awayMercs].sort((a, b) => a.localeCompare(b, 'ko'));

  // 용병 후보: 해당 팀에 없는 모든 참석자 (상대팀 선수 포함)
  const getMercCandidates = (side) => {
    const myPlayers = side === "home" ? homePlayers : awayPlayers;
    return (attendees || []).filter(p => !myPlayers.includes(p));
  };

  const matchEvents = allEvents.filter(e => e.matchId === matchId);
  const homeScore = calcMatchScore(allEvents, matchId, homeTeam);
  const awayScore = calcMatchScore(allEvents, matchId, awayTeam);

  const checkGk = () => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return false; }
    return true;
  };

  /** 선수 이름 탭 — selectAssist/selectScorer 모드에서만 동작 */
  const handlePlayerTap = (player, isHome) => {
    if (actionMode === "selectAssist" && pendingGoalPlayer) {
      if (player === pendingGoalPlayer.player) return;
      // 같은 팀만 어시스트 가능
      if (isHome !== pendingGoalPlayer.isHome) return;
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
  };

  /** ⚽ 인라인 버튼 — 바로 어시 선택 모드 진입 */
  const handleInlineGoal = (player, isHome) => {
    if (!checkGk()) return;
    setPendingGoalPlayer({ player, isHome });
    setActionMode("selectAssist");
  };

  /** 🔴 인라인 버튼 — 즉시 자책골 기록 */
  const handleInlineOwnGoal = (player, isHome) => {
    if (!checkGk()) return;
    const ownTeam = isHome ? homeTeam : awayTeam;
    const scoringTeam = isHome ? awayTeam : homeTeam;
    const ownGk = isHome ? homeGk : awayGk;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player,
      team: ownTeam, scoringTeam, concedingTeam: ownTeam,
      concedingGk: ownGk, concedingGkLoss: 2,
      assist: null, homeTeam, awayTeam,
    });
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
    setActionMode(null);
    setPendingGoalPlayer(null);
  };

  const selectGk = (player, isHome) => {
    if (isHome) {
      setHomeGk(player);
      if (onGkChange) onGkChange(matchInfo.homeIdx, player);
    } else {
      setAwayGk(player);
      if (onGkChange) onGkChange(matchInfo.awayIdx, player);
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
    return { ...s.matchBtn(color), width: "100%", marginBottom: 4, transition: "all 0.15s", ...extra };
  };

  // GK 드롭다운 버튼 스타일
  const gkBtnStyle = (gk, teamColor, side) => ({
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
    padding: "6px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: "none", transition: "all 0.15s",
    background: gk ? `${teamColor?.bg || C.accent}22` : `${C.red}22`,
    color: gk ? C.white : C.red,
  });

  /** 인라인 액션 버튼 */
  const inlineBtnStyle = (color) => ({
    border: "none", borderRadius: 6, padding: "6px 8px", fontSize: 12,
    fontWeight: 700, cursor: "pointer", lineHeight: 1,
    background: `${color}30`, color,
    transition: "background 0.1s", whiteSpace: "nowrap",
  });

  // selectAssist/selectScorer 모드에서는 인라인 버튼 숨김
  const showInlineButtons = !actionMode;

  const renderPlayerList = (players, isHome, mercsArr, teamName, color) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: C.gray, textAlign: "center", marginBottom: 4 }}>{teamName}</div>
      {players.map(p => {
        const isMerc = mercsArr.includes(p);
        const isGk = (isHome ? homeGk : awayGk) === p;
        return (
          <div key={p} style={{ display: "flex", gap: 3, marginBottom: 3, alignItems: "center" }}>
            <button onClick={() => handlePlayerTap(p, isHome)} style={{ ...getPlayerStyle(p, isHome), flex: 1, marginBottom: 0, minWidth: 0 }}>
              {isGk && <span style={{ marginRight: 3, fontSize: 9, opacity: 0.8 }}>GK</span>}
              {isMerc && <span style={{ marginRight: 2, fontSize: 8, color: C.orange }}>용</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
            </button>
            {showInlineButtons && (
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                <button onClick={() => handleInlineGoal(p, isHome)} style={inlineBtnStyle(C.green)}>⚽</button>
                <button onClick={() => handleInlineOwnGoal(p, isHome)} style={inlineBtnStyle(C.red)}>자책</button>
              </div>
            )}
            {isMerc && (
              <button onClick={() => removeMerc(p)}
                style={{ ...s.btnSm(C.redDim), padding: "2px 4px", fontSize: 8, minWidth: 16, flexShrink: 0 }}>X</button>
            )}
          </div>
        );
      })}
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

      {/* GK 선택 영역 — 스코어보드 바로 아래 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, position: "relative" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <button
            onClick={() => setGkDropdown(gkDropdown === "home" ? null : "home")}
            style={gkBtnStyle(homeGk, homeColor, "home")}
          >
            <span>{homeGk ? `GK ${homeGk}` : "GK 선택"}</span>
            <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
          </button>
          {gkDropdown === "home" && (
            <GkDropdown
              currentGk={homeGk}
              teamPlayers={homePlayers}
              externalCandidates={getMercCandidates("home")}
              opposingPlayers={awayPlayers}
              onSelect={(p) => selectGk(p, true)}
              onSelectExternal={(p) => { addMerc(p, "home"); selectGk(p, true); }}
              onClose={() => setGkDropdown(null)}
              C={C} s={s}
            />
          )}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <button
            onClick={() => setGkDropdown(gkDropdown === "away" ? null : "away")}
            style={gkBtnStyle(awayGk, awayColor, "away")}
          >
            <span>{awayGk ? `GK ${awayGk}` : "GK 선택"}</span>
            <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
          </button>
          {gkDropdown === "away" && (
            <GkDropdown
              currentGk={awayGk}
              teamPlayers={awayPlayers}
              externalCandidates={getMercCandidates("away")}
              opposingPlayers={homePlayers}
              onSelect={(p) => selectGk(p, false)}
              onSelectExternal={(p) => { addMerc(p, "away"); selectGk(p, false); }}
              onClose={() => setGkDropdown(null)}
              C={C} s={s}
            />
          )}
        </div>
      </div>

      {/* 드롭다운 열려있을 때 배경 클릭으로 닫기 */}
      {gkDropdown && (
        <div onClick={() => setGkDropdown(null)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} />
      )}

      {actionMode === "selectAssist" && (
        <div style={{ textAlign: "center", padding: 8, background: `${C.accent}22`, borderRadius: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: C.white }}>
          <div>⚽ <b>{pendingGoalPlayer?.player}</b> 골! 같은 팀 선수를 터치하세요</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
            <button onClick={skipAssist} style={{ ...s.btnSm(C.grayDark), fontSize: 12 }}>단독골 (어시 없음)</button>
            <button onClick={resetState} style={{ ...s.btnSm(C.redDim), fontSize: 12 }}>취소</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {renderPlayerList(homePlayers, true, homeMercs, homeTeam, homeColor)}
        {renderPlayerList(awayPlayers, false, awayMercs, awayTeam, awayColor)}
      </div>

      {/* 선수추가 버튼 — 양팀 정렬 */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={() => setShowMercPicker("home")}
          style={{ ...s.btnSm(C.grayDark, C.orange), flex: 1, fontSize: 11 }}>+ 선수추가</button>
        <button onClick={() => setShowMercPicker("away")}
          style={{ ...s.btnSm(C.grayDark, C.orange), flex: 1, fontSize: 11 }}>+ 선수추가</button>
      </div>

      {showMercPicker && (
        <MercPicker
          side={showMercPicker}
          candidates={getMercCandidates(showMercPicker)}
          opposingPlayers={showMercPicker === "home" ? awayPlayers : homePlayers}
          teamName={showMercPicker === "home" ? homeTeam : awayTeam}
          onAdd={addMerc} onClose={() => setShowMercPicker(null)}
          C={C} s={s}
        />
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

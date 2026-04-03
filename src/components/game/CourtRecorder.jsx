import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { isSpeechSupported, startListening, parseVoiceText, fuzzyMatchPlayer } from '../../utils/speechRecord';
import EventLog from './EventLog';

function MercPicker({ side, candidates, opposingPlayers, teamName, onAdd, onClose, C, s }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.orange }}>{teamName}에 선수 추가</div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: C.gray }}>추가 가능한 선수가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {[...candidates].sort((a, b) => {
            const aOpp = opposingPlayers.includes(a) ? 1 : 0;
            const bOpp = opposingPlayers.includes(b) ? 1 : 0;
            if (aOpp !== bOpp) return aOpp - bOpp;
            return a.localeCompare(b, 'ko');
          }).map(p => {
            const isOpposing = opposingPlayers.includes(p);
            return (
              <button key={p} onClick={() => onAdd(p, side)}
                style={{ ...s.btnSm(C.grayDarker, isOpposing ? C.orange : C.white), padding: "6px 10px", border: isOpposing ? `1px dashed ${C.orange}` : "none" }}>
                {isOpposing && <span style={{ fontSize: 8, marginRight: 3 }}>상대</span>}{p}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={onClose} style={{ ...s.btnSm(C.grayDark), marginTop: 8 }}>닫기</button>
    </div>
  );
}

export default function CourtRecorder({ matchInfo, homePlayers: initHomePlayers, awayPlayers: initAwayPlayers, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinish, onMatchInfoUpdate, onGkChange, styles: s, courtLabel, attendees, readOnly }) {
  const { C } = useTheme();
  const [pendingGoalPlayer, setPendingGoalPlayer] = useState(null);
  const [homeGk, setHomeGk] = useState(matchInfo.homeGk || null);
  const [awayGk, setAwayGk] = useState(matchInfo.awayGk || null);
  const [mercs, setMercs] = useState([]);
  const [showMercPicker, setShowMercPicker] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState(null);
  const [speechRef, setSpeechRef] = useState(null);

  const { homeIdx, awayIdx, matchId, homeTeam, awayTeam, homeColor, awayColor } = matchInfo;

  const homeMercs = mercs.filter(m => m.side === "home").map(m => m.player);
  const awayMercs = mercs.filter(m => m.side === "away").map(m => m.player);
  const homePlayers = [...initHomePlayers.filter(p => !awayMercs.includes(p)), ...homeMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  const awayPlayers = [...initAwayPlayers.filter(p => !homeMercs.includes(p)), ...awayMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  const allPlayerNames = [...homePlayers, ...awayPlayers];

  const getMercCandidates = (side) => {
    const myPlayers = side === "home" ? homePlayers : awayPlayers;
    return (attendees || []).filter(p => !myPlayers.includes(p));
  };

  const matchEvents = allEvents.filter(e => e.matchId === matchId);
  const homeScore = calcMatchScore(allEvents, matchId, homeTeam);
  const awayScore = calcMatchScore(allEvents, matchId, awayTeam);

  const readOnlyAlert = () => alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요.");

  const checkGk = () => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return false; }
    return true;
  };

  const isPlayerHome = (player) => homePlayers.includes(player);

  // ── GK 토글 ──
  const toggleGk = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    const currentGk = isHome ? homeGk : awayGk;
    const newGk = currentGk === player ? null : player;
    if (isHome) { setHomeGk(newGk); } else { setAwayGk(newGk); }
    if (onGkChange) onGkChange(isHome ? homeIdx : awayIdx, newGk);
  };

  // ── 골 기록 (터치) ──
  const handleGoalTap = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!checkGk()) return;
    setPendingGoalPlayer({ player, isHome });
  };

  const handleAssistSelect = (assistPlayer) => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: gp.player, assist: assistPlayer,
      team: gp.isHome ? homeTeam : awayTeam, scoringTeam: gp.isHome ? homeTeam : awayTeam,
      concedingTeam: gp.isHome ? awayTeam : homeTeam, concedingGk: gp.isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
    setPendingGoalPlayer(null);
  };

  const handleNoAssist = () => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: gp.player, assist: null,
      team: gp.isHome ? homeTeam : awayTeam, scoringTeam: gp.isHome ? homeTeam : awayTeam,
      concedingTeam: gp.isHome ? awayTeam : homeTeam, concedingGk: gp.isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
    setPendingGoalPlayer(null);
  };

  const handleOwnGoalFromInline = () => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    const ownTeam = gp.isHome ? homeTeam : awayTeam;
    const scoringTeam = gp.isHome ? awayTeam : homeTeam;
    const ownGk = gp.isHome ? homeGk : awayGk;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player: gp.player,
      team: ownTeam, scoringTeam, concedingTeam: ownTeam,
      concedingGk: ownGk, concedingGkLoss: 2, assist: null, homeTeam, awayTeam,
    });
    setPendingGoalPlayer(null);
  };

  // ── 음성 기록 ──
  const recordGoalEvent = (scorer, assist) => {
    const isHome = isPlayerHome(scorer);
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: scorer, assist: assist || null,
      team: isHome ? homeTeam : awayTeam, scoringTeam: isHome ? homeTeam : awayTeam,
      concedingTeam: isHome ? awayTeam : homeTeam, concedingGk: isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
  };

  const recordOwnGoalEvent = (player) => {
    const isHome = isPlayerHome(player);
    const ownTeam = isHome ? homeTeam : awayTeam;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player,
      team: ownTeam, scoringTeam: isHome ? awayTeam : homeTeam, concedingTeam: ownTeam,
      concedingGk: isHome ? homeGk : awayGk, concedingGkLoss: 2, assist: null, homeTeam, awayTeam,
    });
  };

  const handleVoiceStart = () => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!checkGk()) return;
    if (!isSpeechSupported()) { alert("이 브라우저에서는 음성 인식이 지원되지 않습니다."); return; }
    setVoiceResult(null);
    setIsListening(true);
    const { recognition, promise } = startListening();
    setSpeechRef(recognition);
    promise.then(text => {
      setIsListening(false);
      setSpeechRef(null);
      if (!text) return;
      const parsed = parseVoiceText(text, allPlayerNames);
      if (!parsed.type) {
        setVoiceResult({ text, error: "인식 실패: 골/어시/자책을 구분할 수 없습니다" });
        return;
      }
      let scorer = parsed.scorer;
      let assist = parsed.assist;
      if (scorer) {
        const candidates = fuzzyMatchPlayer(scorer, allPlayerNames);
        if (candidates.length === 0) { setVoiceResult({ text, error: `"${scorer}" 선수를 찾을 수 없습니다` }); return; }
        if (candidates.length > 1) { setVoiceResult({ text, ambiguous: { field: "scorer", candidates, parsed, text } }); return; }
        scorer = candidates[0];
      }
      if (assist) {
        const candidates = fuzzyMatchPlayer(assist, allPlayerNames);
        if (candidates.length === 0) { setVoiceResult({ text, error: `"${assist}" 선수를 찾을 수 없습니다` }); return; }
        if (candidates.length > 1) { setVoiceResult({ text, ambiguous: { field: "assist", candidates, parsed: { ...parsed, scorer }, text } }); return; }
        assist = candidates[0];
      }
      if (!scorer) { setVoiceResult({ text, error: "골 선수를 인식할 수 없습니다" }); return; }
      if (parsed.type === "owngoal") { recordOwnGoalEvent(scorer); }
      else { recordGoalEvent(scorer, assist); }
      setVoiceResult({ text, success: true, scorer, assist, type: parsed.type });
    }).catch(err => {
      setIsListening(false);
      setSpeechRef(null);
      if (err.message !== "aborted") setVoiceResult({ text: "", error: "음성 인식 오류: " + err.message });
    });
  };

  const handleVoiceEnd = () => {
    if (speechRef) { try { speechRef.stop(); } catch (e) { /* ignore */ } }
  };

  const handleAmbiguousSelect = (player) => {
    if (!voiceResult?.ambiguous) return;
    const { field, parsed } = voiceResult.ambiguous;
    let scorer = parsed.scorer;
    let assist = parsed.assist;
    if (field === "scorer") scorer = player;
    else assist = player;
    if (typeof scorer === "string" && !allPlayerNames.includes(scorer)) {
      const m = fuzzyMatchPlayer(scorer, allPlayerNames);
      scorer = m.length === 1 ? m[0] : null;
    }
    if (scorer) {
      if (parsed.type === "owngoal") recordOwnGoalEvent(scorer);
      else recordGoalEvent(scorer, assist);
    }
    setVoiceResult(null);
  };

  const addMerc = (player, side) => { setMercs(prev => [...prev, { player, side }]); setShowMercPicker(null); };
  const removeMerc = (player) => { setMercs(prev => prev.filter(m => m.player !== player)); };

  const renderPlayerRow = (player, isHome, mercsArr) => {
    const isMerc = mercsArr.includes(player);
    const isGk = (isHome ? homeGk : awayGk) === player;
    const color = isHome ? homeColor : awayColor;
    const isPendingGoal = pendingGoalPlayer?.player === player;
    const isPendingAssistMode = pendingGoalPlayer && !isPendingGoal && pendingGoalPlayer.isHome === isHome;

    return (
      <div key={player} style={{ marginBottom: 3 }}>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <button onClick={() => toggleGk(player, isHome)}
            style={{
              border: "none", borderRadius: 6, padding: "6px 6px", fontSize: 10, fontWeight: 700,
              cursor: "pointer", minWidth: 32, flexShrink: 0,
              background: isGk ? (C.yellow + "33") : C.grayDarker,
              color: isGk ? C.yellow : C.grayLight,
            }}>
            GK
          </button>
          <div style={{
            ...s.matchBtn(color), flex: 1, marginBottom: 0, minWidth: 0,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
          }}>
            {isMerc && <span style={{ fontSize: 8, color: C.orange }}>용</span>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player}</span>
            {isMerc && (
              <span onClick={(e) => { e.stopPropagation(); removeMerc(player); }}
                style={{ fontSize: 9, color: C.red, fontWeight: 700, cursor: "pointer", marginLeft: 2 }}>✕</span>
            )}
          </div>
          {!readOnly && (
            <button onClick={() => handleGoalTap(player, isHome)}
              style={{
                border: "none", borderRadius: 6, padding: "6px 8px", fontSize: 12,
                fontWeight: 700, cursor: "pointer", background: `${C.green}30`, color: C.green,
                flexShrink: 0,
              }}>⚽</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...s.card, border: `1px solid ${C.grayDark}`, position: "relative" }}>

      {/* 어시 선택 모달 */}
      {pendingGoalPlayer && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }} onClick={() => setPendingGoalPlayer(null)}>
          <div style={{
            background: C.card, borderRadius: 16, padding: 20, maxWidth: 360, width: "100%",
            maxHeight: "80vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>
                ⚽ {pendingGoalPlayer.player} 골!
              </div>
              <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>어시스트 선수를 선택하세요</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(pendingGoalPlayer.isHome ? homePlayers : awayPlayers).filter(p => p !== pendingGoalPlayer.player).map(p => (
                <button key={p} onClick={() => handleAssistSelect(p)}
                  style={{
                    border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14,
                    fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white,
                    textAlign: "center",
                  }}>{p}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={handleNoAssist}
                style={{ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: C.grayDark, color: C.gray }}>
                어시없음
              </button>
              <button onClick={handleOwnGoalFromInline}
                style={{ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: `${C.red}30`, color: C.red }}>
                자책골
              </button>
            </div>
            <button onClick={() => setPendingGoalPlayer(null)}
              style={{ width: "100%", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: `${C.grayDarker}`, color: C.grayLight, marginTop: 8 }}>
              취소
            </button>
          </div>
        </div>
      )}

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

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.gray, textAlign: "center", marginBottom: 4 }}>{homeTeam}</div>
          {homePlayers.map(p => renderPlayerRow(p, true, homeMercs))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.gray, textAlign: "center", marginBottom: 4 }}>{awayTeam}</div>
          {awayPlayers.map(p => renderPlayerRow(p, false, awayMercs))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={() => setShowMercPicker("home")} style={{ ...s.btnSm(C.grayDark, C.orange), flex: 1, fontSize: 11 }}>+ 선수추가</button>
        <button onClick={() => setShowMercPicker("away")} style={{ ...s.btnSm(C.grayDark, C.orange), flex: 1, fontSize: 11 }}>+ 선수추가</button>
      </div>

      {showMercPicker && (
        <MercPicker side={showMercPicker} candidates={getMercCandidates(showMercPicker)}
          opposingPlayers={showMercPicker === "home" ? awayPlayers : homePlayers}
          teamName={showMercPicker === "home" ? homeTeam : awayTeam}
          onAdd={addMerc} onClose={() => setShowMercPicker(null)} C={C} s={s} />
      )}

      {!readOnly && isSpeechSupported() && (
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <button
            onTouchStart={handleVoiceStart} onTouchEnd={handleVoiceEnd}
            onMouseDown={handleVoiceStart} onMouseUp={handleVoiceEnd}
            style={{
              border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", width: "100%",
              background: isListening ? `${C.red}30` : `${C.accent}20`,
              color: isListening ? C.red : C.accent,
              transition: "all 0.15s",
            }}>
            {isListening ? "🎤 듣는 중..." : "🎤 꾹 눌러서 말하기"}
          </button>
        </div>
      )}

      {voiceResult && (
        <div style={{ marginTop: 6, padding: 8, borderRadius: 8, fontSize: 12,
          background: voiceResult.error ? `${C.red}15` : voiceResult.ambiguous ? `${C.orange}15` : `${C.green}15`,
          color: voiceResult.error ? C.red : voiceResult.ambiguous ? C.orange : C.green,
        }}>
          {voiceResult.error && <div>{voiceResult.error}</div>}
          {voiceResult.success && (
            <div>
              {voiceResult.type === "owngoal" ? "🔴" : "⚽"} {voiceResult.scorer}
              {voiceResult.type === "goal" && voiceResult.assist ? ` ← ${voiceResult.assist}(어시)` : ""}
              {voiceResult.type === "goal" && !voiceResult.assist ? " (단독골)" : ""}
              {voiceResult.type === "owngoal" ? " (자책골)" : ""}
            </div>
          )}
          {voiceResult.ambiguous && (
            <div>
              <div style={{ marginBottom: 4 }}>"{voiceResult.text}" — 선수를 선택하세요:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {voiceResult.ambiguous.candidates.map(p => (
                  <button key={p} onClick={() => handleAmbiguousSelect(p)}
                    style={{ ...s.btnSm(C.grayDarker, C.white), padding: "4px 10px", fontSize: 12 }}>{p}</button>
                ))}
                <button onClick={() => setVoiceResult(null)}
                  style={{ ...s.btnSm(C.redDim, C.white), padding: "4px 10px", fontSize: 12 }}>취소</button>
              </div>
            </div>
          )}
          {voiceResult.text && !voiceResult.ambiguous && (
            <div style={{ fontSize: 10, color: C.grayLight, marginTop: 2 }}>인식: "{voiceResult.text}"</div>
          )}
        </div>
      )}

      <EventLog
        matchEvents={matchEvents} allEvents={allEvents} matchId={matchId}
        homePlayers={homePlayers} awayPlayers={awayPlayers}
        homeTeam={homeTeam} awayTeam={awayTeam}
        homeGk={homeGk} awayGk={awayGk}
        homeColor={homeColor} awayColor={awayColor}
        onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} styles={s} readOnly={readOnly}
      />
    </div>
  );
}

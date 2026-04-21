import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { isSpeechSupported, startListening, parseVoiceText, fuzzyMatchPlayer } from '../../utils/speechRecord';
import { MicIcon, XIcon, PlusIcon, GloveIcon } from '../common/icons';
import EventLog from './EventLog';

function MercPicker({ side, candidates, opposingPlayers, teamName, onAdd, onClose }) {
  return (
    <div style={{
      background: "var(--app-bg-row)", borderRadius: 12, padding: 14, marginTop: 10,
      border: "0.5px solid var(--app-divider)",
    }}>
      <div style={{ fontSize: 13, marginBottom: 10, color: "var(--app-orange)", fontWeight: 500 }}>
        + {teamName}에 추가
      </div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>추가 가능한 선수가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[...candidates].sort((a, b) => {
            const aOpp = opposingPlayers.includes(a) ? 1 : 0;
            const bOpp = opposingPlayers.includes(b) ? 1 : 0;
            if (aOpp !== bOpp) return aOpp - bOpp;
            return a.localeCompare(b, 'ko');
          }).map(p => {
            const isOpposing = opposingPlayers.includes(p);
            return (
              <button key={p} onClick={() => onAdd(p, side)} style={{
                padding: "6px 10px", borderRadius: 999,
                background: isOpposing ? "rgba(255,149,0,0.12)" : "var(--app-bg-row-hover)",
                color:      isOpposing ? "var(--app-orange)"   : "var(--app-text-primary)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {isOpposing && <span style={{
                  fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 4,
                  background: "rgba(255,149,0,0.2)",
                }}>용병</span>}
                {p}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={onClose} style={{
        marginTop: 10, padding: "6px 12px", borderRadius: 999,
        background: "transparent", color: "var(--app-text-secondary)",
        border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
      }}>닫기</button>
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
  const [interimText, setInterimText] = useState("");
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
    setInterimText("");
    setIsListening(true);
    const { recognition, promise } = startListening((text) => setInterimText(text));
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

  const renderPlayerCard = (player, isHome) => {
    const mercsArr = isHome ? homeMercs : awayMercs;
    const isMerc = mercsArr.includes(player);
    const isGk = (isHome ? homeGk : awayGk) === player;
    const color = isHome ? homeColor : awayColor;

    return (
      <div key={player} style={{ position: "relative" }}>
        <button
          onClick={() => handleGoalTap(player, isHome)}
          onContextMenu={(e) => { e.preventDefault(); toggleGk(player, isHome); }}
          aria-label={`${player} 골 기록 (길게 눌러 GK 지정)`}
          style={{
            width: "100%",
            background: isGk ? "rgba(0,122,255,0.12)" : "var(--app-bg-row-hover)",
            color: isGk ? "var(--app-blue)" : "var(--app-text-primary)",
            border: isGk ? "0.5px solid var(--app-blue)" : "0.5px solid transparent",
            borderLeft: isGk ? "0.5px solid var(--app-blue)" : `3px solid ${color?.bg || "transparent"}`,
            borderRadius: 10,
            padding: "12px 8px", minHeight: 56,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 2, cursor: "pointer", fontFamily: "inherit",
            fontSize: 14, fontWeight: 500,
            position: "relative",
          }}
        >
          {isGk && (
            <span style={{
              position: "absolute", top: 4, right: 6,
              fontSize: 10, fontWeight: 600,
              color: "var(--app-blue)",
            }}>GK</span>
          )}
          {isMerc && (
            <span style={{
              position: "absolute", top: 4, left: 6,
              fontSize: 9, fontWeight: 600,
              padding: "1px 4px", borderRadius: 3,
              background: "rgba(255,149,0,0.2)", color: "var(--app-orange)",
              letterSpacing: 0,
            }}>용병</span>
          )}
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
          }}>{player}</span>
        </button>
        {isMerc && !readOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); removeMerc(player); }}
            aria-label="용병 제거"
            style={{
              position: "absolute", bottom: 4, right: 4,
              width: 18, height: 18, borderRadius: 999,
              background: "rgba(255,59,48,0.15)", color: "var(--app-red)",
              border: "none", cursor: "pointer", padding: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <XIcon width={9} color="var(--app-red)" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: "var(--app-bg-row)", borderRadius: 14, padding: 14,
      border: "0.5px solid var(--app-divider)",
      position: "relative",
    }}>

      {/* 골/어시 선택 — 바텀 시트 */}
      {pendingGoalPlayer && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={() => setPendingGoalPlayer(null)}>
          <div style={{
            background: "var(--app-bg-elevated)", width: "100%", maxWidth: 500,
            borderTopLeftRadius: 14, borderTopRightRadius: 14,
            padding: "10px 20px 24px",
            maxHeight: "80vh", overflowY: "auto",
            boxShadow: "var(--app-shadow-lg)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 12px" }}>
              <div style={{ width: 36, height: 5, borderRadius: 3, background: "var(--app-gray-4)" }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, color: "var(--app-blue)", fontWeight: 600, letterSpacing: "0.02em",
                marginBottom: 4,
              }}>GOAL</div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.022em",
                            lineHeight: 1.2, color: "var(--app-text-primary)" }}>
                {pendingGoalPlayer.player}
              </div>
              <div style={{ fontSize: 14, color: "var(--app-text-secondary)", marginTop: 4 }}>
                어시스트 선수를 선택하세요.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {(pendingGoalPlayer.isHome ? homePlayers : awayPlayers).filter(p => p !== pendingGoalPlayer.player).map(p => (
                <button key={p} onClick={() => handleAssistSelect(p)} style={{
                  padding: "12px 12px", borderRadius: 10,
                  background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
                  fontSize: 15, fontWeight: 500,
                  color: "var(--app-text-primary)", cursor: "pointer", fontFamily: "inherit",
                }}>{p}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleNoAssist} style={{
                flex: 1, padding: "12px 0", borderRadius: 10,
                background: "var(--app-bg-row-hover)", border: "none",
                fontSize: 14, fontWeight: 500, color: "var(--app-text-secondary)",
                cursor: "pointer", fontFamily: "inherit",
              }}>어시 없음</button>
              <button onClick={handleOwnGoalFromInline} style={{
                flex: 1, padding: "12px 0", borderRadius: 10,
                background: "rgba(255,59,48,0.1)", border: "none",
                fontSize: 14, fontWeight: 500, color: "var(--app-red)",
                cursor: "pointer", fontFamily: "inherit",
              }}>자책골</button>
            </div>
            <button onClick={() => setPendingGoalPlayer(null)} style={{
              width: "100%", padding: "12px 0", borderRadius: 10,
              background: "transparent", border: "none",
              fontSize: 14, color: "var(--app-text-tertiary)",
              cursor: "pointer", marginTop: 8, fontFamily: "inherit",
            }}>취소</button>
          </div>
        </div>
      )}

      {courtLabel && (
        <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 8, textAlign: "center", fontWeight: 500 }}>
          {courtLabel}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center", gap: 12, padding: "12px 0 16px",
      }}>
        <div style={{ textAlign: "center", opacity: homeScore < awayScore ? 0.5 : 1, transition: "opacity .2s" }}>
          <div style={{
            fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: homeColor?.bg }} />
            {homeTeam}
          </div>
          <div style={{
            fontSize: 52, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums", color: "var(--app-text-primary)", marginTop: 2,
          }}>{homeScore}</div>
          {homeGk && (
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 4,
                          display: "inline-flex", alignItems: "center", gap: 4 }}>
              <GloveIcon width={11} color="var(--app-text-tertiary)" />
              {homeGk}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-tertiary)", paddingBottom: 10 }}>VS</div>
        <div style={{ textAlign: "center", opacity: awayScore < homeScore ? 0.5 : 1, transition: "opacity .2s" }}>
          <div style={{
            fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: awayColor?.bg }} />
            {awayTeam}
          </div>
          <div style={{
            fontSize: 52, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums", color: "var(--app-text-primary)", marginTop: 2,
          }}>{awayScore}</div>
          {awayGk && (
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 4,
                          display: "inline-flex", alignItems: "center", gap: 4 }}>
              <GloveIcon width={11} color="var(--app-text-tertiary)" />
              {awayGk}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)",
          marginLeft: 4, marginBottom: 6,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: homeColor?.bg }} />
          {homeTeam}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))",
          gap: 8, marginBottom: 14,
        }}>
          {homePlayers.map(p => renderPlayerCard(p, true))}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)",
          marginLeft: 4, marginBottom: 6,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: awayColor?.bg }} />
          {awayTeam}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))",
          gap: 8,
        }}>
          {awayPlayers.map(p => renderPlayerCard(p, false))}
        </div>
      </div>

      {!readOnly && (
        <div style={{
          fontSize: 11, color: "var(--app-text-tertiary)", textAlign: "center",
          marginTop: 10, letterSpacing: "-0.01em",
        }}>
          탭해서 골 기록 · 길게 눌러 GK 지정
        </div>
      )}

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => setShowMercPicker("home")} style={{
            flex: 1, background: "rgba(255,149,0,0.12)",
            border: "none", borderRadius: 10,
            padding: "10px", fontSize: 13, fontWeight: 500,
            color: "var(--app-orange)", cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}><PlusIcon width={13} color="var(--app-orange)" /> {homeTeam} 용병</button>
          <button onClick={() => setShowMercPicker("away")} style={{
            flex: 1, background: "rgba(255,149,0,0.12)",
            border: "none", borderRadius: 10,
            padding: "10px", fontSize: 13, fontWeight: 500,
            color: "var(--app-orange)", cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}><PlusIcon width={13} color="var(--app-orange)" /> {awayTeam} 용병</button>
        </div>
      )}

      {!readOnly && showMercPicker && (
        <MercPicker side={showMercPicker} candidates={getMercCandidates(showMercPicker)}
          opposingPlayers={showMercPicker === "home" ? awayPlayers : homePlayers}
          teamName={showMercPicker === "home" ? homeTeam : awayTeam}
          onAdd={addMerc} onClose={() => setShowMercPicker(null)} />
      )}

      {!readOnly && isSpeechSupported() && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <button
            onTouchStart={handleVoiceStart} onTouchEnd={handleVoiceEnd}
            onMouseDown={handleVoiceStart} onMouseUp={handleVoiceEnd}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: 12,
              background: isListening ? "var(--app-red)" : "var(--app-blue)",
              color: "#fff", border: "none",
              fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em",
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s",
            }}>
            <MicIcon width={18} color="#fff" />
            {isListening ? "듣는 중…" : "꾹 눌러서 음성으로 기록"}
          </button>
          {isListening && interimText && (
            <div style={{ marginTop: 8, fontSize: 14, color: "var(--app-text-secondary)", fontStyle: "italic" }}>
              "{interimText}"
            </div>
          )}
        </div>
      )}

      {voiceResult && (
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 10, fontSize: 13,
          background: voiceResult.error ? "rgba(255,59,48,0.1)"
                    : voiceResult.ambiguous ? "rgba(255,149,0,0.1)"
                    : "rgba(52,199,89,0.1)",
          color:      voiceResult.error ? "var(--app-red)"
                    : voiceResult.ambiguous ? "var(--app-orange)"
                    : "var(--app-green)",
          border: `0.5px solid ${voiceResult.error ? "rgba(255,59,48,0.3)" : voiceResult.ambiguous ? "rgba(255,149,0,0.3)" : "rgba(52,199,89,0.3)"}`,
        }}>
          {voiceResult.error && <div>{voiceResult.error}</div>}
          {voiceResult.success && (
            <div style={{ fontWeight: 500 }}>
              {voiceResult.scorer}
              {voiceResult.type === "goal" && voiceResult.assist ? ` ← ${voiceResult.assist}(어시)` : ""}
              {voiceResult.type === "goal" && !voiceResult.assist ? " (단독골)" : ""}
              {voiceResult.type === "owngoal" ? " (자책골)" : ""}
            </div>
          )}
          {voiceResult.ambiguous && (
            <div>
              <div style={{ marginBottom: 6 }}>"{voiceResult.text}" — 선수를 선택하세요:</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {voiceResult.ambiguous.candidates.map(p => (
                  <button key={p} onClick={() => handleAmbiguousSelect(p)} style={{
                    padding: "4px 10px", borderRadius: 999,
                    background: "var(--app-bg-row)", color: "var(--app-text-primary)",
                    border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                    fontFamily: "inherit",
                  }}>{p}</button>
                ))}
                <button onClick={() => setVoiceResult(null)} style={{
                  padding: "4px 10px", borderRadius: 999,
                  background: "rgba(255,59,48,0.12)", color: "var(--app-red)",
                  border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit",
                }}>취소</button>
              </div>
            </div>
          )}
          {voiceResult.text && !voiceResult.ambiguous && (
            <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>
              인식: "{voiceResult.text}"
            </div>
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

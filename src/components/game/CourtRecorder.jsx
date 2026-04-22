import { useState, useEffect, useMemo } from 'react';
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
                {p}
                {isOpposing && <span style={{
                  fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 4,
                  background: "rgba(255,149,0,0.2)",
                }}>상대팀</span>}
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

const popoverBtn = (tone = "neutral", disabled = false, active = false) => {
  const toneMap = {
    neutral: { bg: "var(--app-bg-row)", fg: "var(--app-text-primary)" },
    green:   { bg: "rgba(52,199,89,0.18)", fg: "var(--app-green)" },
    blue:    { bg: "rgba(0,122,255,0.18)", fg: "var(--app-blue)" },
    red:     { bg: "rgba(255,59,48,0.14)", fg: "var(--app-red)" },
    ghost:   { bg: "transparent", fg: "var(--app-text-tertiary)" },
  };
  const t = toneMap[tone] || toneMap.neutral;
  return {
    padding: "8px 10px", borderRadius: 8,
    background: t.bg, color: t.fg,
    border: active ? `0.5px solid ${t.fg}` : "0.5px solid transparent",
    fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    fontFamily: "inherit",
    flex: 1, minWidth: 0,
    whiteSpace: "nowrap",
  };
};

export default function CourtRecorder({ matchInfo, homePlayers: initHomePlayers, awayPlayers: initAwayPlayers, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinish, onMatchInfoUpdate, onGkChange, styles: s, courtLabel, attendees, readOnly, compose, setCompose }) {
  const { C } = useTheme();
  const [homeGk, setHomeGk] = useState(matchInfo.homeGk || null);
  const [awayGk, setAwayGk] = useState(matchInfo.awayGk || null);
  const [mercs, setMercs] = useState([]);
  const [showMercPicker, setShowMercPicker] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [voiceResult, setVoiceResult] = useState(null);
  const [speechRef, setSpeechRef] = useState(null);
  const [openPopover, setOpenPopover] = useState(null); // { player, isHome }

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

  const myCompose = compose && compose.pitchId === matchId ? compose : null;

  const playerStats = useMemo(() => {
    const stats = {};
    matchEvents.forEach(e => {
      if (e.type === "goal") {
        if (!stats[e.player]) stats[e.player] = { g: 0, a: 0 };
        stats[e.player].g += 1;
        if (e.assist) {
          if (!stats[e.assist]) stats[e.assist] = { g: 0, a: 0 };
          stats[e.assist].a += 1;
        }
      }
    });
    return stats;
  }, [matchEvents]);

  useEffect(() => {
    if (!openPopover) return;
    const handler = (e) => {
      if (!e.target.closest || !e.target.closest('[data-popover-region="1"]')) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [openPopover]);

  const readOnlyAlert = () => alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요.");

  const checkGk = () => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return false; }
    return true;
  };

  const isPlayerHome = (player) => homePlayers.includes(player);

  const toggleGk = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    const currentGk = isHome ? homeGk : awayGk;
    const newGk = currentGk === player ? null : player;
    if (isHome) { setHomeGk(newGk); } else { setAwayGk(newGk); }
    if (onGkChange) onGkChange(isHome ? homeIdx : awayIdx, newGk);
  };

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

  // ── 역할 조작 ──
  const applyGoalRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (myCompose?.scorer === player) { setCompose(null); return; }
    setCompose({ pitchId: matchId, scorer: player, scorerIsHome: isHome, assist: null });
  };

  const applyAssistRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!myCompose || !myCompose.scorer) return;
    if (myCompose.scorerIsHome !== isHome) return;
    if (myCompose.scorer === player) return;
    if (!checkGk()) return;
    recordGoalEvent(myCompose.scorer, player);
    setCompose(null);
  };

  const applyOwnGoalRole = (player) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!checkGk()) return;
    recordOwnGoalEvent(player);
  };

  const saveSolo = () => {
    if (!myCompose || !myCompose.scorer) return;
    if (!checkGk()) return;
    recordGoalEvent(myCompose.scorer, null);
    setCompose(null);
  };

  const cancelCompose = () => setCompose(null);

  // ── 음성 기록 ──
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

  const renderPlayerCard = (player, isHome, placeBelow) => {
    const mercsArr = isHome ? homeMercs : awayMercs;
    const isMerc = mercsArr.includes(player);
    const isGk = (isHome ? homeGk : awayGk) === player;
    const color = isHome ? homeColor : awayColor;
    const roleInCompose = myCompose?.scorer === player ? 'scorer'
                        : myCompose?.assist === player ? 'assist'
                        : null;
    const isPopoverOpen = openPopover?.player === player && openPopover.isHome === isHome;
    const stats = playerStats[player];

    const ringColor = roleInCompose === 'scorer' ? "var(--app-green)"
                    : roleInCompose === 'assist' ? "var(--app-blue)"
                    : isGk ? "var(--app-orange)"
                    : null;

    const cardBg = roleInCompose === 'scorer' ? "rgba(52,199,89,0.14)"
                 : roleInCompose === 'assist' ? "rgba(0,122,255,0.12)"
                 : "var(--app-bg-row-hover)";

    const border = ringColor
      ? `0.5px solid ${ringColor}`
      : "0.5px solid transparent";
    const borderLeft = ringColor
      ? `0.5px solid ${ringColor}`
      : `3px solid ${color?.bg || "transparent"}`;

    return (
      <div
        key={player}
        style={{ position: "relative" }}
        {...(isPopoverOpen ? { 'data-popover-region': '1' } : {})}
      >
        <button
          onClick={() => {
            if (readOnly) { readOnlyAlert(); return; }
            // Fast-path: compose active + same team + not scorer → instant assist+save
            if (myCompose?.scorer && myCompose.scorerIsHome === isHome && myCompose.scorer !== player) {
              if (!checkGk()) return;
              recordGoalEvent(myCompose.scorer, player);
              setCompose(null);
              return;
            }
            setOpenPopover(isPopoverOpen ? null : { player, isHome });
          }}
          aria-label={`${player} 역할 선택`}
          style={{
            width: "100%",
            background: cardBg,
            color: "var(--app-text-primary)",
            border, borderLeft,
            borderRadius: 10,
            padding: "12px 8px", minHeight: 60,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 3, cursor: "pointer", fontFamily: "inherit",
            fontSize: 14, fontWeight: 500,
            position: "relative",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          {isGk && (
            <span style={{
              position: "absolute", top: 4, right: 6,
              width: 16, height: 16, borderRadius: 3,
              background: "var(--app-orange)", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, letterSpacing: 0, lineHeight: 1,
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
          {stats && (stats.g > 0 || stats.a > 0) && (
            <span style={{
              fontSize: 10, color: "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums",
              display: "inline-flex", gap: 5,
            }}>
              {stats.g > 0 && <span>⚽{stats.g}</span>}
              {stats.a > 0 && <span>🅰{stats.a}</span>}
            </span>
          )}
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
        {isPopoverOpen && (() => {
          const sameTeam = myCompose && myCompose.scorerIsHome === isHome;
          const canAssist = !!(myCompose?.scorer) && sameTeam && myCompose.scorer !== player;
          const below = !placeBelow ? false : true;
          const popPos = below
            ? { top: "calc(100% + 6px)" }
            : { bottom: "calc(100% + 6px)" };
          return (
            <div style={{
              position: "absolute", left: 0, right: 0,
              ...popPos,
              zIndex: 40,
              background: "var(--app-bg-elevated)",
              border: "0.5px solid var(--app-divider)",
              borderRadius: 10, padding: 6,
              boxShadow: "var(--app-shadow-lg)",
              display: "flex", gap: 4,
              minWidth: 220,
            }}>
              <button
                onClick={(e) => { e.stopPropagation(); applyGoalRole(player, isHome); setOpenPopover(null); }}
                style={popoverBtn(roleInCompose === 'scorer' ? "green" : "neutral", false, roleInCompose === 'scorer')}
              >{roleInCompose === 'scorer' ? "✓골" : "골"}</button>
              <button
                onClick={(e) => { e.stopPropagation(); if (canAssist || roleInCompose === 'assist') { applyAssistRole(player, isHome); setOpenPopover(null); } }}
                disabled={!canAssist && roleInCompose !== 'assist'}
                style={popoverBtn(roleInCompose === 'assist' ? "blue" : "neutral", !canAssist && roleInCompose !== 'assist', roleInCompose === 'assist')}
              >{roleInCompose === 'assist' ? "✓어시" : "어시"}</button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleGk(player, isHome); setOpenPopover(null); }}
                style={popoverBtn(isGk ? "blue" : "neutral", false, isGk)}
              >{isGk ? "✓GK" : "GK"}</button>
              <button
                onClick={(e) => { e.stopPropagation(); applyOwnGoalRole(player); setOpenPopover(null); }}
                style={popoverBtn("red")}
              >자책</button>
              <button
                onClick={(e) => { e.stopPropagation(); setOpenPopover(null); }}
                style={popoverBtn("ghost")}
              >취소</button>
            </div>
          );
        })()}
      </div>
    );
  };

  const homePanelTint = homeColor?.bg ? `color-mix(in srgb, ${homeColor.bg} 7%, transparent)` : "transparent";
  const awayPanelTint = awayColor?.bg ? `color-mix(in srgb, ${awayColor.bg} 7%, transparent)` : "transparent";

  return (
    <div style={{
      background: "var(--app-bg-row)", borderRadius: 14, padding: 14,
      border: "0.5px solid var(--app-divider)",
      position: "relative",
    }}>

      {/* Compose bar */}
      {myCompose && (
        <div style={{
          marginBottom: 12, padding: "10px 10px 10px 12px", borderRadius: 12,
          background: "var(--app-bg-elevated)",
          border: "0.5px solid var(--app-divider)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{
              padding: "4px 8px", borderRadius: 6,
              background: "rgba(52,199,89,0.18)", color: "var(--app-green)",
              fontSize: 12, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>⚽ {myCompose.scorer}</span>
            <span style={{
              padding: "4px 8px", borderRadius: 6,
              background: "transparent", color: "var(--app-text-tertiary)",
              fontSize: 11, fontWeight: 500,
              border: "0.5px dashed var(--app-divider)",
            }}>어시: 선수 탭</span>
            {(() => {
              const concGk = myCompose.scorerIsHome ? awayGk : homeGk;
              return concGk ? (
                <span style={{
                  padding: "4px 8px", borderRadius: 6,
                  background: "var(--app-bg-row)", color: "var(--app-text-secondary)",
                  fontSize: 12, fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>🧤 {concGk}</span>
              ) : null;
            })()}
          </div>
          <button onClick={saveSolo} disabled={!myCompose.scorer}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: "var(--app-blue)", color: "#fff",
              border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", opacity: myCompose.scorer ? 1 : 0.4,
              letterSpacing: "-0.01em",
            }}>단독</button>
          <button onClick={cancelCompose}
            style={{
              padding: "8px 10px", borderRadius: 8,
              background: "var(--app-bg-row)", color: "var(--app-text-secondary)",
              border: "0.5px solid var(--app-divider)", fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}>취소</button>
        </div>
      )}

      {/* Scoreboard */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center", gap: 12, padding: "8px 0 14px",
      }}>
        <div style={{ textAlign: "center", opacity: homeScore < awayScore ? 0.55 : 1, transition: "opacity .2s" }}>
          <div style={{
            fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: homeColor?.bg }} />
            {homeTeam}
          </div>
          <div style={{
            fontSize: 40, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums",
            color: homeColor?.bg || "var(--app-text-primary)", marginTop: 2,
          }}>{homeScore}</div>
          {homeGk && (
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 4,
                          display: "inline-flex", alignItems: "center", gap: 4 }}>
              <GloveIcon width={11} color="var(--app-text-tertiary)" />
              {homeGk}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-tertiary)", paddingBottom: 8 }}>VS</div>
        <div style={{ textAlign: "center", opacity: awayScore < homeScore ? 0.55 : 1, transition: "opacity .2s" }}>
          <div style={{
            fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: awayColor?.bg }} />
            {awayTeam}
          </div>
          <div style={{
            fontSize: 40, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums",
            color: awayColor?.bg || "var(--app-text-primary)", marginTop: 2,
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

      {/* Teams side-by-side */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
      }}>
        {[
          { tint: homePanelTint, color: homeColor, teamName: homeTeam, players: homePlayers, isHome: true, side: "home" },
          { tint: awayPanelTint, color: awayColor, teamName: awayTeam, players: awayPlayers, isHome: false, side: "away" },
        ].map(t => (
          <div key={t.side} style={{
            background: t.tint, padding: "10px 8px 10px",
            borderRadius: 10,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)",
              marginLeft: 2, marginBottom: 8,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color?.bg }} />
              {t.teamName}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6, flex: 1,
            }}>
              {t.players.map(p => renderPlayerCard(p, t.isHome, t.isHome))}
            </div>
            {!readOnly && (
              <button onClick={() => setShowMercPicker(t.side)} style={{
                marginTop: 8, background: "transparent",
                border: "1px dashed rgba(255,149,0,0.5)", borderRadius: 10,
                padding: "9px", fontSize: 12, fontWeight: 500,
                color: "var(--app-orange)", cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                width: "100%",
              }}><PlusIcon width={12} color="var(--app-orange)" /> 용병</button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div style={{
          fontSize: 11, color: "var(--app-text-tertiary)", textAlign: "center",
          marginTop: 10, letterSpacing: "-0.01em",
        }}>
          탭 → 역할 선택 · 골 선택 후 같은 팀 선수 탭 = 어시+저장, [단독] = 단독 저장
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

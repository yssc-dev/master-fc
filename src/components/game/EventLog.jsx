import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';

/**
 * 스와이프 가능한 이벤트 항목
 * - 왼쪽 스와이프 → 삭제 버튼 노출
 * - 탭 → 간단 수정 모달 (같은 팀 선수만 표시)
 */
function SwipeableEvent({ children, onDelete, C }) {
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [showDelete, setShowDelete] = useState(false);
  const DELETE_THRESHOLD = -60;

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchCurrentX.current - touchStartX.current;
    // 왼쪽 스와이프만 허용, 최대 -100px
    if (diff < 0) {
      setOffsetX(Math.max(diff, -100));
    }
  };

  const onTouchEnd = () => {
    if (offsetX < DELETE_THRESHOLD) {
      setShowDelete(true);
      setOffsetX(-80);
    } else {
      setShowDelete(false);
      setOffsetX(0);
    }
  };

  const handleDelete = () => {
    setShowDelete(false);
    setOffsetX(0);
    onDelete();
  };

  const resetSwipe = () => {
    setShowDelete(false);
    setOffsetX(0);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 8, marginBottom: 4 }}>
      {/* 삭제 배경 (빨간 영역) */}
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 80,
        background: C.red, display: "flex", alignItems: "center", justifyContent: "center",
        opacity: showDelete ? 1 : Math.min(1, Math.abs(offsetX) / 60),
        transition: showDelete ? "none" : "opacity 0.1s",
      }}>
        <button onClick={handleDelete} style={{
          background: "transparent", border: "none", color: "#fff",
          fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "8px 16px",
        }}>
          삭제
        </button>
      </div>

      {/* 콘텐츠 (스와이프 이동) */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (showDelete) resetSwipe(); }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: offsetX === 0 || showDelete ? "transform 0.2s ease" : "none",
          position: "relative", zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function EventLog({ matchEvents, allEvents, matchId, homePlayers, awayPlayers, homeTeam, awayTeam, homeGk, awayGk, homeColor, awayColor, onDeleteEvent, onEditEvent, styles: s, readOnly }) {
  const { C } = useTheme();
  const [editingEvent, setEditingEvent] = useState(null);
  // 좁은 화면(폰)에서는 좌우 2열이 잘리므로 팀별 세로 스택(1열)으로 전환
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 479px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 479px)");
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (matchEvents.length === 0) return null;

  // 수정 시 같은 팀 선수만 표시하기 위한 헬퍼
  const getTeamPlayers = (event) => {
    if (event.type === "owngoal" || event.type === "foul") {
      // 자책골/반칙: 본인 팀 선수로 변경 가능
      return event.team === homeTeam ? homePlayers : awayPlayers;
    }
    // 일반 골: 득점 팀 선수
    return event.scoringTeam === homeTeam ? homePlayers : awayPlayers;
  };

  const getAssistCandidates = (event) => {
    // 어시스트는 같은 팀에서, 골 선수 제외
    const teamPlayers = event.scoringTeam === homeTeam ? homePlayers : awayPlayers;
    return teamPlayers.filter(p => p !== event.player);
  };

  const teamHeaderStyle = (t, i) => ({
    textAlign: "center", padding: "4px 0", borderRadius: 6,
    background: `${t.color?.bg || (i === 0 ? "var(--app-blue)" : "var(--app-orange)")}14`,
    color: t.color?.bg || (i === 0 ? "var(--app-blue)" : "var(--app-orange)"),
    fontSize: 11, fontWeight: 700,
  });

  // 단일 이벤트 행 — 1열/2열 레이아웃 공용
  const renderRow = (e, localIdx) => {
        const isHomeSide = e.team === homeTeam;
        const globalIdx = e.id ? allEvents.findIndex(ae => ae.id === e.id) : allEvents.findIndex(ae => ae === e);
        const isEditing = editingEvent === globalIdx;
        const sideColor = isHomeSide ? (homeColor?.bg || "var(--app-blue)") : (awayColor?.bg || "var(--app-orange)");

        const deleteEvent = () => {
          if (readOnly) { alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요."); return; }
          onDeleteEvent(globalIdx); setEditingEvent(null);
        };
        const deleteWithConfirm = () => {
          if (readOnly) { alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요."); return; }
          const label = e.type === "goal" ? "골" : e.type === "owngoal" ? "자책골" : "반칙";
          if (!confirm(`${e.player}의 ${label} 이벤트를 삭제할까요?`)) return;
          onDeleteEvent(globalIdx); setEditingEvent(null);
        };

        return (
          <div key={localIdx} style={{ minWidth: 0 }}>
          <SwipeableEvent onDelete={deleteEvent} C={C}>
            <div
              style={{
                ...s.eventLog,
                flexDirection: "column", alignItems: "stretch",
                padding: isEditing ? 10 : "8px 10px",
                background: isEditing ? C.card : "transparent",
                border: isEditing ? `1px solid ${C.accent}` : "none",
                borderBottom: isEditing ? `1px solid ${C.accent}` : `1px dashed ${C.grayDarker}`,
                borderRadius: isEditing ? 12 : 0,
                borderLeft: `3px solid ${sideColor}`,
                paddingLeft: isEditing ? 10 : 10,
              }}
              onClick={() => {
                if (readOnly) { alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요."); return; }
                setEditingEvent(isEditing ? null : globalIdx);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", minWidth: 0, width: "100%" }}>
                <span style={{
                  fontSize: 9, color: "var(--app-text-tertiary)",
                  flexShrink: 0, fontVariantNumeric: "tabular-nums",
                }}>
                  #{String(localIdx + 1).padStart(2, "0")}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, flexWrap: "nowrap", minWidth: 0, overflow: "hidden" }}>
                  {(() => {
                    const isFoul = e.type === "foul";
                    const isOG = e.type === "owngoal";
                    const bg = isOG ? "rgba(255,59,48,0.14)" : isFoul ? "rgba(234,179,8,0.18)" : "rgba(52,199,89,0.18)";
                    const fg = isOG ? "var(--app-red)" : isFoul ? "#a16207" : "var(--app-green)";
                    const icon = isOG ? "🔴" : isFoul ? "🟨" : "⚽";
                    return (
                      <span style={{
                        padding: "1px 4px", borderRadius: 5,
                        background: bg, color: fg,
                        fontSize: 10, fontWeight: 600,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        minWidth: 0, flexShrink: 1,
                      }}>{icon}{e.player}</span>
                    );
                  })()}
                  {e.type === "goal" && e.assist && (
                    <span style={{
                      padding: "1px 4px", borderRadius: 5,
                      background: "rgba(0,122,255,0.18)", color: "var(--app-blue)",
                      fontSize: 10, fontWeight: 600,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      minWidth: 0, flexShrink: 1,
                    }}>🅰{e.assist}</span>
                  )}
                  {e.concedingGk && (
                    <span style={{
                      padding: "1px 4px", borderRadius: 5,
                      background: "rgba(255,59,48,0.12)", color: "var(--app-red)",
                      fontSize: 10, fontWeight: 600,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      minWidth: 0, flexShrink: 1,
                    }}>🧤{e.concedingGk}{e.type === "owngoal" ? "·2" : ""}</span>
                  )}
                </div>
                {!readOnly && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); deleteWithConfirm(); }}
                    title="이벤트 삭제"
                    style={{
                      flexShrink: 0,
                      width: 18, height: 18,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0, marginLeft: 2,
                      border: "none", borderRadius: 4,
                      background: "transparent", color: C.grayDark,
                      fontSize: 12, lineHeight: 1, cursor: "pointer",
                    }}
                    onMouseEnter={(ev) => { ev.currentTarget.style.background = C.red; ev.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; ev.currentTarget.style.color = C.grayDark; }}
                  >✕</button>
                )}
              </div>

              {isEditing && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.grayDarker}` }}
                  onClick={(ev) => ev.stopPropagation()}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>
                      {e.type === "goal" ? "골 선수" : e.type === "owngoal" ? "자책골 선수" : "반칙 선수"} 변경
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {getTeamPlayers(e).map(p => (
                        <button key={p} onClick={() => {
                          const isHome = homePlayers.includes(p);
                          const updated = { ...e, player: p };
                          // owngoal/foul: 본인팀이 실점, 상대팀이 득점
                          // goal: 본인팀이 득점, 상대팀이 실점
                          const isSelfConcede = e.type === "owngoal" || e.type === "foul";
                          if (isSelfConcede) {
                            updated.team = isHome ? homeTeam : awayTeam;
                            updated.scoringTeam = isHome ? awayTeam : homeTeam;
                            updated.concedingTeam = isHome ? homeTeam : awayTeam;
                            updated.concedingGk = isHome ? homeGk : awayGk;
                          } else {
                            updated.team = isHome ? homeTeam : awayTeam;
                            updated.scoringTeam = isHome ? homeTeam : awayTeam;
                            updated.concedingTeam = isHome ? awayTeam : homeTeam;
                            updated.concedingGk = isHome ? awayGk : homeGk;
                          }
                          onEditEvent(globalIdx, updated);
                        }}
                          style={{ ...s.btnSm(e.player === p ? C.green : C.grayDarker, e.player === p ? "#fff" : C.gray), padding: "4px 8px", fontSize: 11 }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {e.type === "goal" && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>어시스트 변경</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        <button onClick={() => { onEditEvent(globalIdx, { ...e, assist: null }); }}
                          style={{ ...s.btnSm(!e.assist ? C.accent : C.grayDarker, !e.assist ? C.bg : C.gray), padding: "4px 8px", fontSize: 11 }}>
                          없음
                        </button>
                        {getAssistCandidates(e).map(p => (
                          <button key={p} onClick={() => { onEditEvent(globalIdx, { ...e, assist: p }); }}
                            style={{ ...s.btnSm(e.assist === p ? C.green : C.grayDarker, e.assist === p ? "#fff" : C.gray), padding: "4px 8px", fontSize: 11 }}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SwipeableEvent>
          </div>
        );
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: C.gray }}>LOG · {matchEvents.length}</span>
        {!readOnly && <span style={{ fontSize: 10, color: C.grayDark }}>← swipe · ✕</span>}
        {readOnly && <span style={{ fontSize: 10, color: C.orange }}>LOCKED</span>}
      </div>
      {narrow ? (
        /* 좁은 화면: 팀별 섹션 세로 스택 (1열, 전체 폭) — 골 잘림 방지 */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[{ name: homeTeam, color: homeColor }, { name: awayTeam, color: awayColor }].map((t, i) => {
            const rows = matchEvents
              .map((e, idx) => [e, idx])
              .filter(([e]) => (e.team === homeTeam) === (i === 0));
            if (rows.length === 0) return null;
            return (
              <div key={i}>
                <div style={{ ...teamHeaderStyle(t, i), marginBottom: 4 }}>{t.name}</div>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  {rows.map(([e, idx]) => renderRow(e, idx))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 넓은 화면: 기존 좌우 2열 (좌: 홈, 우: 어웨이) */
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6 }}>
            {[{ name: homeTeam, color: homeColor }, { name: awayTeam, color: awayColor }].map((t, i) => (
              <div key={i} style={teamHeaderStyle(t, i)}>{t.name}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, alignItems: "start" }}>
            {[true, false].map((isHomeColumn) => (
              <div key={isHomeColumn ? "home" : "away"} style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                {matchEvents.map((e, localIdx) => {
                  if ((e.team === homeTeam) !== isHomeColumn) return null;
                  return renderRow(e, localIdx);
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

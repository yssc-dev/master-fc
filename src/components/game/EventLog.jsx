import { useState, useRef } from 'react';
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

export default function EventLog({ matchEvents, allEvents, matchId, homePlayers, awayPlayers, homeTeam, awayTeam, homeGk, awayGk, homeColor, awayColor, onDeleteEvent, onEditEvent, styles: s }) {
  const { C } = useTheme();
  const [editingEvent, setEditingEvent] = useState(null);

  if (matchEvents.length === 0) return null;

  // 수정 시 같은 팀 선수만 표시하기 위한 헬퍼
  const getTeamPlayers = (event) => {
    if (event.type === "owngoal") {
      // 자책골: 본인 팀 선수로 변경 가능
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

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>경기 기록 ({matchEvents.length}건)</span>
        <span style={{ fontSize: 10, color: C.grayDark }}>← 밀어서 삭제</span>
      </div>
      {matchEvents.map((e, localIdx) => {
        const globalIdx = e.id ? allEvents.findIndex(ae => ae.id === e.id) : allEvents.findIndex(ae => ae === e);
        const isEditing = editingEvent === globalIdx;

        return (
          <SwipeableEvent
            key={localIdx}
            onDelete={() => { onDeleteEvent(globalIdx); setEditingEvent(null); }}
            C={C}
          >
            <div
              style={{
                ...s.eventLog,
                flexDirection: "column", alignItems: "stretch",
                padding: isEditing ? 10 : "6px 10px",
                background: isEditing ? C.card : C.cardLight,
                border: isEditing ? `1px solid ${C.accent}` : "none",
              }}
              onClick={() => setEditingEvent(isEditing ? null : globalIdx)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{e.type === "goal" ? "⚽" : "🔴"}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{e.player}</span>
                  <span style={{ color: C.gray, fontSize: 11 }}>({e.type === "goal" ? "골" : "자책골"})</span>
                  {e.type === "goal" && e.assist && (
                    <span style={{ color: C.gray, fontSize: 11 }}> ← {e.assist}<span style={{ opacity: 0.7 }}>(어시)</span></span>
                  )}
                  {e.type === "goal" && !e.assist && (
                    <span style={{ color: C.grayDark, fontSize: 11 }}> (어시 없음)</span>
                  )}
                  {e.concedingGk && (
                    <span style={{ color: C.gray, fontSize: 11 }}> / 실점: {e.concedingGk}{e.type === "owngoal" ? " (2점)" : ""}</span>
                  )}
                </div>
                <span style={{ color: e.scoringTeam === homeTeam ? homeColor?.bg : awayColor?.bg, fontSize: 11, fontWeight: 600 }}>{e.scoringTeam}</span>
              </div>

              {isEditing && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.grayDarker}` }}
                  onClick={(ev) => ev.stopPropagation()}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>
                      {e.type === "goal" ? "골 선수" : "자책골 선수"} 변경
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {getTeamPlayers(e).map(p => (
                        <button key={p} onClick={() => {
                          const isHome = homePlayers.includes(p);
                          const updated = { ...e, player: p };
                          if (e.type === "owngoal") {
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
        );
      })}
    </div>
  );
}

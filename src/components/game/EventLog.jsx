import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function EventLog({ matchEvents, allEvents, matchId, homePlayers, awayPlayers, homeTeam, awayTeam, homeGk, awayGk, homeColor, awayColor, onDeleteEvent, onEditEvent, styles: s }) {
  const { C } = useTheme();
  const [editingEvent, setEditingEvent] = useState(null);

  if (matchEvents.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>경기 기록 ({matchEvents.length}건)</div>
      {matchEvents.map((e, localIdx) => {
        const globalIdx = e.id ? allEvents.findIndex(ae => ae.id === e.id) : allEvents.findIndex(ae => ae === e);
        const isEditing = editingEvent === globalIdx;

        return (
          <div key={localIdx} style={{ ...s.eventLog, flexDirection: "column", alignItems: "stretch", padding: isEditing ? 10 : "6px 10px", background: isEditing ? C.card : C.cardLight, border: isEditing ? `1px solid ${C.accent}` : "none" }}>
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
              <button onClick={() => setEditingEvent(isEditing ? null : globalIdx)}
                style={{ ...s.btnSm(isEditing ? C.accent : C.grayDarker, isEditing ? C.bg : C.gray), padding: "3px 8px", fontSize: 10 }}>
                {isEditing ? "닫기" : "수정"}
              </button>
            </div>

            {isEditing && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.grayDarker}` }}>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>
                    {e.type === "goal" ? "골 선수" : "자책골 선수"} 변경
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {[...homePlayers, ...awayPlayers].map(p => (
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
                      {[...homePlayers, ...awayPlayers].filter(p => p !== e.player).map(p => (
                        <button key={p} onClick={() => { onEditEvent(globalIdx, { ...e, assist: p }); }}
                          style={{ ...s.btnSm(e.assist === p ? C.green : C.grayDarker, e.assist === p ? "#fff" : C.gray), padding: "4px 8px", fontSize: 11 }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={() => { onDeleteEvent(globalIdx); setEditingEvent(null); }}
                  style={{ ...s.btnSm(C.red), width: "100%", marginTop: 4 }}>
                  이 기록 삭제
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect } from 'react';
import AppSync from '../../services/appSync';
import { useTheme } from '../../hooks/useTheme';

export default function HistoryView({ teamContext, onBack }) {
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);

  useEffect(() => {
    AppSync.getHistory().then(data => {
      setHistory(data);
    }).finally(() => setLoading(false));
  }, []);

  const hs = {
    container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: 500, margin: "0 auto" },
    header: { background: C.headerBg, padding: "16px", textAlign: "center", position: "sticky", top: 0, zIndex: 100 },
    card: { background: C.card, borderRadius: 12, padding: 14, marginBottom: 10 },
  };

  if (loading) {
    return (
      <div style={{ ...hs.container, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: C.gray, fontSize: 14 }}>과거 경기 불러오는 중...</div>
      </div>
    );
  }

  if (selectedGame) {
    let gameState = null;
    try { gameState = JSON.parse(selectedGame.stateJson); } catch (e) { /* ignore */ }

    return (
      <div style={hs.container}>
        <div style={hs.header}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{selectedGame.gameDate} 경기 기록</div>
          <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>{teamContext.team} · 읽기전용</div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 8 }}>{selectedGame.summary}</div>

          {gameState && gameState.completedMatches && gameState.completedMatches.map((m, i) => {
            const evts = (gameState.allEvents || []).filter(e => e.matchId === m.matchId);
            return (
              <div key={i} style={{ ...hs.card, background: m.isExtra ? `${C.orange}11` : C.card }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.gray }}>{m.matchId}{m.isExtra ? " (임시)" : ""}</span>
                  {m.court && <span style={{ fontSize: 10, color: C.gray }}>{m.court}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 16, fontWeight: 700 }}>
                  <span style={{ color: m.homeScore > m.awayScore ? C.green : C.white }}>{m.homeTeam}</span>
                  <span style={{ fontSize: 24, fontWeight: 900 }}>{m.homeScore} : {m.awayScore}</span>
                  <span style={{ color: m.awayScore > m.homeScore ? C.green : C.white }}>{m.awayTeam}</span>
                </div>
                {evts.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {evts.map((e, ei) => (
                      <div key={ei} style={{ display: "flex", alignItems: "center", padding: "4px 8px", borderRadius: 6, background: C.cardLight, marginBottom: 3, fontSize: 11, gap: 4, color: C.white }}>
                        <span>{e.type === "goal" ? "⚽" : "🔴"}</span>
                        <span style={{ fontWeight: 600 }}>{e.player}</span>
                        <span style={{ color: C.gray }}>({e.type === "goal" ? "골" : "자책골"})</span>
                        {e.assist && <span style={{ color: C.gray }}> ← {e.assist}(어시)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {(!gameState || !gameState.completedMatches || gameState.completedMatches.length === 0) && (
            <div style={{ textAlign: "center", color: C.gray, padding: 20 }}>상세 기록이 없습니다</div>
          )}

          <button onClick={() => setSelectedGame(null)}
            style={{ background: C.grayDark, color: C.white, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 12 }}>
            목록으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={hs.container}>
      <div style={hs.header}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>과거 경기 조회</div>
        <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>{teamContext.team}</div>
      </div>
      <div style={{ padding: 16 }}>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", color: C.gray, padding: 40 }}>확정된 경기 기록이 없습니다</div>
        ) : (
          history.map((h, i) => (
            <div key={i} onClick={() => setSelectedGame(h)}
              style={{ ...hs.card, cursor: "pointer", border: `1px solid ${C.grayDark}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{h.gameDate}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{h.summary || "경기 기록"}</div>
                </div>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>상세 ▶</div>
              </div>
            </div>
          ))
        )}
        <button onClick={onBack}
          style={{ background: C.grayDark, color: C.white, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 12 }}>
          대시보드로 돌아가기
        </button>
      </div>
    </div>
  );
}

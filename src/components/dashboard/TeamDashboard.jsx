import { useState, useEffect } from 'react';
import { fetchSheetData } from '../../services/sheetService';
import { useTheme } from '../../hooks/useTheme';

export default function TeamDashboard({ authUser, teamName, teamEntries, onStartGame, onContinueGame, onViewHistory, onSwitchTeam, onLogout, pendingGames = [], checkingPending }) {
  const { C, mode, toggle } = useTheme();
  const [activeSport, setActiveSport] = useState(teamEntries[0]?.mode || "풋살");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("records");

  const activeEntry = teamEntries.find(e => e.mode === activeSport) || teamEntries[0];

  useEffect(() => {
    fetchSheetData()
      .then(data => setMembers(data.players || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, []);

  const ds = {
    container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: 500, margin: "0 auto" },
    header: { background: C.headerBg, padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 100 },
    section: { padding: "0 16px", marginBottom: 16 },
    card: { background: C.card, borderRadius: 12, padding: 14 },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: C.gray, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
    sportTab: (active) => ({ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: active ? C.accent : C.cardLight, color: active ? C.bg : C.gray }),
    btn: (bg, tc = "#fff") => ({ background: bg, color: tc, border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }),
    mainTab: (active) => ({
      flex: 1, padding: "12px 8px", textAlign: "center", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
      background: active ? C.card : "transparent", color: active ? C.white : C.gray,
      borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
      position: "relative",
    }),
  };

  const maxGames = members.length > 0 ? Math.max(...members.map(p => p.games)) : 1;
  const totalGoals = members.reduce((s, p) => s + (p.goals || 0), 0);
  const totalAssists = members.reduce((s, p) => s + (p.assists || 0), 0);
  const activePlayers = members.filter(p => p.games > 0);
  const maxPoint = members.length > 0 ? Math.max(...members.map(p => p.point), 1) : 1;

  const Bar = ({ value, max, color, height = 10 }) => (
    <div style={{ background: C.cardLight, borderRadius: height / 2, height, flex: 1, overflow: "hidden" }}>
      <div style={{ background: color, height: "100%", borderRadius: height / 2, width: `${Math.min(100, (value / (max || 1)) * 100)}%`, transition: "width 0.3s" }} />
    </div>
  );

  const DeltaBadge = ({ value }) => {
    if (!value || value === 0) return null;
    const isUp = value > 0;
    return (
      <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, fontWeight: 700, background: isUp ? "#22c55e22" : "#ef444422", color: isUp ? "#22c55e" : "#ef4444" }}>
        {isUp ? "+" : ""}{value}
      </span>
    );
  };

  const renderRecords = () => (
    <>
      {membersLoading ? (
        <div style={{ ...ds.section, textAlign: "center", color: C.gray, fontSize: 13, padding: 20 }}>불러오는 중...</div>
      ) : (
        <>
          {/* 시즌 요약 카드 */}
          <div style={ds.section}>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "경기", value: maxGames, color: C.accent },
                { label: "골", value: totalGoals, color: "#22c55e" },
                { label: "어시", value: totalAssists, color: "#3b82f6" },
                { label: "참여", value: activePlayers.length, color: C.orange },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, background: C.card, borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 포인트 TOP 5 */}
          {members.length > 0 && (
            <div style={ds.section}>
              <div style={ds.sectionTitle}>포인트 TOP 5</div>
              <div style={ds.card}>
                {members.slice(0, 5).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < 4 ? `1px solid ${C.borderColor}` : "none" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: i < 3 ? C.orange : C.gray, minWidth: 18 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 52 }}>{p.name}</span>
                    <Bar value={p.point} max={maxPoint} color={C.accent} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 36, textAlign: "right" }}>{p.point}</span>
                    <DeltaBadge value={p.pointDelta} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 골·어시 TOP 5 */}
          {members.length > 0 && (
            <div style={ds.section}>
              <div style={{ display: "flex", gap: 8 }}>
                {/* 골 TOP 5 */}
                <div style={{ flex: 1 }}>
                  <div style={{ ...ds.sectionTitle, fontSize: 12 }}>⚽ 골 TOP 5</div>
                  <div style={ds.card}>
                    {[...members].sort((a, b) => b.goals - a.goals).slice(0, 5).map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 0", borderBottom: i < 4 ? `1px solid ${C.borderColor}` : "none", fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <span style={{ fontWeight: 700, color: "#22c55e" }}>{p.goals}</span>
                        <DeltaBadge value={p.goalsDelta} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* 어시 TOP 5 */}
                <div style={{ flex: 1 }}>
                  <div style={{ ...ds.sectionTitle, fontSize: 12 }}>👟 어시 TOP 5</div>
                  <div style={ds.card}>
                    {[...members].sort((a, b) => b.assists - a.assists).slice(0, 5).map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 0", borderBottom: i < 4 ? `1px solid ${C.borderColor}` : "none", fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <span style={{ fontWeight: 700, color: "#3b82f6" }}>{p.assists}</span>
                        <DeltaBadge value={p.assistsDelta} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 최근 핫/콜드 */}
          {activePlayers.length > 0 && (() => {
            // pointDelta(S열) = 골+어시+역주행+클린시트 변동 합산 (크로바/고구마 변동은 시트에 없어 제외)
            const withDelta = activePlayers.map(p => ({ ...p, totalDelta: p.pointDelta || 0 }));
            const hot = [...withDelta].sort((a, b) => b.totalDelta - a.totalDelta).slice(0, 3).filter(p => p.totalDelta > 0);
            const cold = [...withDelta].sort((a, b) => a.totalDelta - b.totalDelta).slice(0, 3).filter(p => p.totalDelta < 0);
            if (hot.length === 0 && cold.length === 0) return null;
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>최근 변동 <span title="직전 경기 대비 포인트 변동 (골+어시+역주행+클린시트). 크로바/고구마 변동은 미포함" style={{ fontSize: 11, color: C.grayDark, cursor: "help", marginLeft: 2 }}>?</span></div>
                <div style={{ display: "flex", gap: 8 }}>
                  {hot.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>HOT</div>
                      {hot.map((p, i) => (
                        <div key={i} style={{ ...ds.card, marginBottom: 6, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                            <DeltaBadge value={p.totalDelta} />
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                            {p.goalsDelta > 0 && <span style={{ fontSize: 10, color: C.gray }}>골+{p.goalsDelta}</span>}
                            {p.assistsDelta > 0 && <span style={{ fontSize: 10, color: C.gray }}>어시+{p.assistsDelta}</span>}
                            {p.cleanSheetsDelta > 0 && <span style={{ fontSize: 10, color: C.gray }}>CS+{p.cleanSheetsDelta}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {cold.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>COLD</div>
                      {cold.map((p, i) => (
                        <div key={i} style={{ ...ds.card, marginBottom: 6, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                            <DeltaBadge value={p.totalDelta} />
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                            {p.ownGoalsDelta > 0 && <span style={{ fontSize: 10, color: C.gray }}>역주행+{p.ownGoalsDelta}</span>}
                            {p.concededDelta > 0 && <span style={{ fontSize: 10, color: C.gray }}>실점+{p.concededDelta}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 키퍼 성적 */}
          {(() => {
            const keepers = members.filter(p => p.keeperGames > 0).sort((a, b) => {
              const aAvg = a.keeperConceded / (a.keeperGames || 1);
              const bAvg = b.keeperConceded / (b.keeperGames || 1);
              return aAvg - bAvg;
            });
            if (keepers.length === 0) return null;
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>🧤 키퍼 성적</div>
                <div style={ds.card}>
                  {keepers.slice(0, 5).map((p, i) => {
                    const avg = (p.keeperConceded / (p.keeperGames || 1)).toFixed(1);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < keepers.length - 1 && i < 4 ? `1px solid ${C.borderColor}` : "none" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{avg} 실점/경기</div>
                          <div style={{ fontSize: 10, color: C.gray }}>{p.keeperGames}경기 · CS {p.cleanSheets}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* 출석률 */}
          {activePlayers.length > 0 && (
            <div style={ds.section}>
              <div style={ds.sectionTitle}>출석률 TOP 10</div>
              <div style={ds.card}>
                {[...members].sort((a, b) => b.games - a.games).slice(0, 10).map((p, i) => {
                  const pct = Math.round((p.games / maxGames) * 100);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < 9 ? `1px solid ${C.borderColor}` : "none" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 52 }}>{p.name}</span>
                      <Bar value={p.games} max={maxGames} color={pct === 100 ? "#22c55e" : C.accent} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: pct === 100 ? "#22c55e" : C.white, minWidth: 48, textAlign: "right" }}>{p.games}/{maxGames} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={ds.section}>
            <button onClick={onViewHistory} style={{ ...ds.btn(C.cardLight, C.white) }}>과거 경기 조회</button>
          </div>
        </>
      )}
    </>
  );

  const renderRoster = () => (
    <div style={ds.section}>
      <div style={ds.sectionTitle}>팀원 명단 {!membersLoading && `(${members.length}명)`}</div>
      <div style={ds.card}>
        {membersLoading ? (
          <div style={{ textAlign: "center", color: C.gray, fontSize: 13, padding: 8 }}>불러오는 중...</div>
        ) : members.length === 0 ? (
          <div style={{ textAlign: "center", color: C.gray, fontSize: 13, padding: 8 }}>등록된 선수가 없습니다</div>
        ) : (
          <div>
            {members.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < members.length - 1 ? `1px solid ${C.borderColor}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.grayDark, fontWeight: 600, minWidth: 28 }}>#{p.backNum || "-"}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                  {i < 3 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#f59e0b22", color: "#f59e0b", fontWeight: 600 }}>{i + 1}위</span>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{p.point}pt</div>
                  <div style={{ fontSize: 10, color: C.gray }}>{p.games}경기 · PPG {p.ppg}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderGames = () => (
    <div style={ds.section}>
      {checkingPending ? (
        <div style={{ textAlign: "center", padding: 20, color: C.gray, fontSize: 13 }}>진행중인 경기 확인 중...</div>
      ) : (
        <>
          {pendingGames.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={ds.sectionTitle}>진행중인 경기 ({pendingGames.length})</div>
              {pendingGames.map((game, idx) => {
                const gs = game.state || {};
                const creator = gs.gameCreator || gs.lastEditor || "알 수 없음";
                const curRound = (gs.currentRoundIdx || 0) + 1;
                const totalRounds = (gs.schedule || []).length;
                const completedCount = (gs.completedMatches || []).length;
                const roundInfo = gs.matchMode === "schedule" && totalRounds > 0
                  ? `${curRound}/${totalRounds} 라운드`
                  : `${completedCount}경기 완료`;
                const attendeeCount = (gs.attendees || []).length;

                return (
                  <div key={game.gameId} style={{ ...ds.card, border: `1px solid ${C.green}44`, cursor: "pointer", marginBottom: 8 }}
                    onClick={() => onContinueGame(game.gameId)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{roundInfo}</span>
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#22c55e22", color: "#22c55e", fontWeight: 600 }}>진행중</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.gray }}>
                          작성자: {creator} · {attendeeCount}명 · {gs.teamCount || "?"}팀
                        </div>
                      </div>
                      <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>▶</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <div style={ds.sectionTitle}>새 경기</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ ...ds.card, cursor: "pointer", border: `1px solid ${C.borderColor}`, transition: "border-color 0.2s" }}
                onClick={() => onStartGame("sheetSync")}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.borderColor}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24 }}>📋</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>구글시트 연동</div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>시트에서 참석자/팀수를 읽어 자동 편성</div>
                  </div>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>▶</span>
                </div>
              </div>

              <div style={{ ...ds.card, cursor: "pointer", border: `1px solid ${C.borderColor}`, transition: "border-color 0.2s" }}
                onClick={() => onStartGame("custom")}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.borderColor}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24 }}>⚙️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>커스텀 경기</div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>참석자 선택 → 팀 편성 → 경기 진행</div>
                  </div>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>▶</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={ds.container}>
      <div style={ds.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{teamName}</div>
            <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>
              {authUser.name}님
              {activeEntry?.role === "관리자" && <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.2)" }}>관리자</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={toggle} style={{ background: C.headerBtnBg, color: C.headerBtnColor, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
              {mode === "dark" ? "☀️" : "🌙"}
            </button>
            <button onClick={onSwitchTeam} style={{ background: C.headerBtnBg, color: C.headerBtnColor, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              팀 전환
            </button>
            <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.1)", color: C.headerBtnDimColor, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              로그아웃
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
          {teamEntries.map(e => (
            <button key={e.mode} style={ds.sportTab(e.mode === activeSport)} onClick={() => setActiveSport(e.mode)}>
              {e.mode}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", background: C.bg, borderBottom: `1px solid ${C.grayDarker}` }}>
        {[
          { key: "records", label: "기록" },
          { key: "roster", label: "명단" },
          { key: "games", label: "경기관리", badge: pendingGames.length > 0 },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={ds.mainTab(activeTab === tab.key)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {tab.label}
              {tab.badge && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#22c55e22", color: "#22c55e", fontWeight: 700 }}>진행중</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 0" }}>
        {activeTab === "records" && renderRecords()}
        {activeTab === "roster" && renderRoster()}
        {activeTab === "games" && renderGames()}
      </div>
    </div>
  );
}

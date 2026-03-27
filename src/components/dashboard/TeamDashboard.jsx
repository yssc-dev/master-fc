import { useState, useEffect, useMemo } from 'react';
import { fetchSheetData } from '../../services/sheetService';
import AppSync from '../../services/appSync';
import { useTheme } from '../../hooks/useTheme';

export default function TeamDashboard({ authUser, teamName, teamEntries, onStartGame, onContinueGame, onViewHistory, onSettings, onSwitchTeam, onLogout, pendingGames = [], checkingPending }) {
  const { C, mode, toggle } = useTheme();
  const [activeSport, setActiveSport] = useState(teamEntries[0]?.mode || "풋살");
  const [members, setMembers] = useState([]);
  const [keepers, setKeepers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [prevRanks, setPrevRanks] = useState({});
  const [activeTab, setActiveTab] = useState("records");

  const activeEntry = teamEntries.find(e => e.mode === activeSport) || teamEntries[0];

  useEffect(() => {
    fetchSheetData()
      .then(data => { setMembers(data.players || []); setKeepers(data.keepers || []); })
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
    AppSync.getPrevRankings().then(r => setPrevRanks(r)).catch(() => {});
  }, []);

  const ds = useMemo(() => ({
    container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: 500, margin: "0 auto" },
    header: { background: C.headerBg, padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 100 },
    section: { padding: "0 16px", marginBottom: 16 },
    card: { background: C.card, borderRadius: 12, padding: 14 },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: C.gray, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
    sportTab: (active) => ({ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: active ? C.accent : C.cardLight, color: active ? C.bg : C.gray }),
    btn: (bg, tc = "#fff") => ({ background: bg, color: tc, border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }),
    thStyle: { padding: "5px 2px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.borderColor}`, fontWeight: 600, fontSize: 9, whiteSpace: "nowrap" },
    tdStyle: (hl = false) => ({ padding: "5px 1px", textAlign: "center", borderBottom: `1px solid ${C.borderColor}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 10 }),
    mainTab: (active) => ({
      flex: 1, padding: "12px 8px", textAlign: "center", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
      background: active ? C.card : "transparent", color: active ? C.white : C.gray,
      borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
      position: "relative",
    }),
  }), [C]);

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
                    <DeltaBadge value={(p.goalsDelta || 0) + (p.assistsDelta || 0) - (p.ownGoalsDelta || 0) * 2 + (p.cleanSheetsDelta || 0)} />
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
            // 포인트 변동 = 골 + 어시 - 역주행*2 + 클린시트 (크로바/고구마 변동은 시트 미제공)
            const withDelta = activePlayers.map(p => ({
              ...p,
              totalDelta: (p.goalsDelta || 0) + (p.assistsDelta || 0) - (p.ownGoalsDelta || 0) * 2 + (p.cleanSheetsDelta || 0),
            }));
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

          {/* 키퍼 성적 — Q열(키퍼경기수) 평균 이상 & T열(실점률) 낮은순 */}
          {(() => {
            const keeperPlayers = members.filter(p => p.keeperGames > 0);
            if (keeperPlayers.length === 0) return null;
            const avgKG = keeperPlayers.reduce((s, p) => s + p.keeperGames, 0) / keeperPlayers.length;
            const qualified = keeperPlayers
              .filter(p => p.keeperGames >= avgKG)
              .sort((a, b) => (a.concededRate || 999) - (b.concededRate || 999));
            if (qualified.length === 0) return null;
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>🧤 키퍼 실점률 TOP 10 <span style={{ fontSize: 10, fontWeight: 400, color: C.gray }}>({Math.round(avgKG)}경기 이상)</span></div>
                <div style={ds.card}>
                  {qualified.slice(0, 10).map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < qualified.length - 1 ? `1px solid ${C.borderColor}` : "none" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{p.concededRate || 0} 실점률</div>
                        <div style={{ fontSize: 10, color: C.gray }}>{p.keeperGames}경기 · 실점 {p.conceded} · CS {p.cleanSheets}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 출석률 */}
          {activePlayers.length > 0 && (
            <div style={ds.section}>
              <div style={ds.sectionTitle}>출석률 TOP 10 <span style={{ fontSize: 11, fontWeight: 400, color: C.gray }}>(전체 {maxGames}경기 기준)</span></div>
              <div style={{ ...ds.card, display: "flex", flexWrap: "wrap", gap: 0 }}>
                {[...members].filter(p => p.games > 0).sort((a, b) => b.games - a.games).slice(0, 10).map((p, i) => {
                  const ratio = p.games / (maxGames || 1);
                  const opacity = 0.3 + ratio * 0.7;
                  return (
                    <div key={i} style={{ width: "50%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, opacity }}>{p.name}</span>
                      <span style={{ fontWeight: 700, color: ratio >= 1 ? "#22c55e" : C.accent, opacity }}>{Math.round(ratio * 100)}%({p.games}경기)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </>
      )}
    </>
  );

  const [statSort, setStatSort] = useState("point");
  const statCols = [
    { key: "name", label: "선수" },
    { key: "games", label: "경기" },
    { key: "goals", label: "골" },
    { key: "assists", label: "어시" },
    { key: "ownGoals", label: "자책" },
    { key: "crova", label: "🍀" },
    { key: "goguma", label: "🍠" },
    { key: "point", label: "PT" },
    { key: "cleanSheets", label: "CS" },
    { key: "keeperGames", label: "GK" },
    { key: "conceded", label: "실점" },
    { key: "concededRate", label: "실점률" },
  ];

  const sortedMembers = [...members].sort((a, b) => {
    if (statSort === "name") return a.name.localeCompare(b.name, "ko");
    const primary = (b[statSort] || 0) - (a[statSort] || 0);
    if (primary !== 0) return primary;
    if (statSort !== "point") { const d = (b.point || 0) - (a.point || 0); if (d !== 0) return d; }
    if (statSort !== "goals") { const d = (b.goals || 0) - (a.goals || 0); if (d !== 0) return d; }
    if (statSort !== "assists") { const d = (b.assists || 0) - (a.assists || 0); if (d !== 0) return d; }
    return a.name.localeCompare(b.name, "ko");
  });

  const rankBadge = (rank) => {
    if (rank === 1) return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#78350f", fontSize: 11, fontWeight: 800 }}>1</span>;
    if (rank === 2) return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #d1d5db, #9ca3af)", color: "#374151", fontSize: 11, fontWeight: 800 }}>2</span>;
    if (rank === 3) return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #d97706, #92400e)", color: "#fef3c7", fontSize: 11, fontWeight: 800 }}>3</span>;
    return <span style={{ fontSize: 11, color: C.gray, fontWeight: 600, minWidth: 22, textAlign: "center", display: "inline-block" }}>{rank}</span>;
  };

  const renderRoster = () => (
    <div style={ds.section}>
      <div style={ds.sectionTitle}>개인 누적 기록 <span style={{ fontSize: 11, fontWeight: 400, color: C.gray }}>({members.length}명)</span></div>
      <div style={{ ...ds.card, overflowX: "auto", padding: 8 }}>
        {membersLoading ? (
          <div style={{ textAlign: "center", color: C.gray, fontSize: 13, padding: 8 }}>불러오는 중...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={ds.thStyle}>#</th>
                {statCols.map(col => (
                  <th key={col.key} onClick={() => setStatSort(col.key)}
                    style={{ ...ds.thStyle, cursor: "pointer", color: statSort === col.key ? C.accent : C.gray }}>
                    {col.label}{statSort === col.key ? " ▼" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((p, i) => {
                const rank = i + 1;
                const isTop3 = rank <= 3;
                const prev = prevRanks[p.name];
                const hasPrev = prev != null;
                const diff = hasPrev ? prev - rank : 0;
                return (
                  <tr key={i} style={{ background: isTop3 ? `${C.accent}08` : "transparent" }}>
                    <td style={{ ...ds.tdStyle(false), padding: "5px 1px" }}>{rankBadge(rank)}</td>
                    <td style={{ ...ds.tdStyle(true), textAlign: "left", paddingLeft: 4, whiteSpace: "nowrap" }}>
                      {p.name}
                      {diff !== 0 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: diff > 0 ? C.green : C.red, marginLeft: 3 }}>
                          {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
                        </span>
                      )}
                    </td>
                    <td style={ds.tdStyle(false)}>{p.games}</td>
                    <td style={ds.tdStyle(p.goals > 0)}>{p.goals}</td>
                    <td style={ds.tdStyle(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...ds.tdStyle(p.ownGoals > 0), color: p.ownGoals > 0 ? C.red : undefined }}>{p.ownGoals}</td>
                    <td style={ds.tdStyle(p.crova > 0)}>{p.crova || 0}</td>
                    <td style={{ ...ds.tdStyle(p.goguma > 0), color: p.goguma > 0 ? C.red : undefined }}>{p.goguma || 0}</td>
                    <td style={{ ...ds.tdStyle(true), fontWeight: 800, color: C.accent }}>{p.point}</td>
                    <td style={ds.tdStyle(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={ds.tdStyle(false)}>{p.keeperGames}</td>
                    <td style={ds.tdStyle(false)}>{p.conceded}</td>
                    <td style={ds.tdStyle(false)}>{p.concededRate || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  : `${completedCount}매치 완료`;
                const attendeeCount = (gs.attendees || []).length;
                // gameId = "g_1234567890" → 타임스탬프에서 날짜 추출
                const gameTs = game.gameId?.startsWith("g_") ? parseInt(game.gameId.slice(2)) : null;
                const gameDate = gameTs ? new Date(gameTs) : (game.savedAt ? new Date(game.savedAt) : null);
                const dateFmt = gameDate ? `${gameDate.getMonth() + 1}/${gameDate.getDate()}` : "";

                const isSummary = gs.phase === "summary";
                return (
                  <div key={game.gameId} style={{ ...ds.card, border: `1px solid ${isSummary ? C.orange : C.green}44`, cursor: "pointer", marginBottom: 8 }}
                    onClick={() => onContinueGame(game.gameId)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          {dateFmt && <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>{dateFmt}</span>}
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{roundInfo}</span>
                          {isSummary
                            ? <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${C.orange}22`, color: C.orange, fontWeight: 600 }}>마감됨</span>
                            : <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#22c55e22", color: "#22c55e", fontWeight: 600 }}>진행중</span>
                          }
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

      <div style={{ marginTop: 16 }}>
        <button onClick={onViewHistory} style={{ ...ds.btn(C.cardLight, C.white), width: "100%" }}>과거 경기 조회</button>
      </div>
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
            <button onClick={onSettings} style={{ background: C.headerBtnBg, color: C.headerBtnColor, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              설정
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
          { key: "records", label: "대시보드" },
          { key: "roster", label: "개인기록" },
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

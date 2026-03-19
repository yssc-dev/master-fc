import { useState, useEffect } from 'react';
import { fetchSheetData } from '../../services/sheetService';
import { useTheme } from '../../hooks/useTheme';

export default function TeamDashboard({ authUser, teamName, teamEntries, onStartGame, onContinueGame, onViewHistory, onSwitchTeam, onLogout, hasPendingGame, checkingPending }) {
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

  const renderRecords = () => (
    <>
      <div style={ds.section}>
        <div style={ds.sectionTitle}>{activeSport} 시즌 기록</div>
        <div style={ds.card}>
          {membersLoading ? (
            <div style={{ textAlign: "center", color: C.gray, fontSize: 13, padding: 8 }}>불러오는 중...</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{members.reduce((s, p) => s + (p.games || 0), 0)}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>총 경기수</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{members.length}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>등록 선수</div>
                </div>
              </div>
              {members.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>포인트 TOP 5</div>
                  {members.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: i < 4 ? `1px solid ${C.borderColor}` : "none" }}>
                      <span><span style={{ color: C.orange, fontWeight: 700, marginRight: 6 }}>{i + 1}위</span>{p.name}</span>
                      <span style={{ color: C.accent, fontWeight: 600 }}>{p.point}pt · {p.games}경기</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={ds.section}>
        <button onClick={onViewHistory} style={{ ...ds.btn(C.cardLight, C.white) }}>과거 경기 조회</button>
      </div>
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
          {hasPendingGame && (
            <div style={{ marginBottom: 16 }}>
              <div style={ds.sectionTitle}>진행중인 경기</div>
              <div style={{ ...ds.card, border: `1px solid ${C.green}44`, cursor: "pointer" }} onClick={onContinueGame}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>이어서 하기</div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>기록 중인 경기가 있습니다</div>
                  </div>
                  <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>진행중 ▶</span>
                </div>
              </div>
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
          { key: "games", label: "경기관리", badge: hasPendingGame },
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

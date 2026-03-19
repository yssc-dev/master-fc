import { useState, useEffect } from 'react';
import { fetchSheetData } from '../../services/sheetService';
import { C } from '../../config/constants';

const ds = {
  container: { background: "#0f172a", minHeight: "100vh", color: "#f8fafc", fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: 500, margin: "0 auto" },
  header: { background: "linear-gradient(135deg, #0891b2, #6366f1)", padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 100 },
  section: { padding: "0 16px", marginBottom: 16 },
  card: { background: "#1e293b", borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
  sportTab: (active) => ({ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: active ? "#22d3ee" : "#334155", color: active ? "#0f172a" : "#94a3b8" }),
  btn: (bg, tc = "#fff") => ({ background: bg, color: tc, border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }),
  mainTab: (active, hasBadge) => ({
    flex: 1, padding: "12px 8px", textAlign: "center", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
    background: active ? C.card : "transparent", color: active ? C.white : C.gray,
    borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
    position: "relative",
  }),
};

export default function TeamDashboard({ authUser, teamName, teamEntries, onStartGame, onContinueGame, onViewHistory, onSwitchTeam, onLogout, hasPendingGame, checkingPending }) {
  const [activeSport, setActiveSport] = useState(teamEntries[0]?.mode || "풋살");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("records"); // "records" | "roster" | "games"

  const activeEntry = teamEntries.find(e => e.mode === activeSport) || teamEntries[0];

  useEffect(() => {
    fetchSheetData()
      .then(data => setMembers(data.players || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, []);

  const renderRecords = () => (
    <>
      <div style={ds.section}>
        <div style={ds.sectionTitle}>{activeSport} 시즌 기록</div>
        <div style={ds.card}>
          {membersLoading ? (
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 8 }}>불러오는 중...</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#22d3ee" }}>{members.reduce((s, p) => s + (p.games || 0), 0)}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>총 경기수</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>{members.length}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>등록 선수</div>
                </div>
              </div>
              {members.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>포인트 TOP 5</div>
                  {members.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: i < 4 ? "1px solid #334155" : "none" }}>
                      <span><span style={{ color: "#f59e0b", fontWeight: 700, marginRight: 6 }}>{i + 1}위</span>{p.name}</span>
                      <span style={{ color: "#22d3ee", fontWeight: 600 }}>{p.point}pt · {p.games}경기</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={ds.section}>
        <button onClick={onViewHistory} style={{ ...ds.btn("#334155", "#f8fafc") }}>
          과거 경기 조회
        </button>
      </div>
    </>
  );

  const renderRoster = () => (
    <div style={ds.section}>
      <div style={ds.sectionTitle}>팀원 명단 {!membersLoading && `(${members.length}명)`}</div>
      <div style={ds.card}>
        {membersLoading ? (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 8 }}>불러오는 중...</div>
        ) : members.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 8 }}>등록된 선수가 없습니다</div>
        ) : (
          <div>
            {members.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < members.length - 1 ? "1px solid #334155" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, minWidth: 28 }}>#{p.backNum || "-"}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                  {i < 3 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#f59e0b22", color: "#f59e0b", fontWeight: 600 }}>{i + 1}위</span>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>{p.point}pt</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{p.games}경기 · PPG {p.ppg}</div>
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
        <div style={{ textAlign: "center", padding: 20, color: "#94a3b8", fontSize: 13 }}>진행중인 경기 확인 중...</div>
      ) : (
        <>
          {/* 진행중 경기 */}
          {hasPendingGame && (
            <div style={{ marginBottom: 16 }}>
              <div style={ds.sectionTitle}>진행중인 경기</div>
              <div style={{ ...ds.card, border: "1px solid #22c55e44", cursor: "pointer" }} onClick={onContinueGame}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>이어서 하기</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>기록 중인 경기가 있습니다</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                    <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>진행중 ▶</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 새 경기 */}
          <div>
            <div style={ds.sectionTitle}>새 경기</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ ...ds.card, cursor: "pointer", border: "1px solid #334155", transition: "border-color 0.2s" }}
                onClick={() => onStartGame("sheetSync")}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#22d3ee"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24 }}>📋</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>구글시트 연동</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>시트에서 참석자/팀수를 읽어 자동 편성</div>
                  </div>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>▶</span>
                </div>
              </div>

              <div style={{ ...ds.card, cursor: "pointer", border: "1px solid #334155", transition: "border-color 0.2s" }}
                onClick={() => onStartGame("custom")}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#22d3ee"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24 }}>⚙️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>커스텀 경기</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>참석자 선택 → 팀 편성 → 경기 진행</div>
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
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {authUser.name}님
              {activeEntry?.role === "관리자" && <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.2)" }}>관리자</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onSwitchTeam} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              팀 전환
            </button>
            <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              로그아웃
            </button>
          </div>
        </div>
        {/* 종목 탭 */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
          {teamEntries.map(e => (
            <button key={e.mode} style={ds.sportTab(e.mode === activeSport)} onClick={() => setActiveSport(e.mode)}>
              {e.mode}
            </button>
          ))}
        </div>
      </div>

      {/* 메인 탭 네비게이션 */}
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

const hs = {
  container: { background: "#0f172a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" },
  title: { fontSize: 22, fontWeight: 800, color: "#f8fafc", marginTop: 40, marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#94a3b8", marginBottom: 24 },
  card: { background: "#1e293b", borderRadius: 16, padding: 20, width: "100%", maxWidth: 340, marginBottom: 12, cursor: "pointer", border: "1px solid #334155", transition: "border-color 0.2s" },
  sportBadge: (mode) => ({ fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 600, background: mode === "축구" ? "#3b82f622" : "#22d3ee22", color: mode === "축구" ? "#3b82f6" : "#22d3ee", marginRight: 4 }),
};

export default function HomeScreen({ authUser, teamGroups, onSelectTeam, onLogout }) {
  const teamNames = Object.keys(teamGroups);

  return (
    <div style={hs.container}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>⚽</div>
      <div style={hs.title}>{authUser.name}님</div>
      <div style={hs.subtitle}>팀을 선택하세요</div>

      {teamNames.map(teamName => {
        const entries = teamGroups[teamName];
        const sports = entries.map(e => e.mode);
        const isAdmin = entries.some(e => e.role === "관리자");
        return (
          <div key={teamName} style={hs.card} onClick={() => onSelectTeam(teamName, entries)}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#22d3ee"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#f8fafc" }}>{teamName}</div>
              {isAdmin && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#f9731622", color: "#f97316", fontWeight: 600 }}>관리자</span>}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {sports.map((s, i) => <span key={i} style={hs.sportBadge(s)}>{s}</span>)}
            </div>
          </div>
        );
      })}

      <div style={{ width: "100%", maxWidth: 340, borderTop: "1px solid #475569", marginTop: 12, paddingTop: 16 }}>
        <button onClick={onLogout} style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #475569", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

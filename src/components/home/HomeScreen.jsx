import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function HomeScreen({ authUser, teamGroups, selectedTeamName, onSelectTeam, onLogout }) {
  const { C, mode, toggle } = useTheme();
  const [showAddInfo, setShowAddInfo] = useState(false);
  const teamNames = Object.keys(teamGroups);

  const sportBadge = (m) => ({ fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 600, background: m === "축구" ? "#3b82f622" : `${C.accent}22`, color: m === "축구" ? "#3b82f6" : C.accent, marginRight: 4 });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <button onClick={toggle} style={{ position: "fixed", top: 16, right: 16, background: C.cardLight, color: C.gray, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", zIndex: 10 }}>
        {mode === "dark" ? "☀️" : "🌙"}
      </button>
      <div style={{ fontSize: 36, marginBottom: 8 }}>⚽</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginTop: 40, marginBottom: 4 }}>{authUser.name}님</div>
      <div style={{ fontSize: 13, color: C.gray, marginBottom: 24 }}>팀을 선택하세요</div>

      {teamNames.map(teamName => {
        const entries = teamGroups[teamName];
        const sports = entries.map(e => e.mode);
        const isAdmin = entries.some(e => e.role === "관리자");
        const isSelected = teamName === selectedTeamName;
        return (
          <div key={teamName} style={{ background: C.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 340, marginBottom: 12, cursor: "pointer", border: `1px solid ${isSelected ? C.accent : C.borderColor}`, transition: "border-color 0.2s" }}
            onClick={() => onSelectTeam(teamName, entries)}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = C.borderColor; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.white }}>{teamName}</div>
                {isSelected && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${C.accent}22`, color: C.accent, fontWeight: 600 }}>현재</span>}
              </div>
              {isAdmin && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#f9731622", color: "#f97316", fontWeight: 600 }}>관리자</span>}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {sports.map((s, i) => <span key={i} style={sportBadge(s)}>{s}</span>)}
            </div>
          </div>
        );
      })}

      <div style={{ background: "transparent", borderRadius: 16, padding: 20, width: "100%", maxWidth: 340, marginBottom: 12, cursor: "pointer", border: `1px dashed ${C.grayDark}`, textAlign: "center", transition: "border-color 0.2s" }}
        onClick={() => setShowAddInfo(true)}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.grayDark}>
        <div style={{ fontSize: 20, marginBottom: 4 }}>+</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.gray }}>팀 추가하기</div>
      </div>

      {showAddInfo && (
        <div style={{ width: "100%", maxWidth: 340, background: C.card, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${C.borderColor}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 8 }}>팀 추가 방법</div>
          <div style={{ fontSize: 13, color: C.gray, lineHeight: 1.6 }}>
            관리자에게 <b style={{ color: C.accent }}>회원인증 시트</b>에 등록을 요청하세요.
          </div>
          <div style={{ fontSize: 12, color: C.grayDark, marginTop: 8, lineHeight: 1.5 }}>
            시트에 팀이름, 이름, 휴대폰뒷자리를 등록하면 다음 로그인 시 자동으로 팀 목록에 나타납니다.
          </div>
          <button onClick={() => setShowAddInfo(false)} style={{ background: C.cardLight, color: C.gray, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 10, width: "100%" }}>
            닫기
          </button>
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 340, borderTop: `1px solid ${C.grayDark}`, marginTop: 12, paddingTop: 16 }}>
        <button onClick={onLogout} style={{ background: C.card, color: C.gray, border: `1px solid ${C.grayDark}`, borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

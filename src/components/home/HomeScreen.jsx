import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { SunIcon, MoonIcon, CheckIcon, ChevronRight, PlusIcon } from '../common/icons';

export default function HomeScreen({ authUser, teamGroups, selectedTeamName, onSelectTeam, onLogout }) {
  const { mode, toggle } = useTheme();
  const [showAddInfo, setShowAddInfo] = useState(false);
  const teamNames = Object.keys(teamGroups);

  return (
    <div style={{
      background: "var(--app-bg-grouped)", minHeight: "100vh",
      padding: "60px 16px 40px", maxWidth: 500, margin: "0 auto",
      fontFamily: "var(--app-font-sans)",
    }}>
      <button onClick={toggle} style={{
        position: "fixed", top: 16, right: 16, zIndex: 10,
        background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
        borderRadius: 999, width: 36, height: 36,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "var(--app-text-primary)", cursor: "pointer",
      }}>
        {mode === "dark" ? <SunIcon width={16}/> : <MoonIcon width={16}/>}
      </button>

      <div style={{ margin: "24px 0 28px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1,
                     letterSpacing: "-0.022em", margin: 0,
                     color: "var(--app-text-primary)" }}>
          안녕, {authUser.name}
        </h1>
        <p style={{ fontSize: 15, color: "var(--app-text-secondary)", marginTop: 6 }}>
          팀을 선택해주세요
        </p>
      </div>

      <div className="app-section-label">팀</div>
      <div className="app-grouped" style={{ marginBottom: 24 }}>
        {teamNames.map(teamName => {
          const entries = teamGroups[teamName];
          const isCurrent = teamName === selectedTeamName;
          const isAdmin = entries.some(e => e.role === "관리자");
          return (
            <button key={teamName} className="app-row"
              onClick={() => onSelectTeam(teamName, entries)}
              style={{ width: "100%", textAlign: "left",
                       background: "var(--app-bg-row)",
                       border: 0, fontFamily: "inherit", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="app-row-title" style={{ fontWeight: 500 }}>{teamName}</span>
                  {isAdmin && (
                    <span style={{
                      fontSize: 11, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(255,149,0,0.15)", color: "var(--app-orange)",
                      fontWeight: 500,
                    }}>관리자</span>
                  )}
                </div>
                <div className="app-row-sub">{entries.map(e => e.mode).join(" · ")}</div>
              </div>
              {isCurrent && <CheckIcon color="var(--app-blue)" width={18} />}
              <ChevronRight color="var(--app-text-tertiary)" width={14} />
            </button>
          );
        })}
      </div>

      <div className="app-section-label">기타</div>
      <div className="app-grouped" style={{ marginBottom: 24 }}>
        <button className="app-row" onClick={() => setShowAddInfo(true)}
          style={{ width: "100%", textAlign: "left", background: "var(--app-bg-row)",
                   border: 0, fontFamily: "inherit", cursor: "pointer",
                   color: "var(--app-blue)" }}>
          <PlusIcon color="var(--app-blue)" width={18} />
          <span className="app-row-title" style={{ color: "var(--app-blue)" }}>팀 추가하기</span>
        </button>
        <button className="app-row" onClick={onLogout}
          style={{ width: "100%", textAlign: "left", background: "var(--app-bg-row)",
                   border: 0, fontFamily: "inherit", cursor: "pointer",
                   color: "var(--app-red)" }}>
          <span className="app-row-title" style={{ color: "var(--app-red)" }}>로그아웃</span>
        </button>
      </div>

      {showAddInfo && (
        <div className="app-grouped" style={{ marginBottom: 16 }}>
          <div className="app-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)" }}>팀 추가 방법</div>
            <div style={{ fontSize: 14, color: "var(--app-text-secondary)", lineHeight: 1.5 }}>
              관리자에게 <b style={{ color: "var(--app-text-primary)" }}>회원인증 시트</b>에 등록을 요청하세요.
            </div>
            <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", lineHeight: 1.5 }}>
              시트에 팀이름, 이름, 휴대폰뒷자리를 등록하면 다음 로그인 시 자동으로 팀 목록에 나타납니다.
            </div>
            <button onClick={() => setShowAddInfo(false)} style={{
              background: "var(--app-bg-row-hover)", color: "var(--app-text-secondary)",
              border: "none", borderRadius: 8, padding: "8px 12px",
              fontSize: 13, fontWeight: 500, cursor: "pointer", marginTop: 4,
              alignSelf: "flex-end",
            }}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

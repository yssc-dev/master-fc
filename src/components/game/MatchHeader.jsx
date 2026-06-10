import { BackIcon } from '../common/icons';

// 풋살/축구 공통 경기 진행 헤더. 풋살 App.jsx의 HIG sticky 헤더를 그대로 옮긴 것(룩 기준).
// CSS 변수만 사용. children 슬롯에 탭바(MatchTabBar)를 넣어 한 sticky 헤더로 구성.
export default function MatchHeader({ title, subtitle, onHome, syncStatus, children }) {
  return (
    <div style={{
      padding: "20px 16px 12px", background: "var(--app-bg-grouped)",
      position: "sticky", top: 0, zIndex: 100,
      borderBottom: "0.5px solid var(--app-divider)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={onHome} aria-label="홈으로" style={{
          width: 36, height: 36, borderRadius: 999,
          background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
          color: "var(--app-text-primary)", cursor: "pointer", padding: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <BackIcon width={16} />
        </button>
        <div style={{ flex: 1 }} />
        {syncStatus && (
          <div style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 500,
            background: syncStatus === "saved" ? "rgba(52,199,89,0.12)" : syncStatus === "saving" ? "rgba(0,122,255,0.12)" : "rgba(255,59,48,0.12)",
            color: syncStatus === "saved" ? "var(--app-green)" : syncStatus === "saving" ? "var(--app-blue)" : "var(--app-red)",
          }}>
            {syncStatus === "saving" ? "저장 중…" : syncStatus === "saved" ? "저장됨" : "저장 실패"}
          </div>
        )}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em", color: "var(--app-text-primary)", margin: 0, lineHeight: 1.1 }}>{title}</h1>
      {subtitle != null && <div style={{ fontSize: 14, color: "var(--app-text-secondary)", marginTop: 4 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

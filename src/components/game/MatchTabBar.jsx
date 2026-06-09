// 풋살/축구 공통 상단 메뉴 탭바.
// 스타일은 풋살(App.jsx)의 pillBtnStyle/컨테이너를 그대로 옮긴 것 — 룩앤필 기준.
// CSS 변수만 사용해 두 모드에서 동일하게 렌더됨(테마 C 객체 비의존).
const pillBtnStyle = ({ tone = "neutral", strong = false } = {}) => {
  const toneMap = {
    neutral: { bg: "var(--app-bg-row)", fg: "var(--app-text-primary)", border: "0.5px solid var(--app-divider)" },
    green:   { bg: strong ? "var(--app-green)" : "rgba(52,199,89,0.12)",  fg: strong ? "#fff" : "var(--app-green)",  border: "none" },
    orange:  { bg: strong ? "var(--app-orange)" : "rgba(255,149,0,0.12)", fg: strong ? "#fff" : "var(--app-orange)", border: "none" },
    red:     { bg: strong ? "var(--app-red)" : "rgba(255,59,48,0.12)",    fg: strong ? "#fff" : "var(--app-red)",    border: "none" },
  };
  const t = toneMap[tone] || toneMap.neutral;
  return {
    flexShrink: 0, padding: "7px 14px", borderRadius: 999,
    background: t.bg, color: t.fg, border: t.border,
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    letterSpacing: "-0.01em", whiteSpace: "nowrap",
  };
};

/**
 * @param {{ tabs: Array<{ key, label, onClick, tone?, strong?, hidden? }> }} props
 * 모드별로 hidden 플래그로 버튼을 숨기면 됨.
 */
export default function MatchTabBar({ tabs = [] }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
      {tabs.filter(t => !t.hidden).map(t => (
        <button key={t.key} onClick={t.onClick} style={pillBtnStyle({ tone: t.tone, strong: t.strong })}>{t.label}</button>
      ))}
    </div>
  );
}

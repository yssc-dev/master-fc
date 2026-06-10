// 풋살/축구 공통 하단 확정 바. 풋살 s.bottomBar(fixed 하단)를 CSS변수로 자립화.
// 내용(확정/확정취소 라벨·버튼)은 children으로 받아 모드별 분기.
export default function ConfirmBar({ children }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 500, zIndex: 100,
      background: "var(--app-bg-row)", borderTop: "0.5px solid var(--app-divider)",
      padding: "10px 16px", paddingBottom: "max(20px, env(safe-area-inset-bottom))",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap",
    }}>
      {children}
    </div>
  );
}

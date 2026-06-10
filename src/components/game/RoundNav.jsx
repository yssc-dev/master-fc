import { BackIcon } from '../common/icons';

// 풋살/축구 공통 라운드/경기 네비게이션. 풋살 ScheduleMatchView의 ◀ 라운드 N/M ▶ + 상태칩 패턴 이식.
// label/total/statusText는 prop으로 받아 모드별 용어("라운드"/"제N경기")에 비의존.
export default function RoundNav({ label, total, onPrev, onNext, canPrev = true, canNext = true, statusText, statusTone = "gray" }) {
  const btn = (disabled) => ({
    width: 36, height: 36, borderRadius: 999,
    background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
    color: "var(--app-text-primary)", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.3 : 1, padding: 0, fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  });
  const toneColor = statusTone === "green" ? "var(--app-green)"
    : statusTone === "orange" ? "var(--app-orange)"
    : "var(--app-text-secondary)";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, padding: "4px 0" }}>
      <button onClick={onPrev} disabled={!canPrev} aria-label="이전" style={btn(!canPrev)}>
        <BackIcon width={16} />
      </button>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)", letterSpacing: "-0.022em" }}>
          {label}{total != null && <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}> / {total}</span>}
        </div>
        {statusText && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: toneColor }}>{statusText}</div>}
      </div>
      <button onClick={onNext} disabled={!canNext} aria-label="다음" style={btn(!canNext)}>
        <BackIcon width={16} style={{ transform: "rotate(180deg)" }} />
      </button>
    </div>
  );
}

# 06. Modal → iOS 시트 스타일

**파일:** `src/components/common/Modal.jsx`

## 문제
현재 Modal이 top 40px에서 시작하는 top-aligned centered modal이라 iOS 느낌과 거리가 있음. 모바일에서는 **바텀시트**, 데스크탑/md+에서는 **중앙 시트** 로 통일.

## 고치는 방법

`Modal.jsx`를 다음으로 교체:

```jsx
import { useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { XIcon } from './icons';  // 04 프롬프트에서 추가

export default function Modal({ onClose, children, title, maxWidth = 460 }) {
  const { C } = useTheme();

  // ESC 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "modalFade 180ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="app-modal-sheet"
        style={{
          background: "var(--app-bg-elevated)",
          color: C.white,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          width: "100%", maxWidth,
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "var(--app-shadow-lg)",
          animation: "sheetSlideUp 240ms cubic-bezier(.2,.7,.2,1)",
          overflow: "hidden",
        }}
      >
        {/* grabber bar (iOS) */}
        <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 0" }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: "var(--app-gray-4)" }} />
        </div>

        {title && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 16px 8px",
            borderBottom: "0.5px solid var(--app-divider)",
          }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: C.white, letterSpacing: "-0.022em" }}>
              {title}
            </span>
            <button
              onClick={onClose}
              aria-label="닫기"
              style={{
                background: "var(--app-bg-row-hover)",
                border: 0, borderRadius: 999,
                width: 28, height: 28,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: "var(--app-text-secondary)",
                cursor: "pointer",
              }}
            >
              <XIcon width={14} />
            </button>
          </div>
        )}
        <div style={{ padding: 16, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
```

## CSS 애니메이션 추가

`global.css` 맨 아래에:

```css
@keyframes modalFade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes sheetSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

/* md+ 에서는 중앙 정렬 */
@media (min-width: 768px) {
  .app-modal-sheet {
    border-radius: 14px !important;
    margin: auto;
    max-height: 80vh !important;
  }
  /* 부모(overlay)도 중앙 정렬로 오버라이드하려면 data-attr 기반 */
}
```

md+에서 시트가 중앙에 오게 하려면 overlay의 `alignItems`를 조건부로 지정:

```jsx
const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
...
alignItems: isDesktop ? "center" : "flex-end",
```

또는 CSS 매체 쿼리로 처리 — `data-align="auto"` 속성을 overlay에 붙이고 CSS에서 @media로 align-items 오버라이드.

## 검증
- [ ] 모바일에서 바텀시트로 아래에서 슬라이드 업 됨
- [ ] 상단에 grabber bar (회색 작은 막대) 표시
- [ ] 백드롭에 blur 효과
- [ ] md+에서 중앙 정렬 시트
- [ ] ESC 키로 닫힘
- [ ] 기존 PlayerStatsModal, StandingsModal, ScheduleModal 등 Modal 사용처 전부 정상 작동
- [ ] lint 통과

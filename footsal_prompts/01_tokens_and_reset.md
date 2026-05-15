# 01. Apple 디자인 토큰 도입

**파일:** `src/styles/app_tokens.css` (신규), `src/styles/global.css` (수정), `src/main.jsx` (import 추가)

## 목표
현재 `theme.js`의 `C` 객체는 흑백 Monochrome용. Apple 디자인의 semantic color (systemBlue, systemGreen, label, secondaryLabel, systemGroupedBackground 등)를 전체에 주입. 기존 `C.*` 레퍼런스는 유지하되 값만 Apple 팔레트로 교체하는 게 핵심.

## 할 일

### 1. `src/styles/app_tokens.css` 신규 작성

```css
:root {
  /* Apple system colors — light */
  --app-blue:    #007AFF;
  --app-blue-2:  #5AC8FA;
  --app-green:   #34C759;
  --app-red:     #FF3B30;
  --app-orange:  #FF9500;
  --app-yellow:  #FFCC00;
  --app-purple:  #AF52DE;
  --app-indigo:  #5856D6;
  --app-pink:    #FF2D55;

  /* Neutral grays (iOS) */
  --app-gray:     #8E8E93;
  --app-gray-2:   #AEAEB2;
  --app-gray-3:   #C7C7CC;
  --app-gray-4:   #D1D1D6;
  --app-gray-5:   #E5E5EA;
  --app-gray-6:   #F2F2F7;

  /* Semantic — light */
  --app-bg:                 #FFFFFF;
  --app-bg-grouped:         #F2F2F7;
  --app-bg-elevated:        #FFFFFF;
  --app-bg-row:             #FFFFFF;
  --app-bg-row-hover:       #F2F2F7;
  --app-separator:          rgba(60,60,67,0.29);
  --app-divider:            rgba(60,60,67,0.12);
  --app-border:             rgba(60,60,67,0.18);

  --app-text-primary:       #000000;
  --app-text-secondary:     rgba(60,60,67,0.6);
  --app-text-tertiary:      rgba(60,60,67,0.3);
  --app-text-inverse:       #FFFFFF;
  --app-text-placeholder:   rgba(60,60,67,0.3);

  /* Type scale */
  --app-text-xs:   12px;
  --app-text-sm:   13px;
  --app-text-base: 15px;
  --app-text-md:   17px;   /* iOS body */
  --app-text-lg:   20px;
  --app-text-xl:   28px;
  --app-text-display: 34px;

  /* Spacing */
  --app-space-1: 4px;
  --app-space-2: 8px;
  --app-space-3: 12px;
  --app-space-4: 16px;
  --app-space-5: 20px;
  --app-space-6: 24px;

  /* Radius */
  --app-radius-sm:  6px;
  --app-radius:     10px;
  --app-radius-lg:  14px;
  --app-radius-xl:  20px;

  /* Shadow */
  --app-shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --app-shadow:    0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --app-shadow-lg: 0 10px 30px rgba(0,0,0,0.12);

  /* Font */
  --app-font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard',
                   'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
  --app-font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
}

[data-theme="dark"] {
  --app-bg:                 #000000;
  --app-bg-grouped:         #000000;
  --app-bg-elevated:        #1C1C1E;
  --app-bg-row:             #1C1C1E;
  --app-bg-row-hover:       #2C2C2E;
  --app-separator:          rgba(84,84,88,0.65);
  --app-divider:            rgba(84,84,88,0.4);
  --app-border:             rgba(84,84,88,0.5);

  --app-text-primary:       #FFFFFF;
  --app-text-secondary:     rgba(235,235,245,0.6);
  --app-text-tertiary:      rgba(235,235,245,0.3);
  --app-text-placeholder:   rgba(235,235,245,0.3);

  --app-blue:    #0A84FF;
  --app-green:   #30D158;
  --app-red:     #FF453A;
  --app-orange:  #FF9F0A;
  --app-yellow:  #FFD60A;
  --app-purple:  #BF5AF2;

  --app-shadow-sm: 0 1px 2px rgba(0,0,0,0.5);
  --app-shadow:    0 1px 3px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5);
  --app-shadow-lg: 0 10px 30px rgba(0,0,0,0.8);
}

/* Grouped list primitives — used by all screens */
.app-grouped {
  background: var(--app-bg-row);
  border-radius: var(--app-radius-lg);
  overflow: hidden;
  border: 1px solid var(--app-divider);
}
.app-row {
  display: flex; align-items: center; gap: var(--app-space-3);
  padding: 12px var(--app-space-4);
  min-height: 44px;
  background: var(--app-bg-row);
  border-bottom: 0.5px solid var(--app-divider);
  color: var(--app-text-primary);
  font-size: var(--app-text-md);
}
.app-row:last-child { border-bottom: none; }
.app-row-title { flex: 1; min-width: 0; color: var(--app-text-primary); font-weight: 400; }
.app-row-sub   { font-size: var(--app-text-sm); color: var(--app-text-secondary); margin-top: 2px; }
.app-row-meta  { color: var(--app-text-secondary); font-variant-numeric: tabular-nums; font-size: var(--app-text-md); }

.app-section-label {
  font-size: 13px;
  color: var(--app-text-secondary);
  font-weight: 400;
  margin: 0 0 var(--app-space-2) var(--app-space-4);
  text-transform: none;
  letter-spacing: 0;
}
```

### 2. `src/styles/global.css` 업데이트

- 상단 Google Fonts import (`Inter`, `JetBrains Mono`) 유지. (SF Pro가 macOS/iOS에서 자동, 타 OS는 Pretendard fallback)
- `body` 스타일을 다음으로 교체:

```css
body {
  font-family: var(--app-font-sans);
  font-size: var(--app-text-md);
  line-height: 1.4;
  letter-spacing: -0.014em;
  color: var(--app-text-primary);
  background: var(--app-bg-grouped);
}
[data-theme="light"] body { background: var(--app-bg-grouped); }
[data-theme="dark"]  body { background: var(--app-bg-grouped); }
```

- 기존 `letter-spacing: -0.14px` 하드값 제거 (em 기반으로 교체)

### 3. `src/main.jsx`에 import 추가

```jsx
import './styles/app_tokens.css';
import './styles/global.css';
```
`app_tokens.css`가 먼저여야 `global.css`가 변수를 읽을 수 있다.

## 검증
- [ ] 브라우저 DevTools → `:root`에서 `--app-*` 변수 확인
- [ ] `[data-theme="dark"]` 속성 붙은 html에서 `--app-text-primary`가 흰색으로 바뀜
- [ ] 기존 화면 시각적으로는 아직 변화 없음 (C 객체가 아직 구식 — 다음 프롬프트에서 교체)
- [ ] lint 통과

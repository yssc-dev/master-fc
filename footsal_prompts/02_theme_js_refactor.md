# 02. theme.js + useTheme.jsx — Apple 팔레트로 C 객체 교체

**파일:** `src/hooks/useTheme.jsx`, `src/styles/theme.js`

## 목표
수많은 컴포넌트가 `const { C } = useTheme()` + `makeStyles(C)` 패턴을 쓰고 있음. 시그니처 유지하면서 **값만 Apple 팔레트로 교체** + `makeStyles` 결과가 Apple 룩으로 보이게 리팩터.

## 1. useTheme.jsx — C 팔레트 교체

기존 `light`/`dark` 객체 전체 교체 (키 이름은 그대로 유지해 하위 호환):

```js
const light = {
  // 배경
  bg:          "var(--app-bg-grouped)",   // 기존 흰색 → grouped(회색)로 이동
  card:        "var(--app-bg-row)",
  cardLight:   "var(--app-bg-row-hover)",
  borderColor: "var(--app-divider)",

  // accent = Apple systemBlue (기존 black ink 폐기)
  accent:     "var(--app-blue)",
  accentDim:  "var(--app-blue)",

  // 텍스트 (`white` 키는 "전경색" 역할로 그대로 유지)
  white:      "var(--app-text-primary)",
  gray:       "var(--app-text-secondary)",
  grayLight:  "var(--app-text-tertiary)",
  grayDark:   "var(--app-text-tertiary)",
  grayDarker: "var(--app-divider)",

  green:   "var(--app-green)",  greenDim: "var(--app-green)",
  red:     "var(--app-red)",    redDim:   "var(--app-red)",
  orange:  "var(--app-orange)",
  yellow:  "var(--app-yellow)",
  purple:  "var(--app-purple)",

  headerBg:           "rgba(255,255,255,0.8)",
  overlay:            "rgba(0,0,0,0.45)",
  overlayLight:       "rgba(0,0,0,0.25)",
  headerTextDim:      "var(--app-text-secondary)",
  headerBtnBg:        "var(--app-bg-row-hover)",
  headerBtnColor:     "var(--app-blue)",
  headerBtnDimColor:  "var(--app-text-secondary)",
};

const dark = {
  bg:          "var(--app-bg-grouped)",
  card:        "var(--app-bg-row)",
  cardLight:   "var(--app-bg-row-hover)",
  borderColor: "var(--app-divider)",

  accent:     "var(--app-blue)",
  accentDim:  "var(--app-blue)",

  white:      "var(--app-text-primary)",
  gray:       "var(--app-text-secondary)",
  grayLight:  "var(--app-text-tertiary)",
  grayDark:   "var(--app-text-tertiary)",
  grayDarker: "var(--app-divider)",

  green:   "var(--app-green)",  greenDim: "var(--app-green)",
  red:     "var(--app-red)",    redDim:   "var(--app-red)",
  orange:  "var(--app-orange)",
  yellow:  "var(--app-yellow)",
  purple:  "var(--app-purple)",

  headerBg:           "rgba(0,0,0,0.8)",
  overlay:            "rgba(0,0,0,0.6)",
  overlayLight:       "rgba(0,0,0,0.4)",
  headerTextDim:      "var(--app-text-secondary)",
  headerBtnBg:        "var(--app-bg-row-hover)",
  headerBtnColor:     "var(--app-blue)",
  headerBtnDimColor:  "var(--app-text-secondary)",
};
```

값이 CSS 변수 문자열이라 `style={{ background: C.card }}`를 그대로 인라인 지정해도 작동함.

## 2. theme.js — makeStyles 리팩터

전체 파일을 Apple 톤으로 재작성. **함수 시그니처와 키 이름 모두 유지**. 중요한 변화:

- `borderRadius: 50` (pill) → **10px** (btn) / **14px** (card) / **44px** (chip만 pill 유지)
- `dashed border` → **solid 1px** (포커스 링 제외)
- `font-mono uppercase subtitle/sectionTitle` → 일반 한글, 14px, secondary color
- `btn`: Apple filled/tinted 2가지 — 사용처가 bg 색을 넘기면 filled, C.cardLight을 넘기면 tinted로
- `card`: shadow 없이 `border: 1px solid var(--app-divider)` + `border-radius: 14`
- `input`: underline 제거, `background: var(--app-bg-row-hover)` + `border-radius: 10` + `padding: 11px 12px` + focus ring

핵심 교체 스니펫:

```js
title: {
  fontSize: 17, fontWeight: 600,
  color: C.white, letterSpacing: "-0.022em",
},
subtitle: {
  fontFamily: "inherit",  // mono 제거
  fontSize: 13,
  letterSpacing: 0,       // uppercase letter-spacing 제거
  textTransform: "none",  // 한글용
  color: C.gray, marginTop: 2,
},
sectionTitle: {
  fontFamily: "inherit",
  fontSize: 13, letterSpacing: 0, textTransform: "none",
  marginBottom: 8, color: C.gray,
  display: "flex", alignItems: "center", gap: 6,
  paddingLeft: 4,
},
card: {
  background: C.card,
  border: `1px solid ${C.borderColor}`,
  borderRadius: 14, padding: 14, marginBottom: 10,
},
btn: (bg, tc) => ({
  background: bg || C.accent,
  color: tc || "#fff",
  border: "none", borderRadius: 10,
  padding: "11px 16px", minHeight: 40,
  fontSize: 15, fontWeight: 500,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  transition: "opacity .15s, transform .05s",
}),
btnFull: (bg, tc) => ({
  background: bg || C.accent,
  color: tc || "#fff",
  border: "none", borderRadius: 12,
  padding: "13px 18px", minHeight: 50,
  fontSize: 16, fontWeight: 600,
  letterSpacing: "-0.01em",
  cursor: "pointer", width: "100%", display: "block",
}),
btnSm: (bg, tc) => ({
  background: bg || C.cardLight,
  color: tc || C.white,
  border: "none", borderRadius: 8,
  padding: "6px 12px", minHeight: 28,
  fontSize: 13, fontWeight: 500,
  cursor: "pointer",
}),
chip: (active) => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "6px 12px", borderRadius: 999,
  fontSize: 13, fontWeight: 500, margin: 3,
  cursor: "pointer",
  background: active ? C.accent : C.cardLight,
  color: active ? "#fff" : C.white,
  border: "none",
  transition: "all 0.12s",
}),
input: {
  background: C.cardLight,
  border: `1px solid transparent`,
  borderRadius: 10,
  padding: "11px 12px",
  color: C.white, fontSize: 16, fontWeight: 400,
  letterSpacing: "-0.01em",
  outline: "none", width: "100%",
  fontFamily: "inherit",
  transition: "border-color .12s, background .12s",
},
scoreboard: {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
  padding: "8px 0",
  fontSize: 56, fontWeight: 600, letterSpacing: "-0.03em",
  lineHeight: 1, fontVariantNumeric: "tabular-nums",
  color: C.white,
},
th: {
  padding: "8px 4px", textAlign: "center",
  color: C.gray, borderBottom: `1px solid ${C.grayDarker}`,
  fontFamily: "inherit",                      // mono 제거
  fontWeight: 500, fontSize: 12,
  letterSpacing: 0, textTransform: "none",   // uppercase 제거
},
td: (hl = false) => ({
  padding: "10px 4px", textAlign: "center",
  borderBottom: `0.5px solid ${C.grayDarker}`,  // dashed 제거
  fontWeight: hl ? 600 : 400,
  color: hl ? C.white : C.gray, fontSize: 14,
  fontVariantNumeric: "tabular-nums",
}),
tabRow: {
  display: "flex", gap: 6, marginBottom: 12,
  padding: "4px", background: C.cardLight,
  borderRadius: 10,
  overflowX: "auto", scrollbarWidth: "none",
},
tab: (active) => ({
  flex: "0 0 auto", padding: "6px 14px", textAlign: "center",
  background: active ? C.card : "transparent",
  color: active ? C.white : C.gray,
  fontWeight: 500, fontSize: 13,
  letterSpacing: 0,
  border: "none",
  borderRadius: 7,
  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
  cursor: "pointer",
}),
bottomBar: {
  position: "fixed", bottom: 0,
  left: "50%", transform: "translateX(-50%)",
  width: "100%", maxWidth: 500,
  background: C.card,
  borderTop: `0.5px solid ${C.borderColor}`,
  padding: "10px 16px 20px",
  display: "flex", gap: 8, zIndex: 100,
  // iOS safe-area
  paddingBottom: "max(20px, env(safe-area-inset-bottom))",
},
phaseIndicator: {
  display: "flex", justifyContent: "center", gap: 6,
  padding: "8px 0", background: "transparent",
},
dot: (active) => ({
  width: active ? 20 : 6, height: 6,
  borderRadius: 3,
  background: active ? C.accent : C.grayDarker,
  transition: "all .2s",
}),
eventLog: {
  display: "flex", alignItems: "center",
  padding: "10px 12px", borderRadius: 10,
  background: C.cardLight, border: "none",
  marginBottom: 6, fontSize: 14, gap: 8,
  color: C.white,
},
teamCard: (ci) => ({
  background: C.card,
  borderRadius: 14, padding: 14, marginBottom: 10,
  border: `1px solid ${C.borderColor}`,
  boxShadow: "none",  // 기존 inset 제거
  // 대신 팀 색은 타이틀 옆 작은 dot으로 이동 (03 프롬프트에서)
}),
playerInTeam: (color) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 10px", borderRadius: 999,
  fontSize: 13, fontWeight: 500, margin: 2,
  background: C.cardLight, color: C.white, border: "none",
  "--dot-color": color?.bg || "transparent",
}),
matchBtn: (color) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: 6, padding: "10px 14px", borderRadius: 10,
  fontSize: 14, fontWeight: 500, margin: 3,
  cursor: "pointer",
  background: C.cardLight, color: C.white, minWidth: 60, border: "none",
}),
```

## 3. focus ring

`global.css`의 focus-visible 규칙을 교체:
```css
*:focus-visible {
  outline: 2px solid var(--app-blue);
  outline-offset: 2px;
  border-radius: 6px;
}
```

## 검증
- [ ] 모든 화면이 회색 배경(`#F2F2F7`) + 흰 카드로 바뀜
- [ ] 버튼이 파란색 systemBlue로 채워짐 (기존 검은색 pill → 파란 10px 라운드)
- [ ] section label, table header uppercase 제거됨
- [ ] dashed border가 solid 1px로 바뀜
- [ ] 다크 모드에서 카드가 `#1C1C1E`로 보임
- [ ] `makeStyles`를 import하는 컴포넌트 전부 에러 없이 동작
- [ ] lint 통과

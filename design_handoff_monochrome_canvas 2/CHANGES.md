# CHANGES.md — per-screen diff guide

Every edit listed here is **style-only**. No reducers, no state, no props
changed. If you find yourself rewriting behavior, stop — you've gone too far.

Before you start: confirm `theme.js` and `useTheme.jsx` have been replaced
(see README). Most of the visual transition happens there automatically.

Files below are listed in implementation order — easiest first.

---

## 1 · `src/index.css` (or `main.css`)

**Add** at the top:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  --font-sans: 'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
}
body {
  font-family: var(--font-sans);
  font-weight: 340;
  letter-spacing: -0.14px;
}
*:focus-visible { outline: dashed 2px currentColor; outline-offset: 2px; }
```

**Keep** the existing Pretendard import for Korean glyph fallback.

---

## 2 · `src/components/auth/LoginScreen.jsx`

Structural changes only.

### Replace hero copy

Before — boxed card with centered title:
```jsx
<div style={{ ...s.card, textAlign: "center" }}>
  <h1 style={{ fontSize: 24, fontWeight: 800 }}>⚽ 경기 기록</h1>
  <p>로그인하세요</p>
</div>
```

After — left-aligned editorial headline:
```jsx
<div style={{ padding: "32px 24px 48px" }}>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 0.6,
                opacity: 0.5, marginBottom: 10, textTransform: "uppercase" }}>
    Master FC — V2
  </div>
  <h1 style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-1.8px",
               lineHeight: 1, margin: 0 }}>
    Record every <span style={{ fontStyle: "italic", fontWeight: 450 }}>match.</span>
  </h1>
  <p style={{ fontSize: 16, color: C.gray, marginTop: 12, maxWidth: 280 }}>
    골·어시·실점을 정확히. 팀의 모든 기록은 여기서.
  </p>
</div>
```

### Inputs — underline instead of boxed

`s.input` in the new theme is already `border: none; border-bottom: 1.5px solid var(--fg);`
so existing `<input style={s.input} />` callsites need **no change**.

### CTA

Existing `<button style={s.btnFull(C.accent, C.bg)}>로그인</button>` auto-becomes
a black pill. Add trailing arrow icon if desired:

```jsx
<button style={s.btnFull(C.accent, C.bg)}>
  로그인 <ArrowIcon />
</button>
```

---

## 3 · `src/components/home/HomeScreen.jsx`

### Team card — the only visible identity

Before: card with team color as left border accent:
```jsx
<div style={{ ...s.teamCard(team.colorIdx), background: TEAM_COLORS[team.colorIdx].bg }}>
  {team.name}
</div>
```

After: **current team = solid black**, other teams = white+border, team
color as an 12px dot:
```jsx
<button style={{
  width: "100%", textAlign: "left",
  background: team.isCurrent ? C.white : C.card,
  color: team.isCurrent ? C.bg : C.white,
  border: team.isCurrent ? "none" : `1px solid ${C.borderColor}`,
  borderRadius: 16, padding: "18px 20px", marginBottom: 10, cursor: "pointer",
}}>
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <span style={{ width: 12, height: 12, borderRadius: "50%",
                   background: TEAM_COLORS[team.colorIdx].bg }} />
    <span style={{ fontSize: 18, fontWeight: 540 }}>{team.name}</span>
  </div>
</button>
```

### "팀 추가하기" — dashed affordance

```jsx
<button style={{
  width: "100%", background: "transparent",
  border: `1.5px dashed ${C.grayDark}`, borderRadius: 16,
  padding: 22, display: "flex", justifyContent: "center", gap: 8,
}}>
  + 팀 추가하기
</button>
```

### Greeting

Replace any "환영합니다" boxed header with an editorial headline:
```jsx
<h1 style={{ fontSize: 40, fontWeight: 400, letterSpacing: "-1.2px", lineHeight: 1.05 }}>
  안녕, <span style={{ fontStyle: "italic", fontWeight: 450 }}>{user.name}</span>.
</h1>
```

---

## 4 · `src/components/game/CourtRecorder.jsx` (main RecordScreen)

### Scoreboard

Replace the existing score row with `s.scoreboard` (already remapped to
monumental 56px tabular numerals). Winning side stays full-opacity, losing
side drops to 38%:

```jsx
<div style={s.scoreboard}>
  <span style={{ opacity: homeScore < awayScore ? 0.38 : 1 }}>{homeScore}</span>
  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, opacity: 0.4,
                 alignSelf: "flex-end", paddingBottom: 10 }}>VS</span>
  <span style={{ opacity: awayScore < homeScore ? 0.38 : 1 }}>{awayScore}</span>
</div>
```

### Player rows — three-part layout

`[GK toggle (34px circle)]  [Name pill (flex 1)]  [Goal circle (34px)]`

```jsx
<div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
  <button onClick={toggleGk} style={{
    width: 34, height: 34, borderRadius: "50%",
    background: isGk ? C.white : "transparent",
    color:      isGk ? C.bg : C.grayDark,
    border:     isGk ? "none" : `1.2px dashed ${C.grayDarker}`,
    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.6,
  }}>GK</button>

  <div style={{ flex: 1, padding: "9px 12px", borderRadius: 50,
                background: C.cardLight, textAlign: "center",
                fontSize: 14, fontWeight: 480 }}>
    {player.name}
  </div>

  <button onClick={openGoalModal} style={{
    width: 34, height: 34, borderRadius: "50%",
    background: C.white, color: C.bg, border: "none",
  }}>⚽</button>
</div>
```

### "+ 용병 추가" — dashed orange pill

```jsx
<button style={{
  width: "100%", background: "transparent",
  border: `1.5px dashed ${C.grayDark}`, borderRadius: 50,
  padding: "9px 10px",
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.6,
  color: C.orange,
}}>+ MERC</button>
```

### Voice record

Keep existing logic. Restyle the press-and-hold button:
```jsx
<button style={{
  width: "100%", padding: "14px 20px", borderRadius: 50,
  background: isListening ? "transparent" : C.white,
  color:      isListening ? C.white       : C.bg,
  border:     isListening ? `1.5px dashed ${C.white}` : "none",
  fontWeight: 540,
}}>🎤 {isListening ? '듣는 중…' : '꾹 눌러서 음성으로 기록'}</button>
```

---

## 5 · `src/components/game/EventLog.jsx`

Two edits:

1. Replace the emoji dot with a real colored dot:
```jsx
<span style={{ width: 8, height: 8, borderRadius: 8,
               background: e.type === "owngoal" ? C.red : C.green }} />
```
   (or keep ⚽/🔴 if time-constrained — the surrounding chrome already looks clean)

2. Dashed divider between rows — already delivered by `s.eventLog`
   (1px solid borderColor) or swap to:
```jsx
borderBottom: `1px dashed ${C.grayDarker}`,
```

Add a mono minute label at the left:
```jsx
<span style={{ fontFamily: "var(--font-mono)", fontSize: 10,
               opacity: 0.45, width: 36 }}>{e.min}</span>
```

---

## 6 · `src/components/game/GoalModal` (the inline modal inside EventLog/CourtRecorder)

Convert the modal into a **bottom sheet**:

```jsx
<div style={{ position: "fixed", inset: 0, zIndex: 50,
              background: C.overlay, backdropFilter: "blur(6px)",
              display: "flex", alignItems: "flex-end" }}>
  <div style={{ background: C.card, width: "100%",
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: "20px 22px 28px" }}>
    <div style={{ width: 44, height: 4, background: C.grayDarker,
                  borderRadius: 2, margin: "0 auto 18px" }} />
    {/* handle bar + content */}
  </div>
</div>
```

Teammate pills (4-up grid):
```jsx
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
  {teammates.map(p => (
    <button key={p} style={{
      padding: "14px 12px", borderRadius: 50,
      background: C.cardLight, border: "none",
      fontSize: 15, fontWeight: 480,
    }}>{p}</button>
  ))}
</div>
```

"자책골" = dashed red pill, "어시 없음" = glass pill.

---

## 7 · `src/components/dashboard/PlayerCardTab.jsx` (Stats)

### Tabs

Already remapped — `s.tab(active)` is now a pill with dashed border when inactive.

### Top-3 block — monumental numerals

```jsx
{sorted.slice(0, 3).map((p, i) => (
  <div key={p.id} style={{
    display: "flex", alignItems: "baseline", gap: 14,
    padding: "18px 0", borderBottom: `1px dashed ${C.grayDarker}`,
  }}>
    <div style={{ width: 40, textAlign: "right",
                  fontSize: 36, fontWeight: 400, letterSpacing: "-1.4px",
                  fontVariantNumeric: "tabular-nums",
                  color: i === 0 ? C.white : C.grayDark }}>
      {i + 1}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 540 }}>{p.name}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9,
                    color: C.gray, marginTop: 4 }}>
        {p.plays} PLAYED · {p.wins}W
      </div>
    </div>
    <div style={{ fontSize: 32, fontWeight: 480, letterSpacing: "-1px",
                  fontVariantNumeric: "tabular-nums" }}>
      {p[key]}
    </div>
  </div>
))}
```

### Distribution bar chart (optional, high-impact)

See prototype's `StatsScreen` — a horizontal bar per player, dashed baseline,
filled bar in solid black. ~30 min to port.

---

## 8 · Bottom nav / tab bar

In `App.jsx` or wherever the bottom nav lives, each tab label becomes:

```jsx
<button style={{
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", gap: 4, background: "transparent",
  opacity: isActive ? 1 : 0.42,
}}>
  <TabIcon />
  <span style={{
    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.8,
    textTransform: "uppercase",
    borderBottom: isActive ? `1.5px dashed ${C.white}` : "1.5px dashed transparent",
    paddingBottom: 2,
  }}>{label}</span>
</button>
```

---

## 9 · `src/components/dashboard/TeamDashboard.jsx`

This is the biggest file and the highest-impact screen. Nothing below changes
behavior — it's all token swaps and geometry. Order matters; `ds` is redefined
at the top of the component, edit it first so downstream styles inherit.

### 9.1 · Replace the `ds` useMemo block

Find (around line ~115):
```jsx
const ds = useMemo(() => ({
  container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', ..." , maxWidth: 500, margin: "0 auto" },
  header: { background: C.headerBg, padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 100 },
  section: { padding: "0 16px", marginBottom: 16 },
  card: { background: C.card, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.gray, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
  sportTab: (active) => ({ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: active ? C.accent : C.cardLight, color: active ? C.bg : C.gray }),
  btn: (bg, tc = "#fff") => ({ background: bg, color: tc, border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }),
  thStyle: { padding: "5px 2px", textAlign: "center", color: C.gray, borderBottom: `1px solid ${C.borderColor}`, fontWeight: 600, fontSize: 9, whiteSpace: "nowrap" },
  tdStyle: (hl = false) => ({ padding: "5px 1px", textAlign: "center", borderBottom: `1px solid ${C.borderColor}`, fontWeight: hl ? 700 : 400, color: hl ? C.white : C.gray, fontSize: 10 }),
  mainTab: (active) => ({ flex: 1, padding: "12px 8px", textAlign: "center", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", background: active ? C.card : "transparent", color: active ? C.white : C.gray, borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent", position: "relative" }),
}), [C]);
```

Replace with:
```jsx
const ds = useMemo(() => ({
  container: { background: C.bg, minHeight: "100vh", color: C.white,
               fontFamily: "var(--font-sans)", fontWeight: 340, letterSpacing: "-0.14px",
               maxWidth: 500, margin: "0 auto" },
  header:    { background: C.headerBg, padding: "20px 20px 14px",
               position: "sticky", top: 0, zIndex: 100 },
  section:   { padding: "0 20px", marginBottom: 18 },
  card:      { background: C.card, borderRadius: 16, padding: 16,
               border: `1px solid ${C.borderColor}` },
  sectionTitle: { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.8,
                  textTransform: "uppercase", color: C.gray, marginBottom: 10,
                  display: "flex", alignItems: "center", gap: 6 },

  // sport tab = pill, 50px radius, flat fill when active
  sportTab: (active) => ({ padding: "10px 18px", borderRadius: 50,
    fontSize: 13, fontWeight: 540, border: active ? "none" : `1px solid ${C.borderColor}`,
    cursor: "pointer", background: active ? C.white : "transparent",
    color: active ? C.bg : C.gray, letterSpacing: "-0.1px" }),

  btn: (bg, tc = "#fff") => ({ background: bg, color: tc, border: "none",
    borderRadius: 50, padding: "14px", fontSize: 15, fontWeight: 540,
    letterSpacing: "-0.2px", cursor: "pointer", width: "100%" }),

  thStyle: { padding: "8px 2px", textAlign: "center", color: C.gray,
    borderBottom: `1px solid ${C.borderColor}`,
    fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 9,
    letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap" },

  tdStyle: (hl = false) => ({ padding: "7px 1px", textAlign: "center",
    borderBottom: `1px dashed ${C.borderColor}`,
    fontWeight: hl ? 540 : 340, color: hl ? C.white : C.gray, fontSize: 11,
    fontVariantNumeric: "tabular-nums" }),

  // main tab = dashed underline when active (matches Figma focus language)
  mainTab: (active) => ({ flex: 1, padding: "14px 8px", textAlign: "center",
    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.8,
    textTransform: "uppercase", fontWeight: 500,
    border: "none", cursor: "pointer", background: "transparent",
    color: active ? C.white : C.gray,
    borderBottom: active ? `1.5px dashed ${C.white}` : "1.5px dashed transparent",
    position: "relative" }),
}), [C]);
```

### 9.2 · Header chrome — unify the button cluster

Find the header button row (5 buttons: theme toggle, 팀 전환, 설정, 로그아웃, 홈). Each currently has its own inline style. Extract a helper at the top of the component body (above `return`):

```jsx
const chromeBtn = (opts = {}) => ({
  background: opts.solid ? C.white : "transparent",
  color: opts.solid ? C.bg : C.headerBtnColor,
  border: opts.solid ? "none" : `1px solid ${C.borderColor}`,
  borderRadius: 50, padding: "8px 14px",
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.6,
  textTransform: "uppercase", fontWeight: 500, cursor: "pointer",
});
```

Then:
```jsx
<button onClick={toggle}     style={chromeBtn()}>{mode === "dark" ? "LIGHT" : "DARK"}</button>
<button onClick={onSwitchTeam} style={chromeBtn()}>SWITCH</button>
<button onClick={onSettings}   style={chromeBtn()}>SETTINGS</button>
<button onClick={onLogout}     style={chromeBtn()}>SIGN OUT</button>
{tournamentActive && <button onClick={...} style={chromeBtn({ solid: true })}>HOME</button>}
```

This removes the ☀️/🌙 emoji and unifies five bespoke button styles into one.

### 9.3 · Team title — editorial scale

Find:
```jsx
<div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{...teamName}</div>
<div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>{authUser.name}님 ...</div>
```

Replace with:
```jsx
<div>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.8,
                textTransform: "uppercase", color: C.gray, marginBottom: 6 }}>
    {activeSport} · {authUser.name}
    {activeEntry?.role === "관리자" && <span style={{ marginLeft: 8 }}>· ADMIN</span>}
  </div>
  <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.9px",
                lineHeight: 1.05, color: C.white }}>
    {tournamentActive && tournamentName ? tournamentName : teamName}
  </div>
</div>
```

### 9.4 · `rankBadge` — strip the gradients

Find:
```jsx
const rankBadge = (rank) => {
  if (rank === 1) return <span style={{ ...background: "linear-gradient(135deg, #fbbf24, #f59e0b)"... }}>1</span>;
  if (rank === 2) return <span style={{ ...background: "linear-gradient(135deg, #d1d5db, #9ca3af)"... }}>2</span>;
  if (rank === 3) return <span style={{ ...background: "linear-gradient(135deg, #d97706, #92400e)"... }}>3</span>;
  return <span style={{ fontSize: 11, color: C.gray ... }}>{rank}</span>;
};
```

Replace with:
```jsx
const rankBadge = (rank) => {
  const top3 = rank <= 3;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 22, height: 22, borderRadius: "50%",
      background: top3 ? C.white : "transparent",
      color:      top3 ? C.bg    : C.gray,
      border:     top3 ? "none"  : `1px dashed ${C.grayDarker}`,
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
      fontVariantNumeric: "tabular-nums",
    }}>{rank}</span>
  );
};
```

Rank 1/2/3 are identical chips; hierarchy comes from position + monumental
numerals in `renderRecords`, not from gold/silver/bronze gradients.

### 9.5 · Summary stat cards — tabular numerals + mono labels

In `renderRecords`, find the "시즌 요약 카드" block (4 cards: 경기 / 골 / 어시 / 참여). Replace each card's inner markup:

```jsx
<div key={i} style={{ flex: 1, background: C.card, borderRadius: 16,
                      border: `1px solid ${C.borderColor}`,
                      padding: "16px 10px", textAlign: "center" }}>
  <div style={{ fontSize: 32, fontWeight: 400, letterSpacing: "-0.8px",
                fontVariantNumeric: "tabular-nums", color: C.white }}>
    {s.value}
  </div>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.8,
                textTransform: "uppercase", color: C.gray, marginTop: 4 }}>
    {s.label}
  </div>
</div>
```

Drop the `color: s.color` on the number — all numbers are `C.white`.
The four stat colors (accent / green / blue / orange) were visual noise.

### 9.6 · Team record W/D/L form dots

Find the `teamRecord.form.map(...)` block. Replace each form chip with:

```jsx
<span key={i} style={{
  width: 22, height: 22, borderRadius: "50%",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
  background: r === "W" ? C.white : "transparent",
  color:      r === "W" ? C.bg    : C.gray,
  border:     r === "W" ? "none"  : `1px dashed ${C.grayDarker}`,
}}>{r}</span>
```

W = solid white, D/L = outlined. Reads as clearly as the colored version and
matches the rest of the new chrome.

### 9.7 · Game-start cards (📋 / ⚙️ / ⚽)

In `renderGames`, the three big click-to-start cards use 24px emoji icons.
If you're keeping emoji (Policy A), leave alone. If stripping (Policy B),
replace the emoji `<div>` with:

```jsx
<div style={{ width: 36, height: 36, borderRadius: "50%",
              border: `1.5px dashed ${C.white}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.6 }}>
  {kind === "sheetSync" ? "01" : kind === "custom" ? "02" : "GO"}
</div>
```

Numbered dashed circles > decorative emoji for this aesthetic.

### 9.8 · Bars (`<Bar>` component)

Find the `Bar` component. The gradient fill is fine; just change the track:

```jsx
<div style={{ background: "transparent", border: `1px dashed ${C.grayDarker}`,
              borderRadius: height / 2, height, flex: 1, overflow: "hidden" }}>
  <div style={{ background: C.white, height: "100%", borderRadius: height / 2,
                width: `${Math.min(100, (value / (max || 1)) * 100)}%`,
                transition: "width 0.3s" }} />
</div>
```

Dashed empty track + solid-white fill = instantly on-brand.

### 9.9 · `DeltaBadge` — strip bg, use arrows

```jsx
const DeltaBadge = ({ value }) => {
  if (!value) return <span style={{ minWidth: 28 }} />;
  const up = value > 0;
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
                   letterSpacing: 0.4, minWidth: 28, textAlign: "right",
                   color: up ? C.white : C.gray }}>
      {up ? "↑" : "↓"}{Math.abs(value)}
    </span>
  );
};
```

Monochrome + arrow glyph replaces the red/green tinted pill. "Change" stops
being a mood signal and becomes information.

---

## Emoji inventory (decide before patching)

This codebase uses emoji as decoration in ~20 places. Pick ONE policy and apply
uniformly — mixing is worse than either extreme.

| Location | Emoji | Policy A (keep) | Policy B (strip) |
|---|---|---|---|
| Summary rows "⚽ 골 / 👟 어시 / 🧤 키퍼" | ⚽ 👟 🧤 | leave | mono label "GOALS" / "ASSISTS" / "KEEPER" |
| Crova / Goguma columns | 🍀 🍠 | leave (in-joke, team lore) | keep — these are team vocabulary, not chrome |
| Game-start cards | 📋 ⚙️ ⚽ | leave | see 9.7 |
| Tournament | 🏆 | leave | mono "CUP" tag |
| Theme toggle | ☀️ 🌙 | leave | LIGHT / DARK |
| Event log dots | ⚽ 🔴 | already swapped to colored dot (§5) | same |

Ask the user which policy before you start. Policy B is more consistent with
the new system; Policy A preserves the playful tone. Crova/Goguma stay either
way — those emoji carry meaning, not style.

---

## 9 · Things you can skip first pass

- Swapping emoji for SVG icons (defer — chrome already reads as the new system)
- Dark-mode polish (the tokens are ready; verify later)
- Team standing table styling (inherits from `s.td` which is already updated)

## Done-when

- `theme.js` + `useTheme.jsx` swapped, app still runs
- LoginScreen + HomeScreen visually match prototype
- CourtRecorder player rows match (GK circle + name pill + goal circle)
- EventLog rows match (dot + name + meta)
- Tab bar uses dashed underline for active tab
- Focus visible is dashed 2px on every interactive element
- Korean text still renders (Pretendard fallback present)
- Dark-mode toggle still works

Ship it.

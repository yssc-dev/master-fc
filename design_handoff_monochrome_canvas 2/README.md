# Handoff: Monochrome Canvas — Master FC restyle

## Overview

This handoff repackages the Master FC futsal recording app (`yssc-dev/master-fc`)
with a new visual system — **Monochrome Canvas** — inspired by the
Figma-site art direction (binary black/white chrome, variable-weight Inter
type, dashed focus, pill/circle geometry, negative tracking).

Nothing about the app's **behavior** changes. Every reducer, every sync
path, every match/stat calculation, every hook is kept as-is. This is a
**pure skin swap**, executed by replacing the theme tokens + styles layer.

## About the Design Files

Files under `prototype/` are **design references created in HTML/React** —
they show the intended look and behavior of each screen, not production
code to paste into `master-fc`. The task is to **recreate these designs
inside the existing master-fc codebase** (React + Vite + Pretendard +
inline style-object pattern) by replacing `theme.js` and `useTheme.jsx`,
then performing targeted style-only edits to each screen component.

Do NOT copy the prototype's React component code into `master-fc`.
Use the prototype as a **visual spec** only.

## Fidelity

**High-fidelity.** The prototype contains final colors, typography,
spacing, and interactions. Recreate the UI pixel-perfectly using the
codebase's existing component structure.

## Strategy (read this first)

master-fc's styling pattern is:

```jsx
const { C } = useTheme();       // color tokens
const s = makeStyles(C);        // style-object factory
<button style={s.btn(C.green)}>…</button>
```

We exploit this by replacing **only** `theme.js` and `useTheme.jsx`. The
public shape of both files is preserved:

- `useTheme()` still returns `{ mode, C, toggle }`
- `makeStyles(C)` still returns the same keys (`btn`, `btnSm`, `chip`,
  `card`, `matchBtn`, `scoreboard`, `tabRow`, `tab`, `eventLog`,
  `teamCard`, `playerInTeam`, `th`, `td`, `input`, `bottomBar`,
  `phaseIndicator`, `dot`, …)
- Every existing `<button style={s.btn(C.accent)}>` becomes a 50px pill
  automatically. Every `s.chip(true)` becomes a solid-black pill.

This means **95% of component files need zero edits**. The remaining 5%
is small textual/structural changes (swap emojis for line icons, change
hero headline copy, wrap long numbers in a mono font). Those are listed
in `CHANGES.md`.

## Files in this bundle

```
design_handoff_monochrome_canvas/
├── README.md                 ← you are here
├── CHANGES.md                ← per-screen diff guide
├── theme.js                  ← drop in at src/styles/theme.js
├── useTheme.jsx              ← drop in at src/hooks/useTheme.jsx
└── prototype/                ← HTML/React visual reference (DO NOT copy verbatim)
    ├── Master FC.html
    ├── tokens.css
    ├── atoms.jsx
    ├── screens.jsx
    └── design-canvas.jsx
```

## Design tokens (source of truth)

### Colors — binary chrome

| Role             | Light       | Dark          | Notes                              |
| ---------------- | ----------- | ------------- | ---------------------------------- |
| `bg`             | `#ffffff`   | `#0a0a0a`     | app background                     |
| `card`           | `#ffffff`   | `#141414`     | card surface                       |
| `cardLight`      | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.06)` | subtle fill pills     |
| `borderColor`    | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.1)` | hairlines             |
| `white` (ink)    | `#000000`   | `#ffffff`     | **foreground text** (name kept for compat) |
| `gray`           | `rgba(_,0.55)` | `rgba(_,0.55)` | secondary                       |
| `grayDark`       | `rgba(_,0.35)` | `rgba(_,0.35)` | tertiary                        |
| `grayDarker`     | `rgba(_,0.12)` | `rgba(_,0.14)` | **dashed dividers**             |
| `accent`         | `#000000`   | `#ffffff`     | "accent" collapses to ink — no cyan |

### Colors — data only

These appear **only** on goal / own-goal / assist / GK / win-loss markers.
They must never be used for chrome, borders, or button fills.

| Token     | Hex         | Used for             |
| --------- | ----------- | -------------------- |
| `green`   | `#14ae5c`   | goal · win           |
| `red`     | `#e5484d`   | own goal · loss      |
| `orange`  | `#f97316`   | mercenary · alert    |
| `yellow`  | `#eab308`   | (reserved)           |

Team colors from `TEAM_COLORS` in `config/constants.js` stay unchanged —
they render as 8–12px dots next to team names and in scoreboards.

### Type

- Family: `'Inter', 'Pretendard', system-ui, sans-serif`
  (Pretendard kept as fallback so Korean glyphs stay native)
- Weight axis: **320 / 340 / 400 / 450 / 480 / 540 / 700**
  - Body 340, emphasis 480, titles 540, display 400 with tight tracking
- Tracking: negative for display (`-1.2px` → `-2.2px`), neutral for body
- Mono: `'JetBrains Mono', monospace` — used uppercase 10–12px for meta
  labels (`ROUND 3`, `MVP`, `LIVE`).

### Geometry

- **All buttons** → `border-radius: 50px` (pill)
- **All icon buttons** → `border-radius: 50%` (circle), 40×40 default
- **Cards** → `border-radius: 12px`
- **Score/data blocks** → `border-radius: 8px`
- **Focus** → `outline: dashed 2px var(--fg); outline-offset: 2px;`
- **Dividers** → dashed 1px (not solid) between log items, rank rows

### Spacing

Unchanged — keep existing 4/8/12/16/20 scale.

## Screens in scope

See `CHANGES.md` for the exact diff per file. Summary:

1. **LoginScreen** — hero wordmark "Record every match." · underline inputs · black pill CTA
2. **HomeScreen** — team cards: current=black solid, others=white+border, add=dashed
3. **RecordScreen / CourtRecorder** — monumental scoreboard · circular goal buttons · mono labels · dashed event-log dividers
4. **EventLog** — goal/assist as colored dots, name weight 540, meta 340
5. **PlayerCardTab (Stats)** — Top-3 with 36px numerals · distribution bar chart · dashed team-standing rows
6. **LineupSelector / OpponentSelector** — dashed "add mercenary" pills · team name + dot
7. **GoalModal** — bottom sheet · pill teammate grid · dashed "own goal" CTA

## Implementation order

1. Replace `src/hooks/useTheme.jsx` with the version in this bundle.
2. Replace `src/styles/theme.js` (or wherever `makeStyles` lives) with
   the version in this bundle.
3. Add `@import url('…Inter:wght@100..900…JetBrains+Mono…')` to the app's
   root CSS and set `body { font-family: 'Inter', 'Pretendard', … }`.
4. Run the app. **~80% of screens will already look correct.** Pretendard
   fallback keeps Korean text readable while Inter handles Latin.
5. Work through `CHANGES.md` one screen at a time for the small textual
   polish (line icons instead of emoji, meta labels, dashed dividers).
6. Verify dark-mode toggle still works (`useTheme().toggle`).

## Out of scope

- Logic changes (reducers, sync, auth)
- New screens or features
- Backend / Google Sheets integration
- Icon library swap (you can keep emoji short-term; prototype uses SVG
  line icons for the final look — decide based on time budget)

## Questions for the implementer

- Do we keep emoji (⚽🔴) during rollout, or swap to SVG line icons?
  The prototype uses SVG — cleaner but ~30 min of extra work per screen.
- Do we enable dark mode by default or keep light as default? Prototype
  defaults to **light**.

— generated from the Monochrome Canvas design exploration

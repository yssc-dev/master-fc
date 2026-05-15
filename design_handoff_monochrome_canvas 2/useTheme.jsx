// src/hooks/useTheme.jsx — DROP-IN REPLACEMENT.
//
// Master FC's old theme had dark/light modes + cyan accent + navy bg.
// The new system is strictly black/white. We keep the same hook signature
// (`{ mode, C, toggle }`) so existing `useTheme()` consumers keep working
// unchanged. `mode` toggles between light (default) and dark chrome.
// Team colors stay in C.* for event markers only — they are NOT used in
// chrome anymore.

import { createContext, useContext, useState, useEffect } from 'react';

const THEME_KEY = "masterfc_theme";

/*
 * Light chrome — "gallery white" default.
 * `white` = foreground (ink), `bg` = background. Naming preserved for
 * backward compat with existing component code.
 */
const light = {
  bg:          "#ffffff",
  card:        "#ffffff",
  cardLight:   "rgba(0,0,0,0.04)",
  borderColor: "rgba(0,0,0,0.08)",

  // "accent" is now just foreground black. Anywhere code said "accent" as
  // the primary-action color, it becomes black. Anywhere it said accent
  // for emphasis text, it becomes black. This is the point: the chrome
  // is binary.
  accent:     "#000000",
  accentDim:  "#000000",

  // Ink scale (renamed but keeps existing keys)
  white:      "#000000",                      // foreground / text / title
  gray:       "rgba(0,0,0,0.55)",
  grayLight:  "rgba(0,0,0,0.4)",
  grayDark:   "rgba(0,0,0,0.35)",
  grayDarker: "rgba(0,0,0,0.12)",             // dashed dividers

  // Match-data color — ONLY used on goal / own-goal / GK markers.
  // Do NOT use in chrome.
  green:   "#14ae5c",  greenDim: "#0e8a48",
  red:     "#e5484d",  redDim:   "#c02a2f",
  orange:  "#f97316",
  yellow:  "#eab308",
  purple:  "#a855f7",

  headerBg:           "#ffffff",
  overlay:            "rgba(0,0,0,0.55)",
  overlayLight:       "rgba(0,0,0,0.35)",
  headerTextDim:      "rgba(0,0,0,0.55)",
  headerBtnBg:        "rgba(0,0,0,0.06)",
  headerBtnColor:     "#000000",
  headerBtnDimColor:  "rgba(0,0,0,0.55)",
};

/*
 * Dark chrome — inverted. Same binary discipline; just swap ink/bg.
 */
const dark = {
  bg:          "#0a0a0a",
  card:        "#141414",
  cardLight:   "rgba(255,255,255,0.06)",
  borderColor: "rgba(255,255,255,0.1)",

  accent:    "#ffffff",
  accentDim: "#ffffff",

  white:      "#ffffff",
  gray:       "rgba(255,255,255,0.55)",
  grayLight:  "rgba(255,255,255,0.4)",
  grayDark:   "rgba(255,255,255,0.35)",
  grayDarker: "rgba(255,255,255,0.14)",

  green:   "#14ae5c",  greenDim: "#0e8a48",
  red:     "#e5484d",  redDim:   "#c02a2f",
  orange:  "#f97316",
  yellow:  "#eab308",
  purple:  "#a855f7",

  headerBg:           "#0a0a0a",
  overlay:            "rgba(0,0,0,0.7)",
  overlayLight:       "rgba(0,0,0,0.5)",
  headerTextDim:      "rgba(255,255,255,0.55)",
  headerBtnBg:        "rgba(255,255,255,0.08)",
  headerBtnColor:     "#ffffff",
  headerBtnDimColor:  "rgba(255,255,255,0.55)",
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  });

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* ignore */ }
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  const toggle = () => setMode(m => m === "dark" ? "light" : "dark");
  const C = mode === "dark" ? dark : light;

  return (
    <ThemeContext.Provider value={{ mode, C, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

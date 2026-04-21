// src/hooks/useTheme.jsx — Apple HIG palette.
// Signature preserved (`{ mode, C, toggle }`) so existing consumers keep working.
// C values are CSS variables from app_tokens.css.

import { createContext, useContext, useState, useEffect } from 'react';

const THEME_KEY = "masterfc_theme";

const light = {
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

import { createContext, useContext, useState, useEffect } from 'react';

const THEME_KEY = "masterfc_theme";

const dark = {
  bg: "#0f172a", card: "#1e293b", cardLight: "#334155",
  accent: "#22d3ee", accentDim: "#0891b2",
  green: "#10b981", greenDim: "#059669",
  red: "#ef4444", redDim: "#dc2626",
  orange: "#f97316", yellow: "#eab308", purple: "#a855f7",
  white: "#f8fafc", gray: "#94a3b8", grayDark: "#475569", grayDarker: "#334155",
  headerBg: "linear-gradient(135deg, #0891b2, #6366f1)",
  overlay: "rgba(0,0,0,0.7)",
  overlayLight: "rgba(0,0,0,0.6)",
  headerTextDim: "rgba(255,255,255,0.7)",
  headerBtnBg: "rgba(255,255,255,0.15)",
  headerBtnColor: "#fff",
  headerBtnDimColor: "rgba(255,255,255,0.6)",
  borderColor: "#334155",
};

const light = {
  bg: "#f1f5f9", card: "#ffffff", cardLight: "#e2e8f0",
  accent: "#0891b2", accentDim: "#0e7490",
  green: "#059669", greenDim: "#047857",
  red: "#dc2626", redDim: "#b91c1c",
  orange: "#ea580c", yellow: "#ca8a04", purple: "#9333ea",
  white: "#0f172a", gray: "#64748b", grayDark: "#cbd5e1", grayDarker: "#e2e8f0",
  headerBg: "linear-gradient(135deg, #0891b2, #6366f1)",
  overlay: "rgba(0,0,0,0.4)",
  overlayLight: "rgba(0,0,0,0.3)",
  headerTextDim: "rgba(255,255,255,0.7)",
  headerBtnBg: "rgba(255,255,255,0.2)",
  headerBtnColor: "#fff",
  headerBtnDimColor: "rgba(255,255,255,0.6)",
  borderColor: "#cbd5e1",
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || "dark"; } catch { return "dark"; }
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

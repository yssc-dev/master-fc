export const TEAM_COLORS = [
  { name: "연두", bg: "#84cc16", text: "#1a2e05" },
  { name: "빨강", bg: "#ef4444", text: "#fff" },
  { name: "파랑", bg: "#3b82f6", text: "#fff" },
  { name: "주황", bg: "#f97316", text: "#fff" },
  { name: "녹색", bg: "#22c55e", text: "#fff" },
  { name: "하늘", bg: "#38bdf8", text: "#1e3a5f" },
  { name: "검정", bg: "#1e293b", text: "#fff", border: "#475569" },
  { name: "흰색", bg: "#f1f5f9", text: "#1e293b" },
];

export const C = {
  bg: "#0f172a", card: "#1e293b", cardLight: "#334155",
  accent: "#22d3ee", accentDim: "#0891b2",
  green: "#10b981", greenDim: "#059669",
  red: "#ef4444", redDim: "#dc2626",
  orange: "#f97316", yellow: "#eab308", purple: "#a855f7",
  white: "#f8fafc", gray: "#94a3b8", grayDark: "#475569", grayDarker: "#334155",
};

export const SHEET_CONFIG = {
  sheetId: import.meta.env.VITE_SHEET_ID || "1cM4UhB-nL6smf4OIn_lqQ0on1AtYG2ff_haIXBvXnK0",
  dashboardGid: import.meta.env.VITE_DASHBOARD_GID || "191499825",
  attendanceGid: import.meta.env.VITE_ATTENDANCE_GID || "2005957412",
  csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
  },
};

export const AUTH_STORAGE_KEY = "masterfc_auth";
export const AUTH_EXPIRY_HOURS = 24;

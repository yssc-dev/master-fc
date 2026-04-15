// src/utils/formations.js

export const FORMATIONS = {
  "4-4-2": {
    label: "4-4-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 15, y: 50, role: "MF" }, { x: 38, y: 53, role: "MF" }, { x: 62, y: 53, role: "MF" }, { x: 85, y: 50, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-3-3": {
    label: "4-3-3",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 25, y: 52, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 75, y: 52, role: "MF" },
      { x: 20, y: 25, role: "FW" }, { x: 50, y: 20, role: "FW" }, { x: 80, y: 25, role: "FW" },
    ],
  },
  "3-5-2": {
    label: "3-5-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 25, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 75, y: 78, role: "DF" },
      { x: 10, y: 55, role: "MF" }, { x: 30, y: 50, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 70, y: 50, role: "MF" }, { x: 90, y: 55, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-2-3-1": {
    label: "4-2-3-1",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 35, y: 58, role: "MF" }, { x: 65, y: 58, role: "MF" },
      { x: 20, y: 38, role: "MF" }, { x: 50, y: 35, role: "MF" }, { x: 80, y: 38, role: "MF" },
      { x: 50, y: 18, role: "FW" },
    ],
  },
  "3-4-3": {
    label: "3-4-3",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 25, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 75, y: 78, role: "DF" },
      { x: 15, y: 52, role: "MF" }, { x: 40, y: 50, role: "MF" }, { x: 60, y: 50, role: "MF" }, { x: 85, y: 52, role: "MF" },
      { x: 20, y: 25, role: "FW" }, { x: 50, y: 20, role: "FW" }, { x: 80, y: 25, role: "FW" },
    ],
  },
  "5-3-2": {
    label: "5-3-2",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 10, y: 72, role: "DF" }, { x: 30, y: 78, role: "DF" }, { x: 50, y: 80, role: "DF" }, { x: 70, y: 78, role: "DF" }, { x: 90, y: 72, role: "DF" },
      { x: 25, y: 50, role: "MF" }, { x: 50, y: 48, role: "MF" }, { x: 75, y: 50, role: "MF" },
      { x: 35, y: 25, role: "FW" }, { x: 65, y: 25, role: "FW" },
    ],
  },
  "4-2-4": {
    label: "4-2-4",
    positions: [
      { x: 50, y: 92, role: "GK" },
      { x: 15, y: 75, role: "DF" }, { x: 38, y: 78, role: "DF" }, { x: 62, y: 78, role: "DF" }, { x: 85, y: 75, role: "DF" },
      { x: 35, y: 52, role: "MF" }, { x: 65, y: 52, role: "MF" },
      { x: 12, y: 25, role: "FW" }, { x: 38, y: 22, role: "FW" }, { x: 62, y: 22, role: "FW" }, { x: 88, y: 25, role: "FW" },
    ],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

export const ROLE_COLORS = {
  GK: "#eab308",
  DF: "#3b82f6",
  MF: "#22c55e",
  FW: "#ef4444",
};

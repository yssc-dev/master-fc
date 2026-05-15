// src/styles/theme.js — DROP-IN REPLACEMENT for Master FC.
//
// This file replaces the existing dark-navy + cyan accent theme with the
// "Monochrome Canvas" system: binary black/white chrome, variable-weight
// Inter type (320–700), 50px pill / 50% circle geometry, dashed 2px focus.
//
// Strategy: keep makeStyles(C) signature identical so App.jsx and every
// component that calls `styles.btn(...)`, `styles.card`, etc. keeps working
// without a rewrite. Only the VALUES change. Color tokens on `C` are
// remapped so "accent" = black, "bg" = white, etc. Team colors are still
// passed through matchBtn/teamCard as-is (TEAM_COLORS from constants.js).

import { TEAM_COLORS } from '../config/constants';

export function makeStyles(C) {
  return {
    app: {
      background: C.bg,
      minHeight: "100vh",
      color: C.white,
      fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
      fontFeatureSettings: '"kern" 1',
      fontWeight: 340,
      letterSpacing: "-0.14px",
      maxWidth: 500,
      margin: "0 auto",
      paddingBottom: 80,
    },
    header: {
      background: C.bg,           // WHITE instead of gradient
      borderBottom: `1px solid ${C.borderColor}`,
      padding: "14px 16px",
      textAlign: "center",
      position: "sticky",
      top: 0,
      zIndex: 100,
    },
    title: {
      fontSize: 18,
      fontWeight: 540,
      color: C.white,             // "white" token is actually the foreground (#000 in light)
      letterSpacing: "-0.22px",
    },
    subtitle: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: C.gray,
      marginTop: 2,
    },
    section: { padding: 16 },
    sectionTitle: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 10,
      color: C.gray,
      display: "flex",
      alignItems: "center",
      gap: 6,
    },
    card: {
      background: C.card,
      border: `1px solid ${C.borderColor}`,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },

    // ── PILL BUTTONS ─────────────────────────────────────────
    // `bg` param is honored but we collapse foregrounds to black/white.
    // Default CTA is black-solid. Team colors still render as chips via matchBtn.
    btn: (bg, tc) => ({
      background: bg || C.white,                 // black solid by default
      color: tc || C.bg,                         // white text
      border: "none",
      borderRadius: 50,                          // pill
      padding: "10px 16px",
      fontSize: 15,
      fontWeight: 480,
      letterSpacing: "-0.14px",
      cursor: "pointer",
      transition: "background .15s, transform .06s",
    }),
    btnFull: (bg, tc) => ({
      background: bg || C.white,
      color: tc || C.bg,
      border: "none",
      borderRadius: 50,
      padding: "12px 18px",
      fontSize: 15,
      fontWeight: 480,
      letterSpacing: "-0.14px",
      cursor: "pointer",
      width: "100%",
      display: "block",
    }),
    btnSm: (bg, tc) => ({
      background: bg || C.cardLight,
      color: tc || C.white,
      border: "none",
      borderRadius: 50,
      padding: "6px 12px",
      fontSize: 12,
      fontWeight: 480,
      letterSpacing: "-0.1px",
      cursor: "pointer",
    }),

    // ── CHIPS ───────────────────────────────────────────────
    // Active = solid black pill. Inactive = dashed border pill.
    chip: (active) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "7px 13px",
      borderRadius: 50,
      fontSize: 13,
      fontWeight: 480,
      letterSpacing: "-0.1px",
      margin: 3,
      cursor: "pointer",
      background: active ? C.white : "transparent",
      color: active ? C.bg : C.white,
      border: active ? "none" : `1.2px dashed ${C.gray}`,
      transition: "all 0.15s",
    }),

    row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

    // ── INPUT — underline, not boxed ────────────────────────
    input: {
      background: "transparent",
      border: "none",
      borderBottom: `1.5px solid ${C.white}`,
      borderRadius: 0,
      padding: "10px 2px",
      color: C.white,
      fontSize: 16,
      fontWeight: 340,
      letterSpacing: "-0.14px",
      outline: "none",
      width: "100%",
      fontFamily: "inherit",
    },

    // ── SCORE — monumental numerals, tabular ────────────────
    scoreboard: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: "8px 0",
      fontSize: 56,
      fontWeight: 480,
      letterSpacing: "-2.2px",
      lineHeight: 1,
      fontVariantNumeric: "tabular-nums",
      color: C.white,
    },

    // ── TABLE ───────────────────────────────────────────────
    th: {
      padding: "8px 4px",
      textAlign: "center",
      color: C.gray,
      borderBottom: `1px solid ${C.grayDarker}`,
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 450,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    td: (hl = false) => ({
      padding: "9px 4px",
      textAlign: "center",
      borderBottom: `1px dashed ${C.grayDarker}`,
      fontWeight: hl ? 540 : 340,
      color: C.white,
      fontSize: 13,
      fontVariantNumeric: "tabular-nums",
    }),

    // ── TABS — pill row, active = solid black ──────────────
    tabRow: {
      display: "flex",
      gap: 6,
      marginBottom: 12,
      padding: "0 4px",
      overflowX: "auto",
      scrollbarWidth: "none",
    },
    tab: (active) => ({
      flex: "0 0 auto",
      padding: "8px 14px",
      textAlign: "center",
      background: active ? C.white : "transparent",
      color: active ? C.bg : C.gray,
      fontWeight: 480,
      fontSize: 13,
      letterSpacing: "-0.1px",
      border: active ? "none" : `1.2px dashed ${C.grayDark}`,
      borderRadius: 50,
      cursor: "pointer",
    }),

    // ── BOTTOM BAR ──────────────────────────────────────────
    bottomBar: {
      position: "fixed",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "100%",
      maxWidth: 500,
      background: C.bg,
      borderTop: `1px solid ${C.borderColor}`,
      padding: "10px 16px",
      display: "flex",
      gap: 8,
      zIndex: 100,
    },

    phaseIndicator: {
      display: "flex",
      justifyContent: "center",
      gap: 8,
      padding: "8px 0",
      background: "transparent",
    },
    dot: (active) => ({
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: active ? C.white : C.grayDark,
    }),

    // ── EVENT LOG ITEM — dashed divider between rows ───────
    eventLog: {
      display: "flex",
      alignItems: "center",
      padding: "10px 12px",
      borderRadius: 12,
      background: C.card,
      border: `1px solid ${C.borderColor}`,
      marginBottom: 6,
      fontSize: 14,
      gap: 8,
      color: C.white,
    },

    // ── TEAM CARD — dashed team-color accent on left ───────
    teamCard: (ci) => ({
      background: C.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      border: `1px solid ${C.borderColor}`,
      boxShadow: `inset 4px 0 0 ${TEAM_COLORS[ci]?.bg || C.white}`,
    }),

    // ── PLAYER CHIP — team color is just a 8px dot, not a fill ─
    playerInTeam: (color) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "7px 12px",
      borderRadius: 50,
      fontSize: 13,
      fontWeight: 480,
      margin: 2,
      background: `rgba(0,0,0,0.05)`,
      color: C.white,
      border: "none",
      "--dot-color": color?.bg || "transparent",
    }),

    // ── MATCH BUTTON — team color as accent dot only, not fill ─
    matchBtn: (color) => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "11px 14px",
      borderRadius: 50,
      fontSize: 14,
      fontWeight: 480,
      letterSpacing: "-0.14px",
      margin: 3,
      cursor: "pointer",
      background: "rgba(0,0,0,0.05)",
      color: C.white,
      minWidth: 60,
      border: "none",
    }),
  };
}

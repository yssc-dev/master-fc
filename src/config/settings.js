import { SHEET_CONFIG } from './constants';

const SETTINGS_KEY = "masterfc_settings";

const DEFAULTS = {
  // 구글시트 설정
  sheetId: SHEET_CONFIG.sheetId,
  attendanceGid: SHEET_CONFIG.attendanceGid,
  dashboardGid: SHEET_CONFIG.dashboardGid,
  pointLogSheet: "포인트로그",
  playerLogSheet: "선수별집계기록로그",
  // 경기규칙 설정
  ownGoalPoint: -2,
  crovaPoint: 2,
  gogumaPoint: -1,
  bonusMultiplier: 2,
};

function _key(team) {
  return `${SETTINGS_KEY}_${team || "default"}`;
}

export function getSettings(team) {
  try {
    const stored = JSON.parse(localStorage.getItem(_key(team)) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(team, settings) {
  // 기본값과 같은 필드는 저장하지 않음
  const toSave = {};
  for (const key of Object.keys(settings)) {
    if (settings[key] !== DEFAULTS[key]) {
      toSave[key] = settings[key];
    }
  }
  localStorage.setItem(_key(team), JSON.stringify(toSave));
}

export function getDefaults() {
  return { ...DEFAULTS };
}

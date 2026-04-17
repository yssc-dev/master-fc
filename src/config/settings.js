import { ref, set, get } from 'firebase/database';
import { firebaseDb } from './firebase';
import { SHEET_CONFIG } from './constants';

const SETTINGS_KEY = "masterfc_settings";

export const SPORT_DEFAULTS = {
  풋살: {
    ownGoalPoint: -1,
    useCrovaGoguma: false,
    crovaPoint: 0,
    gogumaPoint: 0,
    bonusMultiplier: 1,
  },
  축구: {
    ownGoalPoint: -1,
    cleanSheetPoint: 1,
    opponents: [],
  },
};

export const PRESETS = {
  풋살: {
    "표준풋살": {
      description: "일반 풋살 규칙",
      values: {},
    },
    "마스터FC풋살": {
      description: "마스터FC 커스텀 (자살골 2배, 크로바/고구마)",
      values: {
        ownGoalPoint: -2,
        useCrovaGoguma: true,
        crovaPoint: 2,
        gogumaPoint: -1,
        bonusMultiplier: 2,
      },
    },
  },
  축구: {
    "표준축구": {
      description: "일반 축구 규칙",
      values: {},
    },
  },
};

const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  _default: { 풋살: "표준풋살", 축구: "표준축구" },
};

export function resolvePreset(team, sport) {
  return PRESET_MAP[team]?.[sport] ?? PRESET_MAP._default[sport];
}

const DEFAULTS = {
  // 구글시트 설정
  sheetId: SHEET_CONFIG.sheetId,
  attendanceSheet: "참석명단",
  dashboardSheet: "마스터FC 대시보드",
  pointLogSheet: "포인트로그",
  playerLogSheet: "선수별집계기록로그",
  // 팀전 설정
  dualTeams: [
    { name: "창조", members: ["조재상", "우창호"] },
    { name: "동서라북", members: ["서라현", "정동근"] },
    { name: "성환보영", members: ["김성환", "정보영"] },
    { name: "횡성홍우", members: ["김홍익", "우상운"] },
    { name: "투투", members: ["이영문", "이동규"] },
  ],
  dualTeamStartDate: "2026-04-01",
  dualTeamEndDate: "2026-07-01",
  // 경기규칙 설정
  ownGoalPoint: -2,
  crovaPoint: 2,
  gogumaPoint: -1,
  bonusMultiplier: 2,
  // 축구 전용
  eventLogSheet: "",
  cleanSheetPoint: 1,
  opponents: [],
};

function _key(team) {
  return `${SETTINGS_KEY}_${team || "default"}`;
}

function _safeTeam(team) {
  return (team || "기본팀").replace(/[.#$/\[\]]/g, "_");
}

function _firebaseRef(team) {
  return ref(firebaseDb, "settings/" + _safeTeam(team));
}

// localStorage 캐시 + Firebase 동기화
let _cache = {};

export function getSettings(team) {
  const key = _key(team);
  if (_cache[key]) return { ...DEFAULTS, ..._cache[key] };
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    _cache[key] = stored;
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(team, settings) {
  // 기본값과 같은 필드는 저장하지 않음
  const toSave = {};
  for (const key of Object.keys(settings)) {
    if (settings[key] !== DEFAULTS[key]) {
      toSave[key] = settings[key];
    }
  }
  const cacheKey = _key(team);
  _cache[cacheKey] = toSave;
  localStorage.setItem(cacheKey, JSON.stringify(toSave));

  // Firebase에도 저장
  try {
    await set(_firebaseRef(team), toSave);
  } catch (e) {
    console.warn("설정 Firebase 저장 실패:", e.message);
  }
}

// Firebase에서 설정 로드 → localStorage에 캐싱
// 새 팀(Firebase에 설정 없음)은 시트명을 비워서 다른 팀 데이터가 보이지 않도록 함
export async function loadSettingsFromFirebase(team) {
  try {
    const snap = await get(_firebaseRef(team));
    if (snap.exists()) {
      const data = snap.val();
      const key = _key(team);
      _cache[key] = data;
      localStorage.setItem(key, JSON.stringify(data));
      return { ...DEFAULTS, ...data };
    }
    // Firebase에 설정이 없는 새 팀: 시트명을 비워서 초기화
    const emptySheets = {
      dashboardSheet: "", attendanceSheet: "", pointLogSheet: "", playerLogSheet: "",
    };
    const key = _key(team);
    _cache[key] = emptySheets;
    localStorage.setItem(key, JSON.stringify(emptySheets));
    return { ...DEFAULTS, ...emptySheets };
  } catch (e) {
    console.warn("설정 Firebase 로드 실패:", e.message);
  }
  return getSettings(team);
}

export function _setCacheForTest(obj) {
  _cache = obj;
}

export function getEffectiveSettings(team, sport) {
  const teamData = _cache[team] || {};
  const sportDefaults = SPORT_DEFAULTS[sport] || {};
  const presetName = teamData[sport]?.preset;
  const presetValues = PRESETS[sport]?.[presetName]?.values || {};
  const overrides = teamData[sport]?.overrides || {};
  const shared = teamData.shared || {};

  return {
    ...sportDefaults,
    ...presetValues,
    ...overrides,
    ...shared,
    _meta: { preset: presetName, sport, team },
  };
}

export function getDefaults() {
  return { ...DEFAULTS };
}

export function getSportDefault(sport, key) {
  return SPORT_DEFAULTS[sport]?.[key];
}

export function getPresetValue(sport, preset, key) {
  return PRESETS[sport]?.[preset]?.values?.[key];
}

// shared는 종목 무관 키(sheetId 등) 전용이므로 override보다 우선 검사한다.
// 동일 키가 shared와 override 양쪽에 있으면 shared를 반환 — 배지 UI는 이 규칙을 전제로 한다.
export function getSourceOf(team, sport, key) {
  const teamData = _cache[team] || {};
  if (teamData.shared && key in teamData.shared) return "shared";
  const overrides = teamData[sport]?.overrides || {};
  if (key in overrides) return "override";
  const preset = teamData[sport]?.preset;
  const presetValues = PRESETS[sport]?.[preset]?.values || {};
  if (key in presetValues) return "preset";
  const sportDefaults = SPORT_DEFAULTS[sport] || {};
  if (key in sportDefaults) return "default";
  return "unknown";
}

const SHARED_KEYS = [
  "sheetId", "attendanceSheet", "dashboardSheet",
  "pointLogSheet", "playerLogSheet",
];
const FUTSAL_KEYS = [
  "ownGoalPoint", "crovaPoint", "gogumaPoint", "bonusMultiplier",
  "useCrovaGoguma", "dualTeams", "dualTeamStartDate", "dualTeamEndDate",
];
const SOCCER_KEYS = [
  "ownGoalPoint", "cleanSheetPoint", "opponents", "eventLogSheet",
];

export function isLegacyFormat(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (Object.keys(raw).length === 0) return false;
  return !raw.shared && !raw["풋살"] && !raw["축구"];
}

function _sparseOverrides(legacy, keys, presetValues) {
  const overrides = {};
  for (const k of keys) {
    if (legacy[k] === undefined) continue;
    if (legacy[k] === presetValues[k]) continue;
    overrides[k] = legacy[k];
  }
  return overrides;
}

export function migrateToNested(team, legacy, teamEntries) {
  const out = { shared: {} };
  for (const k of SHARED_KEYS) {
    if (legacy[k] !== undefined) out.shared[k] = legacy[k];
  }

  const sports = new Set((teamEntries || []).map(e => e.mode));
  if (sports.size === 0) sports.add("풋살");

  if (sports.has("풋살")) {
    const preset = resolvePreset(team, "풋살");
    const presetValues = PRESETS.풋살[preset]?.values || {};
    out["풋살"] = {
      preset,
      overrides: _sparseOverrides(legacy, FUTSAL_KEYS, presetValues),
    };
  }
  if (sports.has("축구")) {
    const preset = resolvePreset(team, "축구");
    const presetValues = PRESETS.축구[preset]?.values || {};
    out["축구"] = {
      preset,
      overrides: _sparseOverrides(legacy, SOCCER_KEYS, presetValues),
    };
  }
  return out;
}

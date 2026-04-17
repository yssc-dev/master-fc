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

export function getDefaults() {
  return { ...DEFAULTS };
}

import { ref, set, get } from 'firebase/database';
import { firebaseDb } from './firebase';
import { SHEET_CONFIG } from './constants';

const SETTINGS_KEY = "masterfc_settings";

const DEFAULTS = {
  // 구글시트 설정
  sheetId: SHEET_CONFIG.sheetId,
  attendanceSheet: "참석명단",
  dashboardSheet: "마스터FC 대시보드",
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
  } catch (e) {
    console.warn("설정 Firebase 로드 실패:", e.message);
  }
  return getSettings(team);
}

export function getDefaults() {
  return { ...DEFAULTS };
}

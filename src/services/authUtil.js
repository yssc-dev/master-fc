import { AUTH_STORAGE_KEY, AUTH_EXPIRY_HOURS } from '../config/constants';

const FAV_STORAGE_KEY = "masterfc_fav_team";

function favKey(user) {
  if (!user || !user.name) return null;
  return `${user.name}__${user.phone4 || ""}`;
}

const AuthUtil = {
  getStored() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > AUTH_EXPIRY_HOURS * 3600 * 1000) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) { return null; }
  },
  save(name, phone4, team, mode, role) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ name, phone4, team, mode, role, timestamp: Date.now() }));
  },
  clear() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },
  getFavoriteTeam(user) {
    const k = favKey(user);
    if (!k) return null;
    try {
      const raw = localStorage.getItem(FAV_STORAGE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      return map[k] || null;
    } catch (e) { return null; }
  },
  setFavoriteTeam(user, teamName) {
    const k = favKey(user);
    if (!k) return;
    let map = {};
    try {
      const raw = localStorage.getItem(FAV_STORAGE_KEY);
      if (raw) map = JSON.parse(raw) || {};
    } catch (e) { map = {}; }
    if (teamName) map[k] = teamName;
    else delete map[k];
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(map));
  },
};

export default AuthUtil;

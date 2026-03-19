import { AUTH_STORAGE_KEY, AUTH_EXPIRY_HOURS } from '../config/constants';

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
};

export default AuthUtil;

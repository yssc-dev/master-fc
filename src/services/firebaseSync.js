import { ref, set, get, remove, onValue, off, serverTimestamp } from 'firebase/database';
import { firebaseDb } from '../config/firebase';

const FirebaseSync = {
  _ref(team) {
    const safeTeam = (team || "기본팀").replace(/[.#$/\[\]]/g, "_");
    return ref(firebaseDb, "games/" + safeTeam + "/current");
  },

  async saveState(team, state) {
    try {
      await set(this._ref(team), {
        state: JSON.stringify(state),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { console.warn("Firebase 저장 실패:", e.message); }
  },

  async loadState(team) {
    try {
      const snap = await get(this._ref(team));
      if (!snap.exists()) return null;
      const data = snap.val();
      return { found: true, state: JSON.parse(data.state), savedAt: data.updatedAt };
    } catch (e) { console.warn("Firebase 로드 실패:", e.message); return null; }
  },

  async clearState(team) {
    try {
      await remove(this._ref(team));
    } catch (e) { console.warn("Firebase 삭제 실패:", e.message); }
  },

  listen(team, callback) {
    const dbRef = this._ref(team);
    const handler = (snap) => {
      if (!snap.exists()) { callback(null); return; }
      try {
        const data = snap.val();
        callback({ state: JSON.parse(data.state), updatedAt: data.updatedAt });
      } catch (e) { callback(null); }
    };
    onValue(dbRef, handler);
    return () => off(dbRef, "value", handler);
  },
};

export default FirebaseSync;

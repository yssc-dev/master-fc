import { ref, set, get, remove, onValue, off, serverTimestamp } from 'firebase/database';
import { firebaseDb } from '../config/firebase';

const FirebaseSync = {
  _safeTeam(team) {
    return (team || "기본팀").replace(/[.#$/\[\]]/g, "_");
  },

  _gameRef(team, gameId) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/active/" + gameId);
  },

  _activeRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/active");
  },

  // 이전 형식 호환 (마이그레이션용)
  _legacyRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/current");
  },

  async saveState(team, gameId, state) {
    try {
      await set(this._gameRef(team, gameId), {
        state: JSON.stringify(state),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("Firebase 저장 실패:", e.message);
      throw e; // 호출부(autoSave)에서 syncStatus 'error' 표시
    }
  },

  async loadAllActive(team) {
    try {
      // 새 형식: active/{gameId} 하위 전체 로드
      const snap = await get(this._activeRef(team));
      if (snap.exists()) {
        const games = [];
        snap.forEach(child => {
          try {
            const data = child.val();
            const state = JSON.parse(data.state);
            games.push({ gameId: child.key, state, savedAt: data.updatedAt });
          } catch (e) { /* skip invalid */ }
        });
        if (games.length > 0) return games;
      }
      // 이전 형식 호환: current 단일 노드
      const legacySnap = await get(this._legacyRef(team));
      if (legacySnap.exists()) {
        try {
          const data = legacySnap.val();
          const state = JSON.parse(data.state);
          return [{ gameId: state.gameId || "legacy", state, savedAt: data.updatedAt }];
        } catch (e) { /* ignore */ }
      }
      return [];
    } catch (e) { console.warn("Firebase 로드 실패:", e.message); return []; }
  },

  async loadState(team, gameId) {
    try {
      const snap = await get(this._gameRef(team, gameId));
      if (!snap.exists()) return null;
      const data = snap.val();
      return { found: true, state: JSON.parse(data.state), savedAt: data.updatedAt };
    } catch (e) { console.warn("Firebase 로드 실패:", e.message); return null; }
  },

  async clearState(team, gameId) {
    try {
      await remove(this._gameRef(team, gameId));
      // 이전 형식도 정리
      await remove(this._legacyRef(team));
    } catch (e) { console.warn("Firebase 삭제 실패:", e.message); }
  },

  listen(team, gameId, callback) {
    const dbRef = this._gameRef(team, gameId);
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

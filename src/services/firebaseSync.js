import { ref, set, get, remove, onValue, off, serverTimestamp, update } from 'firebase/database';
import { firebaseDb } from '../config/firebase';

// gameId 타임스탬프(g_<ts>)에서 KST 기준 yyyy-MM-dd 추출
function _kstDateFromGameId(gameId) {
  if (gameId && gameId.indexOf('g_') === 0) {
    const ts = parseInt(gameId.substring(2), 10);
    if (ts > 0) {
      const d = new Date(ts + 9 * 3600 * 1000);
      return d.toISOString().substring(0, 10);
    }
  }
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().substring(0, 10);
}

function _buildSummary(gameId, state) {
  const evtCount = (state.allEvents || []).length;
  const matchCount = (state.completedMatches || []).length;
  const creator = state.gameCreator || state.lastEditor || '?';
  return `${gameId} | ${creator} | ${state.phase || '?'} | 이벤트 ${evtCount}건 | 완료 ${matchCount}경기`;
}

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

  _finalizedBaseRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized");
  },

  _finalizedMetaAllRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_meta");
  },

  _finalizedStateRef(team, gameId) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_states/" + gameId);
  },

  _finalizedStatesAllRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_states");
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

  // 확정 경기 저장. _meta(목록용 요약) + _states(상세 JSON) 분리 — 목록 조회 시 JSON 다운로드 회피.
  async saveFinalized(team, gameId, state) {
    try {
      const summary = _buildSummary(gameId, state);
      const gameDate = _kstDateFromGameId(gameId);
      await update(this._finalizedBaseRef(team), {
        [`_meta/${gameId}`]: { summary, gameDate, updatedAt: serverTimestamp() },
        [`_states/${gameId}`]: { state: JSON.stringify(state) },
      });
    } catch (e) {
      console.warn("Firebase 확정 저장 실패:", e.message);
      throw e;
    }
  },

  // 히스토리 목록 (메타만, 가볍게)
  async loadFinalizedList(team) {
    try {
      const snap = await get(this._finalizedMetaAllRef(team));
      if (!snap.exists()) return [];
      const out = [];
      snap.forEach(child => {
        const v = child.val();
        out.push({
          gameId: child.key,
          gameDate: v.gameDate || '',
          summary: v.summary || '',
          savedAt: v.updatedAt || null,
        });
      });
      return out;
    } catch (e) { console.warn("확정 목록 로드 실패:", e.message); return []; }
  },

  // 상세 1건 (목록에서 클릭 시)
  async loadFinalizedOne(team, gameId) {
    try {
      const snap = await get(this._finalizedStateRef(team, gameId));
      if (!snap.exists()) return null;
      return snap.val().state || null;
    } catch (e) { console.warn("확정 상세 로드 실패:", e.message); return null; }
  },

  // 전체 state 로드 (분석용: PlayerAnalytics가 전체 경기 집계에 사용)
  async loadFinalizedAll(team) {
    try {
      const [metaSnap, statesSnap] = await Promise.all([
        get(this._finalizedMetaAllRef(team)),
        get(this._finalizedStatesAllRef(team)),
      ]);
      if (!metaSnap.exists()) return [];
      const states = statesSnap.exists() ? statesSnap.val() : {};
      const out = [];
      metaSnap.forEach(child => {
        const v = child.val();
        out.push({
          gameId: child.key,
          gameDate: v.gameDate || '',
          summary: v.summary || '',
          savedAt: v.updatedAt || null,
          stateJson: states[child.key]?.state || '',
        });
      });
      return out;
    } catch (e) { console.warn("확정 전체 로드 실패:", e.message); return []; }
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

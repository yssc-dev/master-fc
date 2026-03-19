import AuthUtil from './authUtil';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

const AppSync = {
  enabled() { return !!APPS_SCRIPT_URL; },

  _getAuthToken() {
    const auth = AuthUtil.getStored();
    return auth ? `${auth.team || ""}:${auth.name}:${auth.phone4}` : "";
  },

  _getTeam() {
    const auth = AuthUtil.getStored();
    return auth?.team || "";
  },

  async saveState(state) {
    if (!this.enabled()) return;
    try {
      const team = this._getTeam();
      const gameDate = new Date().toISOString().slice(0, 10);
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "saveState", state, team, gameDate, authToken: this._getAuthToken() }),
      });
    } catch (e) { console.warn("상태 저장 실패:", e.message); }
  },

  async loadState() {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL + "?action=loadState&team=" + encodeURIComponent(team) + "&authToken=" + encodeURIComponent(this._getAuthToken()));
      const data = await resp.json();
      return data.found ? data : null;
    } catch (e) { console.warn("상태 복원 실패:", e.message); return null; }
  },

  async clearState() {
    if (!this.enabled()) return;
    try {
      const team = this._getTeam();
      const gameDate = new Date().toISOString().slice(0, 10);
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "clearState", team, gameDate, authToken: this._getAuthToken() }),
      });
    } catch (e) { console.warn("상태 삭제 실패:", e.message); }
  },

  async finalizeState() {
    if (!this.enabled()) return;
    try {
      const team = this._getTeam();
      const gameDate = new Date().toISOString().slice(0, 10);
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "finalizeState", team, gameDate, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("상태 확정 실패:", e.message); return null; }
  },

  async getHistory() {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL + "?action=getHistory&team=" + encodeURIComponent(team) + "&authToken=" + encodeURIComponent(this._getAuthToken()));
      const data = await resp.json();
      return data.history || [];
    } catch (e) { console.warn("이력 조회 실패:", e.message); return []; }
  },

  async writePointLog(data) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writePointLog", data: { ...data, team }, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("포인트로그 저장 실패:", e.message); return null; }
  },

  async writePlayerLog(data) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writePlayerLog", data: { ...data, team }, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("선수별집계 저장 실패:", e.message); return null; }
  },

  async verifyAuth(name, phone4) {
    if (!this.enabled()) return { success: false, message: "서버 연결 불가" };
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "verifyAuth", name, phone4 }),
      });
      return await resp.json();
    } catch (e) { return { success: false, message: "인증 서버 연결 실패" }; }
  },

  async getCumulativeBonus() {
    if (!this.enabled()) return { crova: {}, goguma: {} };
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL + "?action=getCumulativeBonus&team=" + encodeURIComponent(team) + "&authToken=" + encodeURIComponent(this._getAuthToken()));
      const data = await resp.json();
      return { crova: data.crova || {}, goguma: data.goguma || {} };
    } catch (e) { console.warn("누적 보너스 조회 실패:", e.message); return { crova: {}, goguma: {} }; }
  },
};

export default AppSync;

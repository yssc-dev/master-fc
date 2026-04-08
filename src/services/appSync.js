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
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "saveState", state, team, gameId: state.gameId, authToken: this._getAuthToken() }),
      });
    } catch (e) { console.warn("상태 저장 실패:", e.message); }
  },

  // 모든 진행중 경기 로드
  async loadAllStates() {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "loadState", team, authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      // 하위호환: 단일 결과 → 배열 변환
      if (data.games) return data.games;
      if (data.found && data.state) return [{ gameId: data.state.gameId || "legacy", state: data.state, savedAt: data.savedAt }];
      return [];
    } catch (e) { console.warn("상태 복원 실패:", e.message); return []; }
  },

  async clearState(gameId) {
    if (!this.enabled()) return;
    try {
      const team = this._getTeam();
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "clearState", team, gameId, authToken: this._getAuthToken() }),
      });
    } catch (e) { console.warn("상태 삭제 실패:", e.message); }
  },

  async finalizeState(gameId) {
    if (!this.enabled()) return;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "finalizeState", team, gameId, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("상태 확정 실패:", e.message); return null; }
  },

  async getLatestDeltas(playerLogSheet) {
    if (!this.enabled()) return {};
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getPrevRankings", team, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.latestDeltas || {};
    } catch (e) { console.warn("최신 증분 조회 실패:", e.message); return {}; }
  },

  async getPointLog(pointLogSheet) {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getPointLog", team, pointLogSheet: pointLogSheet || "", authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.events || [];
    } catch (e) { console.warn("포인트로그 조회 실패:", e.message); return []; }
  },

  async getPlayerLog(playerLogSheet) {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getPlayerLog", team, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      if (data.debug) console.log("playerLog debug:", data.debug);
      return data.players || [];
    } catch (e) { console.warn("선수로그 조회 실패:", e.message); return []; }
  },

  async getRankingHistory(allPlayerNames, playerLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getRankingHistory", team, allPlayers: allPlayerNames || [], playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      if (data.debug) console.log("rankingHistory debug:", data.debug);
      return data.rankingHistory || null;
    } catch (e) { console.warn("랭킹 히스토리 조회 실패:", e.message); return null; }
  },

  async getSheetList() {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getSheetList", team: this._getTeam(), authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return data.sheets || [];
    } catch (e) { console.warn("시트 목록 조회 실패:", e.message); return []; }
  },

  async getHistory() {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getHistory", team, authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      if (!data.success && data.error) console.warn("이력 조회 서버 오류:", data.error);
      return data.history || [];
    } catch (e) { console.warn("이력 조회 실패:", e.message); return []; }
  },

  async writePointLog(data, pointLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writePointLog", data: { ...data, team }, pointLogSheet: pointLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("포인트로그 저장 실패:", e.message); return null; }
  },

  async writePlayerLog(data, playerLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writePlayerLog", data: { ...data, team }, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("선수별집계 저장 실패:", e.message); return null; }
  },

  async writeEventLog(data, eventLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeEventLog", data: { ...data, team }, eventLogSheet: eventLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("이벤트로그 저장 실패:", e.message); return null; }
  },

  async writeSoccerPointLog(data, pointLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeSoccerPointLog", data: { ...data, team }, pointLogSheet: pointLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("축구 포인트로그 저장 실패:", e.message); return null; }
  },

  async writeSoccerPlayerLog(data, playerLogSheet) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeSoccerPlayerLog", data: { ...data, team }, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("축구 선수별집계 저장 실패:", e.message); return null; }
  },

  // ── 대회 ──

  async createTournament(data) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "createTournament", data: { ...data, team }, authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("대회 생성 실패:", e.message); return null; }
  },

  async deleteTournament(tournamentId) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "deleteTournament", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("대회 삭제 실패:", e.message); return null; }
  },

  async updateTournamentMatch(tournamentId, matchNum, updates) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "updateTournamentMatch", tournamentId, matchNum, updates, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("경기 정보 업데이트 실패:", e.message); return null; }
  },

  async getTournamentList() {
    if (!this.enabled()) return [];
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentList", team, authToken: this._getAuthToken() }) });
      const data = await resp.json();
      return data.tournaments || [];
    } catch (e) { console.warn("대회 목록 조회 실패:", e.message); return []; }
  },

  async getTournamentRoster(tournamentId) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentRoster", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      return data.players || [];
    } catch (e) { console.warn("대회 명단 조회 실패:", e.message); return []; }
  },

  async getTournamentSchedule(tournamentId, ourTeam) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentSchedule", tournamentId, ourTeam: ourTeam || "", team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      return data.matches || [];
    } catch (e) { console.warn("대회 일정 조회 실패:", e.message); return []; }
  },

  async updateTournamentMatchScore(tournamentId, matchNum, homeScore, awayScore) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "updateTournamentMatchScore", tournamentId, matchNum, homeScore, awayScore, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("스코어 업데이트 실패:", e.message); return null; }
  },

  async writeTournamentEventLog(tournamentId, data) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeTournamentEventLog", tournamentId, data, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("대회 이벤트로그 저장 실패:", e.message); return null; }
  },

  async writeTournamentPlayerRecord(tournamentId, data) {
    if (!this.enabled()) return null;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeTournamentPlayerRecord", tournamentId, data, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("대회 선수기록 저장 실패:", e.message); return null; }
  },

  async getTournamentPlayerRecords(tournamentId) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentPlayerRecords", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      return data.players || [];
    } catch (e) { console.warn("대회 선수기록 조회 실패:", e.message); return []; }
  },

  async getTournamentEventLog(tournamentId) {
    if (!this.enabled()) return [];
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentEventLog", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      return data.events || [];
    } catch (e) { console.warn("대회 이벤트로그 조회 실패:", e.message); return []; }
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

  async getCumulativeBonus(playerLogSheet) {
    if (!this.enabled()) return { crova: {}, goguma: {} };
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getCumulativeBonus", team, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }),
      });
      const data = await resp.json();
      return { crova: data.crova || {}, goguma: data.goguma || {} };
    } catch (e) { console.warn("누적 보너스 조회 실패:", e.message); return { crova: {}, goguma: {} }; }
  },
};

export default AppSync;

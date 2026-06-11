import AuthUtil from './authUtil';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

// 세션 캐시 (5분 TTL)
const _cache = {};
const CACHE_TTL = 5 * 60 * 1000;
function cacheGet(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { delete _cache[key]; return null; }
  return entry.data;
}
function cacheSet(key, data) { _cache[key] = { data, ts: Date.now() }; }
function cacheInvalidate(prefix) {
  Object.keys(_cache).forEach(k => { if (k.startsWith(prefix)) delete _cache[k]; });
}

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

  // 시트 쓰기 공통 POST. Apps Script는 서버측 실패(잠금 실패/검증 실패 등)도
  // HTTP 200 + { success:false }로 응답하므로, fulfilled 여부만 보는 호출부
  // (Promise.allSettled)가 실패를 성공으로 오판하지 않게 여기서 throw로 변환한다.
  // 비200(인증 리다이렉트/장애 HTML)도 의미있는 메시지로 조기 차단.
  async _postWrite(payload, label) {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.warn(`${label} 실패: HTTP ${resp.status}`);
      throw new Error(`${label} 실패: HTTP ${resp.status}`);
    }
    const result = await resp.json();
    if (!result || result.success === false) {
      const msg = result?.error || "서버 응답 오류";
      console.warn(`${label} 실패:`, msg);
      throw new Error(`${label} 실패: ${msg}`);
    }
    return result;
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

  // ★ 관리자 전용 — 서버(Code.js ADMIN_ACTIONS)가 role을 검증함.
  //   멤버용 마감 플로우에 연결하면 '관리자 권한이 필요합니다'로 실패하니 주의.
  async finalizeState(gameId, state) {
    if (!this.enabled()) return;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "finalizeState", team, gameId, state, authToken: this._getAuthToken() }),
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
      console.log(`[sheet] GET action=getPointLog sheet="${pointLogSheet || ''}" team="${team}"`);
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
      console.log(`[sheet] GET action=getPlayerLog sheet="${playerLogSheet || ''}" team="${team}"`);
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
      console.log(`[sheet] GET action=getRankingHistory sheet="${playerLogSheet || ''}" team="${team}"`);
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

  // ── 시트 쓰기 (실패 시 throw — 호출부 Promise.allSettled가 rejected로 분류) ──

  async writePointLog(data, pointLogSheet) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writePointLog", data: { ...data, team: this._getTeam() }, pointLogSheet: pointLogSheet || "", authToken: this._getAuthToken() }, "포인트로그 저장");
  },

  async writePlayerLog(data, playerLogSheet) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writePlayerLog", data: { ...data, team: this._getTeam() }, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }, "선수별집계 저장");
  },

  async writeEventLog(data, eventLogSheet) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writeEventLog", data: { ...data, team: this._getTeam() }, eventLogSheet: eventLogSheet || "", authToken: this._getAuthToken() }, "이벤트로그 저장");
  },

  async writeSoccerPointLog(data, pointLogSheet) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writeSoccerPointLog", data: { ...data, team: this._getTeam() }, pointLogSheet: pointLogSheet || "", authToken: this._getAuthToken() }, "축구 포인트로그 저장");
  },

  async writeSoccerPlayerLog(data, playerLogSheet) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writeSoccerPlayerLog", data: { ...data, team: this._getTeam() }, playerLogSheet: playerLogSheet || "", authToken: this._getAuthToken() }, "축구 선수별집계 저장");
  },

  async writeRawEvents(data) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writeRawEvents", data: { ...data, team: this._getTeam() }, authToken: this._getAuthToken() }, "로그_이벤트 저장");
  },

  async writeRawPlayerGames(data) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writeRawPlayerGames", data: { ...data, team: this._getTeam() }, authToken: this._getAuthToken() }, "로그_선수경기 저장");
  },

  async writeMatchLog(rows) {
    if (!this.enabled()) return null;
    return this._postWrite({ action: "writeRawMatches", data: { rows, team: this._getTeam() }, authToken: this._getAuthToken() }, "로그_매치 저장");
  },

  async getMatchLog({ sport = '', dateFrom = '', dateTo = '' } = {}) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      console.log(`[sheet] GET action=getRawMatches sheet="로그_매치" team="${team}" sport="${sport}"`);
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getRawMatches", team, sport, dateFrom, dateTo, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_매치 조회 실패:", e.message); return null; }
  },

  async getEventLog({ sport = '', dateFrom = '', dateTo = '' } = {}) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      console.log(`[sheet] GET action=getRawEvents sheet="로그_이벤트" team="${team}" sport="${sport}"`);
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getRawEvents", team, sport, dateFrom, dateTo, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_이벤트 조회 실패:", e.message); return null; }
  },

  async getPlayerGameLog({ sport = '', dateFrom = '', dateTo = '' } = {}) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      console.log(`[sheet] GET action=getRawPlayerGames sheet="로그_선수경기" team="${team}" sport="${sport}"`);
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getRawPlayerGames", team, sport, dateFrom, dateTo, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_선수경기 조회 실패:", e.message); return null; }
  },

  async deleteMatchLogByDate({ sport, date }) {
    if (!this.enabled()) return null;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "deleteRawMatchesByDate", team, sport, date, authToken: this._getAuthToken() }),
      });
      return await resp.json();
    } catch (e) { console.warn("로그_매치 삭제 실패:", e.message); return null; }
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
    const ck = "tList";
    const cached = cacheGet(ck);
    if (cached) return cached;
    try {
      const team = this._getTeam();
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentList", team, authToken: this._getAuthToken() }) });
      const data = await resp.json();
      const result = data.tournaments || [];
      cacheSet(ck, result);
      return result;
    } catch (e) { console.warn("대회 목록 조회 실패:", e.message); return []; }
  },

  async getTournamentRoster(tournamentId) {
    if (!this.enabled()) return [];
    const ck = `tRoster_${tournamentId}`;
    const cached = cacheGet(ck);
    if (cached) return cached;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentRoster", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      const result = data.players || [];
      cacheSet(ck, result);
      return result;
    } catch (e) { console.warn("대회 명단 조회 실패:", e.message); return []; }
  },

  async getTournamentSchedule(tournamentId, ourTeam) {
    if (!this.enabled()) return [];
    const ck = `tSched_${tournamentId}`;
    const cached = cacheGet(ck);
    if (cached) return cached;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentSchedule", tournamentId, ourTeam: ourTeam || "", team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      const result = data.matches || [];
      cacheSet(ck, result);
      return result;
    } catch (e) { console.warn("대회 일정 조회 실패:", e.message); return []; }
  },

  async updateTournamentMatchScore(tournamentId, matchNum, homeScore, awayScore) {
    if (!this.enabled()) return null;
    cacheInvalidate(`tSched_${tournamentId}`); // 캐시 무효화
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "updateTournamentMatchScore", tournamentId, matchNum, homeScore, awayScore, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("스코어 업데이트 실패:", e.message); return null; }
  },

  async writeTournamentEventLog(tournamentId, data) {
    if (!this.enabled()) return null;
    cacheInvalidate(`tEvent_${tournamentId}`);
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeTournamentEventLog", tournamentId, data, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("대회 이벤트로그 저장 실패:", e.message); return null; }
  },

  async writeTournamentPlayerRecord(tournamentId, data) {
    if (!this.enabled()) return null;
    cacheInvalidate(`tPlayer_${tournamentId}`);
    cacheInvalidate(`tRoster_${tournamentId}`);
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "writeTournamentPlayerRecord", tournamentId, data, team: this._getTeam(), authToken: this._getAuthToken() }) });
      return await resp.json();
    } catch (e) { console.warn("대회 선수기록 저장 실패:", e.message); return null; }
  },

  async getTournamentPlayerRecords(tournamentId) {
    if (!this.enabled()) return [];
    const ck = `tPlayer_${tournamentId}`;
    const cached = cacheGet(ck);
    if (cached) return cached;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentPlayerRecords", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      const result = data.players || [];
      cacheSet(ck, result);
      return result;
    } catch (e) { console.warn("대회 선수기록 조회 실패:", e.message); return []; }
  },

  async getTournamentEventLog(tournamentId) {
    if (!this.enabled()) return [];
    const ck = `tEvent_${tournamentId}`;
    const cached = cacheGet(ck);
    if (cached) return cached;
    try {
      const resp = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "getTournamentEventLog", tournamentId, team: this._getTeam(), authToken: this._getAuthToken() }) });
      const data = await resp.json();
      const result = data.events || [];
      cacheSet(ck, result);
      return result;
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

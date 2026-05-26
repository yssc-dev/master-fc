import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { FALLBACK_DATA } from './config/fallbackData';
import { useTheme } from './hooks/useTheme';
import { fetchSheetData, fetchAttendanceData } from './services/sheetService';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import { useGameReducer } from './hooks/useGameReducer';
import { getSettings, getEffectiveSettings, saveSettings } from './config/settings';
import { makeStyles } from './styles/theme';
import PhaseIndicator from './components/common/PhaseIndicator';
import Modal from './components/common/Modal';
import SoccerMatchView from './components/game/SoccerMatchView';
import AttendeeSelector from './components/game/AttendeeSelector';
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint, calcSoccerScore,
  getCleanSheetPlayers, buildEventLogRows, buildPointLogRows, buildPlayerLogRows,
} from './utils/soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from './utils/rawLogBuilders';
import { buildRoundRowsFromSoccer } from './utils/matchRowBuilder';

export default function SoccerApp({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }) {
  const gameSettings = useMemo(() => getSettings(teamContext?.team), [teamContext?.team]);
  const [state, dispatch] = useGameReducer();
  const [opponentSuggestions, setOpponentSuggestions] = useState([]); // 시트에서 받은 상대팀 후보 (비동기화)
  const [newOpponentSetup, setNewOpponentSetup] = useState("");
  const {
    phase, dataLoading, dataSource, seasonPlayers,
    syncStatus, attendanceLoading, attendees, newPlayer,
    playerSortMode, matchModal, settingsSnapshot,
  } = state;

  const set = (field, value) => dispatch({ type: 'SET_FIELD', field, value });

  // ── 초기 데이터 로딩 ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const team = teamContext?.team || "";
    dispatch({ type: 'SET_FIELDS', fields: { matchMode: "soccer", courtCount: 1 } });

    if (!isNewGame && gameId) {
      FirebaseSync.loadStateReconstructed(team, gameId).then(state => {
        if (state && state.phase !== "setup") {
          dispatch({ type: 'SET_FIELDS', fields: { dataLoading: false, dataSource: "restoring" } });
          dispatch({ type: 'RESTORE_STATE', state });
          _loadBackgroundData(team);
          return;
        }
        _loadAllData(team);
      }).catch(() => _loadAllData(team));
      return;
    }

    _loadAllData(team);
  }, []);

  const _loadBackgroundData = (team) => {
    Promise.all([
      fetchSheetData().catch(() => null),
      Promise.resolve({ crova: {}, goguma: {} }),
    ]).then(([sheetData, cumBonus]) => {
      const fields = {};
      if (sheetData) { fields.seasonPlayers = sheetData.players; fields.dataSource = "sheet"; }
      if (cumBonus) { fields.seasonCrova = cumBonus.crova || {}; fields.seasonGoguma = cumBonus.goguma || {}; }
      if (Object.keys(fields).length > 0) dispatch({ type: 'SET_FIELDS', fields });
    });
  };

  const _loadAllData = (team) => {
    const loadPromises = [
      fetchSheetData().catch(err => { console.warn("시트 로딩 실패:", err.message); return null; }),
      Promise.resolve({ crova: {}, goguma: {} }),
    ];
    if (gameMode === "sheetSync") {
      loadPromises.push(
        fetchAttendanceData().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
    Promise.all(loadPromises).then(([sheetData, cumBonus, attendanceData]) => {
      const fields = { dataLoading: false };
      if (sheetData) { fields.seasonPlayers = sheetData.players; fields.dataSource = "sheet"; }
      else { fields.dataSource = "fallback"; }
      if (cumBonus) { fields.seasonCrova = cumBonus.crova || {}; fields.seasonGoguma = cumBonus.goguma || {}; }
      if (isNewGame) {
        const { _meta, ...snap } = getEffectiveSettings(teamContext.team, "축구");
        fields.settingsSnapshot = snap;
      }
      dispatch({ type: 'SET_FIELDS', fields });

      // 상대팀 후보: 구글시트 대시보드에서 (settings 영구저장 대신 시트가 소스)
      if (sheetData?.opponents?.length > 0) setOpponentSuggestions(sheetData.opponents);

      // 시트 연동 시 참석자는 미리 채우되, setup 화면에 머문다 (자동 경기진입 제거)
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        dispatch({
          type: 'SET_FIELDS',
          fields: { attendees: attendanceData.attendees, matchMode: "soccer", courtCount: 1 },
        });
      }
    });
  };

  // ── 참석자 시트 연동 ──
  const syncAttendance = () => {
    set('attendanceLoading', true);
    fetchAttendanceData()
      .then(data => dispatch({ type: 'SET_FIELDS', fields: { attendees: data.attendees } }))
      .catch(err => alert("참석명단 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };

  // ── 자동저장 ──
  const saveTimerRef = useRef(null);
  const isSyncingRef = useRef(false);
  const lastSyncedStateRef = useRef(null);
  // 탭 단위 고유 ID — 같은 사용자가 멀티탭일 때 echo 판별용 (이름만으론 구분 불가)
  const tabSessionIdRef = useRef(null);
  if (tabSessionIdRef.current === null) {
    tabSessionIdRef.current = Math.random().toString(36).slice(2, 10);
  }
  const editorTag = `${authUser?.name || "알 수 없음"}#${tabSessionIdRef.current}`;
  const gameState = useMemo(() => ({
    gameId: gameId || "legacy",
    gameCreator: state.gameCreator || authUser?.name || "알 수 없음",
    phase, attendees, matchMode: "soccer", courtCount: 1,
    soccerMatches: state.soccerMatches, currentMatchIdx: state.currentMatchIdx,
    opponents: state.opponents, soccerFormation: state.soccerFormation,
    settingsSnapshot,
    lastEditor: editorTag,
  }), [state.gameCreator, phase, attendees, state.soccerMatches, state.currentMatchIdx, state.opponents, state.soccerFormation, settingsSnapshot, authUser, gameId, editorTag]);

  const autoSync = useCallback(() => {
    if (isSyncingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      set('syncStatus', 'saving');
      const team = teamContext?.team || "";
      try {
        const written = await FirebaseSync.syncDiff(team, gameId || "legacy", lastSyncedStateRef.current, gameState);
        lastSyncedStateRef.current = gameState;
        if (written > 0) {
          set('syncStatus', 'saved');
          setTimeout(() => set('syncStatus', ''), 2000);
        } else {
          set('syncStatus', '');
        }
      } catch (e) {
        console.warn("자동저장 실패:", e.message);
        set('syncStatus', 'error');
      }
    }, 300);
  }, [gameState, teamContext]);

  useEffect(() => {
    if (phase !== "setup" && phase !== "") autoSync();
  }, [state.soccerMatches, phase, state.currentMatchIdx, state.soccerFormation, state.opponents, attendees]);

  // ── Firebase 노드별 구독 ──
  const lastRemoteUpdateRef = useRef(0);
  useEffect(() => {
    const team = teamContext?.team;
    if (!team) return;
    const gid = gameId || "legacy";
    const unsub = FirebaseSync.subscribe(team, gid, (remoteState, meta) => {
      if (!remoteState) return;
      if (meta?.updatedAt && Math.abs(Date.now() - meta.updatedAt) < 1500) {
        if (meta.lastEditor === editorTag) return;
      }
      if (meta?.updatedAt && meta.updatedAt <= lastRemoteUpdateRef.current) return;
      lastRemoteUpdateRef.current = meta?.updatedAt || Date.now();
      isSyncingRef.current = true;
      dispatch({ type: 'RESTORE_STATE', state: remoteState });
      lastSyncedStateRef.current = remoteState;
      setTimeout(() => { isSyncingRef.current = false; }, 500);
    });
    return unsub;
  }, [teamContext?.team, editorTag, gameId]);

  // ── 정렬된 선수 목록 ──
  const sortedPlayers = useMemo(() => {
    const arr = [...seasonPlayers];
    if (playerSortMode === "name") return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return arr.sort((a, b) => b.point - a.point);
  }, [seasonPlayers, playerSortMode]);

  // ── 축구 개인기록 (경기 중 모달용) ──
  const soccerStats = useMemo(() => {
    const finished = state.soccerMatches.filter(m => m.status === "finished");
    if (finished.length === 0) return [];
    const ES = state.settingsSnapshot || gameSettings;
    const raw = calcSoccerPlayerStats(finished);
    return Object.entries(raw).map(([name, st]) => ({
      name, ...st, point: calcSoccerPlayerPoint(st, ES),
    })).sort((a, b) => b.point - a.point);
  }, [state.soccerMatches, state.settingsSnapshot, gameSettings]);

  // ── 축구 핸들러 ──
  const createSoccerMatch = ({ opponent, lineup, gk, defenders }) => {
    dispatch({ type: 'CREATE_SOCCER_MATCH', opponent, lineup, gk, defenders });
  };
  const addSoccerEvent = (matchIdx, event) => {
    dispatch({ type: 'ADD_SOCCER_EVENT', matchIdx, event });
  };
  const deleteSoccerEvent = (matchIdx, eventId) => {
    dispatch({ type: 'DELETE_SOCCER_EVENT', matchIdx, eventId });
  };
  const finishSoccerMatch = (matchIdx) => {
    dispatch({ type: 'FINISH_SOCCER_MATCH', matchIdx });
  };
  // 오늘 참석팀에 추가 (시트가 마스터 소스이므로 settings 영구저장 안 함)
  const addOpponent = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if ((state.opponents || []).includes(trimmed)) return;
    dispatch({ type: 'SET_OPPONENTS', opponents: [...(state.opponents || []), trimmed] });
  };
  const removeOpponent = (name) => {
    dispatch({ type: 'SET_OPPONENTS', opponents: (state.opponents || []).filter(n => n !== name) });
  };
  const renameOpponent = (oldName, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    dispatch({ type: 'SET_OPPONENTS', opponents: (state.opponents || []).map(n => n === oldName ? trimmed : n) });
  };
  // setup에서 오늘 참석팀 토글 (후보 칩 탭)
  const toggleTodayOpponent = (name) => {
    const list = state.opponents || [];
    dispatch({ type: 'SET_OPPONENTS', opponents: list.includes(name) ? list.filter(n => n !== name) : [...list, name] });
  };

  // ── 기록확정 (구글시트 저장) ──
  const handleFinalize = async () => {
    const gameTs = gameId?.startsWith("g_") ? parseInt(gameId.slice(2)) : null;
    const gameD = gameTs ? new Date(gameTs) : new Date();
    const dateStr = `${gameD.getFullYear()}-${String(gameD.getMonth() + 1).padStart(2, "0")}-${String(gameD.getDate()).padStart(2, "0")}`;
    const inputTime = new Date().toLocaleString("ko-KR");

    const finished = state.soccerMatches.filter(m => m.status === "finished");
    if (finished.length === 0) { alert("종료된 경기가 없습니다."); return; }
    if (!confirm(`${gameD.getMonth() + 1}월 ${gameD.getDate()}일 축구기록을 확정하시겠습니까?\n\n${finished.length}경기 · 3종 로그를 저장합니다.`)) return;

    const eventLogRows = buildEventLogRows(finished, dateStr);
    const pointLogRows = buildPointLogRows(finished, dateStr, inputTime);
    const playerLogRows = buildPlayerLogRows(finished, dateStr, inputTime);
    const team = teamContext?.team || '';
    const stateForMatchRows = {
      ...state,
      soccerMatches: finished.map(m => ({ ...m, matchIdx: m.matchIdx + 1 })),
    };
    const sessionGameId = finished.length > 0
      ? (finished[0].startedAt ? `s_${finished[0].startedAt}` : `s_${dateStr}_${finished[0].matchIdx + 1}`)
      : '';
    const matchRows = buildRoundRowsFromSoccer({
      team,
      mode: '기본',
      tournamentId: '',
      date: dateStr,
      stateJSON: stateForMatchRows,
      inputTime,
    });
    matchRows.forEach(r => { r.game_id = sessionGameId; });
    const rawEvents = buildRawEventsFromSoccer({ team, gameId: sessionGameId, events: eventLogRows });
    const rawPlayerGames = buildRawPlayerGamesFromSoccer({ team, inputTime, players: playerLogRows });

    try {
      const results = await Promise.allSettled([
        AppSync.writeEventLog({ events: eventLogRows }, gameSettings.eventLogSheet),
        AppSync.writeSoccerPointLog({ events: pointLogRows }, gameSettings.pointLogSheet),
        AppSync.writeSoccerPlayerLog({ players: playerLogRows }, gameSettings.playerLogSheet),
        AppSync.writeRawEvents({ rows: rawEvents }),
        AppSync.writeRawPlayerGames({ rows: rawPlayerGames }),
        AppSync.writeMatchLog(matchRows),
      ]);
      const [r1, r2, r3, r4, r5, r6] = results;
      const legacyOk = r1.status === 'fulfilled' && r2.status === 'fulfilled' && r3.status === 'fulfilled';
      if (!legacyOk) throw new Error('기존 시트 저장 실패');
      // Firebase에 확정 state 저장 (HistoryView/PlayerAnalytics 소스)
      await FirebaseSync.saveFinalized(teamContext?.team, gameId, gameState);
      // active 클리어 (목록/이어하기에서 제거)
      await FirebaseSync.clearState(teamContext?.team, gameId);
      const r1v = r1.value, r2v = r2.value, r3v = r3.value;
      const r4v = r4.status === 'fulfilled' ? r4.value : null;
      const r5v = r5.status === 'fulfilled' ? r5.value : null;
      const r6v = r6.status === 'fulfilled' ? r6.value : null;
      alert(`기록 확정 완료!\n\n이벤트로그: ${r1v?.count || 0}건\n포인트로그: ${r2v?.count || 0}건\n선수별집계: ${r3v?.count || 0}명\n로그_이벤트: ${r4v?.count || 0}건${r4v?.skipped ? ` (skip ${r4v.skipped})` : ''}\n로그_선수경기: ${r5v?.count || 0}명${r5v?.skipped ? ` (skip ${r5v.skipped})` : ''}\n로그_매치: ${r6v?.count || 0}건${r6v?.skipped ? ` (skip ${r6v.skipped})` : ''}`);
      onBackToMenu?.();
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
  };

  const { C } = useTheme();
  const s = makeStyles(C);

  // ── LOADING ──
  if (dataLoading) {
    return (
      <div style={{ ...s.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚽</div>
        <div style={{ color: C.white, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{teamContext?.team || "축구"} 경기기록</div>
        <div style={{ color: C.gray, fontSize: 13 }}>선수 데이터 불러오는 중...</div>
      </div>
    );
  }

  // ── SETUP PHASE ──
  if (phase === "setup") {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>⚽ {teamContext?.team || "축구"} 경기기록</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={s.subtitle}>{new Date().toLocaleDateString("ko-KR")} 축구 기록기</div>
            <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: dataSource === "sheet" ? "#22c55e22" : "#f9731644", color: dataSource === "sheet" ? "#22c55e" : "#f97316", fontWeight: 600 }}>
              {dataSource === "sheet" ? "시트 연동" : "오프라인"}
            </div>
          </div>
          {authUser && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{authUser.name} · {teamContext?.team}</span>
              {onBackToMenu && <button onClick={onBackToMenu} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer" }}>메뉴</button>}
              <button onClick={onLogout} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer" }}>로그아웃</button>
            </div>
          )}
        </div>
        <PhaseIndicator activeIndex={0} />
        <div style={s.section}>
          <div style={s.sectionTitle}>👥 참석자 선택 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({attendees.length}명)</span></div>
          <AttendeeSelector
            attendees={attendees} sortedPlayers={sortedPlayers} playerSortMode={playerSortMode}
            onSyncSheet={syncAttendance}
            onToggle={(name) => dispatch({ type: 'TOGGLE_ATTENDEE', name })}
            onSetAll={(names) => dispatch({ type: 'SET_ATTENDEES', attendees: names })}
            onClear={() => set('attendees', [])}
            onToggleSort={() => set('playerSortMode', playerSortMode === "point" ? "name" : "point")}
            onAddManual={(name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } })}
            newPlayer={newPlayer} onNewPlayerChange={(v) => set('newPlayer', v)}
            attendanceLoading={attendanceLoading} styles={s}
          />
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>🆚 참석팀 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({(state.opponents || []).length}팀)</span></div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 8 }}>오늘 온 상대팀을 고르세요 (시트의 자주 붙은 팀 순)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {opponentSuggestions.map(o => (
                <div key={o.name} onClick={() => toggleTodayOpponent(o.name)} style={s.chip((state.opponents || []).includes(o.name))}>
                  <span>{o.name}</span>
                </div>
              ))}
              {opponentSuggestions.length === 0 && (
                <span style={{ fontSize: 12, color: C.gray }}>시트에 상대팀 기록이 없습니다. 아래에서 직접 추가하세요.</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={s.input} placeholder="새 상대팀 직접 추가" value={newOpponentSetup}
                onChange={e => setNewOpponentSetup(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { addOpponent(newOpponentSetup); setNewOpponentSetup(""); } }} />
              <button onClick={() => { addOpponent(newOpponentSetup); setNewOpponentSetup(""); }} style={s.btn(C.green)}>추가</button>
            </div>
            {(state.opponents || []).filter(n => !opponentSuggestions.some(o => o.name === n)).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {(state.opponents || []).filter(n => !opponentSuggestions.some(o => o.name === n)).map(name => (
                  <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, background: C.cardLight, fontSize: 13, color: C.white }}>
                    <span>{name}</span>
                    <button onClick={() => removeOpponent(name)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} aria-label={`${name} 제거`}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={s.bottomBar}>
          <button onClick={() => dispatch({ type: 'START_MATCHES', schedule: null, pushState: null })}
            style={s.btnFull(C.accent, C.bg)}>
            축구 경기 시작 ({attendees.length}명)
          </button>
        </div>
      </div>
    );
  }

  // ── MATCH PHASE ──
  if (phase === "match") {
    const finishedCount = state.soccerMatches.filter(m => m.status === "finished").length;

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={onBackToMenu} style={{ position: "absolute", left: 16, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>홈</button>
            <div style={s.title}>⚽ 경기 진행</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={s.subtitle}>축구 · {finishedCount}경기</div>
            {AppSync.enabled() && syncStatus && (
              <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: syncStatus === "saved" ? "#22c55e22" : syncStatus === "saving" ? "#3b82f622" : "#ef444422", color: syncStatus === "saved" ? "#22c55e" : syncStatus === "saving" ? "#3b82f6" : "#ef4444", fontWeight: 600 }}>
                {syncStatus === "saving" ? "저장 중..." : syncStatus === "saved" ? "저장됨" : "저장 실패"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => set('matchModal', 'playerStats')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>개인기록</button>
            {finishedCount > 0 && (
              <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>경기마감</button>
            )}
            {teamContext?.role === "관리자" && (
              <button onClick={async () => {
                if (!confirm("경기를 삭제하시겠습니까?\n모든 기록이 초기화됩니다.")) return;
                if (!confirm("되돌릴 수 없습니다. 정말 삭제하시겠습니까?")) return;
                await FirebaseSync.clearState(teamContext?.team, gameId);
                await AppSync.clearState(gameId);
                window.location.reload();
              }} style={{ ...s.btnSm(C.red, C.white), fontSize: 11 }}>경기삭제</button>
            )}
          </div>
        </div>

        {matchModal === "playerStats" && (
          <Modal onClose={() => set('matchModal', null)} title="오늘의 선수기록" maxWidth={500}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
                <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {soccerStats.map(p => (
                    <tr key={p.name}>
                      <td style={s.td(true)}>{p.name}</td>
                      <td style={s.td()}>{p.games}</td>
                      <td style={s.td(p.goals > 0)}>{p.goals}</td>
                      <td style={s.td(p.assists > 0)}>{p.assists}</td>
                      <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                      <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                      <td style={s.td()}>{p.conceded}</td>
                      <td style={{ ...s.td(true), fontSize: 13, fontWeight: 800 }}>{p.point}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}

        <div style={s.section}>
          <SoccerMatchView
            soccerMatches={state.soccerMatches} currentMatchIdx={state.currentMatchIdx}
            attendees={attendees} opponents={state.opponents || []}
            opponentSuggestions={opponentSuggestions}
            onRemoveOpponent={removeOpponent} onRenameOpponent={renameOpponent}
            onCreateMatch={createSoccerMatch} onAddEvent={addSoccerEvent}
            onDeleteEvent={deleteSoccerEvent} onFinishMatch={finishSoccerMatch}
            onAddOpponent={addOpponent} onGoToSummary={() => set('phase', 'summary')}
            gameSettings={state.settingsSnapshot || gameSettings} styles={s}
            savedFormation={state.soccerFormation}
            onFormationChange={(f) => dispatch({ type: 'SET_SOCCER_FORMATION', formation: f })}
          />
        </div>
      </div>
    );
  }

  // ── SUMMARY PHASE ──
  if (phase === "summary") {
    const finished = state.soccerMatches.filter(m => m.status === "finished");
    const sRows = soccerStats;

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>📊 최종 집계</div>
          <div style={s.subtitle}>{new Date().toLocaleDateString("ko-KR")} · {finished.length}경기</div>
        </div>
        <PhaseIndicator activeIndex={3} />
        <div style={s.section}>
          <div style={s.sectionTitle}>📊 경기 결과</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#", "상대팀", "결과", "CS"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {finished.map(m => {
                  const sc = calcSoccerScore(m.events);
                  const cs = getCleanSheetPlayers(m);
                  const result = sc.ourScore > sc.opponentScore ? "승" : sc.ourScore < sc.opponentScore ? "패" : "무";
                  return (
                    <tr key={m.matchIdx}>
                      <td style={s.td()}>{m.matchIdx + 1}</td>
                      <td style={s.td(true)}>{m.opponent}</td>
                      <td style={{ ...s.td(true), color: result === "승" ? C.green : result === "패" ? C.red : C.gray }}>{sc.ourScore}:{sc.opponentScore} {result}</td>
                      <td style={s.td()}>{cs.length > 0 ? "🛡" : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>👤 선수별 기록</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {sRows.map(p => (
                  <tr key={p.name}>
                    <td style={s.td(true)}>{p.name}</td>
                    <td style={s.td()}>{p.games}</td>
                    <td style={s.td(p.goals > 0)}>{p.goals}</td>
                    <td style={s.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                    <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={s.td()}>{p.conceded}</td>
                    <td style={{ ...s.td(true), fontSize: 14, fontWeight: 800 }}>{p.point}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.bottomBar}>
          <button onClick={() => set('phase', 'match')} style={s.btn(C.grayDark)}>경기로</button>
          <button onClick={handleFinalize}
            style={{ ...s.btn(C.green), flex: 1, opacity: teamContext?.role === "관리자" ? 1 : 0.4 }}
            disabled={teamContext?.role !== "관리자"}>
            {teamContext?.role === "관리자" ? "기록확정(구글시트로 데이터전송)" : "기록확정 (관리자만)"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

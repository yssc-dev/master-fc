import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TEAM_COLORS } from './config/constants';
import { FALLBACK_DATA } from './config/fallbackData';
import { useTheme } from './hooks/useTheme';
import { getPlayerPoint, getPlayerData, teamPower, calcMatchScore } from './utils/scoring';
import { snakeDraft } from './utils/draft';
import { generateRoundRobin, generate4Team2Court, generate5Team2Court, generate6Team2Court, generate6TeamSecondHalf, generate1Court } from './utils/brackets';
import { generateEventId } from './utils/idGenerator';
import { fetchSheetData, fetchAttendanceData } from './services/sheetService';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import { useGameReducer } from './hooks/useGameReducer';
import { getSettings, saveSettings } from './config/settings';
import { makeStyles } from './styles/theme';
import PhaseIndicator from './components/common/PhaseIndicator';
import Modal from './components/common/Modal';
import ScheduleMatchView from './components/game/ScheduleMatchView';
import FreeMatchView from './components/game/FreeMatchView';
import PushMatchView from './components/game/PushMatchView';
import { createInitialPushState, calcNextPushMatch } from './utils/pushMatch';
import SoccerMatchView from './components/game/SoccerMatchView';
import { calcSoccerPlayerStats, calcSoccerPlayerPoint, calcSoccerScore, getCleanSheetPlayers, buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from './utils/soccerScoring';
import ScheduleModal from './components/game/ScheduleModal';
import StandingsModal from './components/game/StandingsModal';
import PlayerStatsModal from './components/game/PlayerStatsModal';

export default function App({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }) {
  const gameSettings = useMemo(() => getSettings(teamContext?.team), [teamContext?.team]);
  const [state, dispatch] = useGameReducer();
  const {
    phase, dataLoading, dataSource, seasonPlayers, seasonCrova, seasonGoguma,
    syncStatus, attendanceLoading, attendees, newPlayer, teamCount, courtCount,
    matchMode, rotations, draftMode, freeSelectTeam, teams, teamNames,
    teamColorIndices, gks, gksHistory, editingTeamName, moveSource, schedule, currentRoundIdx,
    viewingRoundIdx, confirmedRounds, completedMatches, allEvents, isExtraRound,
    splitPhase, earlyFinish, matchModal, matchModal_sortKey, playerSortMode, pushState,
  } = state;

  const set = (field, value) => dispatch({ type: 'SET_FIELD', field, value });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회: gameId/isNewGame는 props로 변경되지 않음
  useEffect(() => {
    const team = teamContext?.team || "";

    // 이어하기: Firebase에서 특정 gameId로 빠르게 복원
    if (!isNewGame && gameId) {
      FirebaseSync.loadState(team, gameId).then(fb => {
        if (fb && fb.found && fb.state && fb.state.phase !== "setup") {
          dispatch({ type: 'SET_FIELDS', fields: { dataLoading: false, dataSource: "restoring" } });
          dispatch({ type: 'RESTORE_STATE', state: fb.state });
          _loadBackgroundData(team);
          return;
        }
        // Firebase에 없으면 Apps Script에서 시도 (전체 로드 후 gameId 매칭)
        return AppSync.loadAllStates().then(games => {
          const match = games.find(g => g.gameId === gameId);
          if (match && match.state && match.state.phase !== "setup") {
            dispatch({ type: 'SET_FIELDS', fields: { dataLoading: false, dataSource: "restoring" } });
            dispatch({ type: 'RESTORE_STATE', state: match.state });
            _loadBackgroundData(team);
            return;
          }
          _loadAllData(team);
        });
      }).catch(() => _loadAllData(team));
      return;
    }

    // 새 경기: 모든 데이터 병렬 로딩
    _loadAllData(team);

    // 축구팀이면 자동으로 축구 모드 설정
    if (teamContext?.mode === "축구") {
      dispatch({ type: 'SET_FIELDS', fields: { matchMode: "soccer", courtCount: 1 } });
    }
  }, []);

  // 백그라운드로 시트 데이터 + 누적보너스 로딩 (이어하기 시)
  const _loadBackgroundData = (team) => {
    Promise.all([
      fetchSheetData().catch(() => null),
      AppSync.getCumulativeBonus(gameSettings.playerLogSheet).catch(() => ({ crova: {}, goguma: {} })),
    ]).then(([sheetData, cumBonus]) => {
      const fields = {};
      if (sheetData) { fields.seasonPlayers = sheetData.players; fields.dataSource = "sheet"; }
      if (cumBonus) { fields.seasonCrova = cumBonus.crova || {}; fields.seasonGoguma = cumBonus.goguma || {}; }
      if (Object.keys(fields).length > 0) dispatch({ type: 'SET_FIELDS', fields });
    });
  };

  // 전체 데이터 로딩 (새 경기/구글시트 연동)
  const _loadAllData = (team) => {
    const loadPromises = [
      fetchSheetData().catch(err => { console.warn("시트 로딩 실패:", err.message); return null; }),
      AppSync.getCumulativeBonus(gameSettings.playerLogSheet).catch(err => { console.warn("누적보너스 로딩 실패:", err.message); return { crova: {}, goguma: {} }; }),
    ];
    if (gameMode === "sheetSync") {
      loadPromises.push(
        fetchAttendanceData().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
    Promise.all(loadPromises).then(([sheetData, cumBonus, attendanceData]) => {
      const fields = { dataLoading: false };
      let players = null;
      if (sheetData) {
        fields.seasonPlayers = sheetData.players;
        fields.dataSource = "sheet";
        players = sheetData.players;
      } else {
        fields.dataSource = "fallback";
      }
      if (cumBonus) {
        fields.seasonCrova = cumBonus.crova || {};
        fields.seasonGoguma = cumBonus.goguma || {};
      }
      dispatch({ type: 'SET_FIELDS', fields });

      // settings에서 opponents 로드
      const opponents = gameSettings.opponents || [];
      if (opponents.length > 0) {
        dispatch({ type: 'SET_OPPONENTS', opponents });
      }

      // 구글시트 연동 모드: 시트의 팀 편성을 그대로 사용, 없으면 스네이크 드래프트
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        const sp = players || FALLBACK_DATA.players;
        const prebuilt = attendanceData.prebuiltTeams || [];
        const hasPrebuilt = prebuilt.length > 0 && prebuilt.some(t => t.length > 0);

        let finalTeams;
        let sheetTeamCount;
        if (hasPrebuilt) {
          // 시트에서 이미 편성된 팀 사용 (G2:L9)
          finalTeams = prebuilt;
          sheetTeamCount = prebuilt.length;
        } else {
          // 편성 없으면 스네이크 드래프트
          sheetTeamCount = attendanceData.teamCount || 4;
          finalTeams = snakeDraft(attendanceData.attendees, sheetTeamCount, sp);
        }

        // 참석자 = 모든 팀원 합산 (시트 편성에 포함된 용병 포함)
        const allPlayers = [...new Set([...attendanceData.attendees, ...finalTeams.flat()])];

        const makeNameFromTeam = (members) => {
          if (members.length === 0) return "팀";
          const top = [...members].sort((a, b) => getPlayerPoint(b, sp) - getPlayerPoint(a, sp))[0];
          const firstName = top.length > 1 ? top.slice(1) : top;
          return `팀 ${firstName}`;
        };
        // 시트에서 팀명을 가져왔으면 사용, 없으면 자동 생성
        const sheetNames = attendanceData.prebuiltTeamNames || [];
        const tNames = hasPrebuilt && sheetNames.length === finalTeams.length
          ? sheetNames
          : finalTeams.map(t => makeNameFromTeam(t));
        const tColors = Array.from({ length: sheetTeamCount }, (_, i) => i % TEAM_COLORS.length);

        const cc = 2;
        let sched = null;
        if (sheetTeamCount === 4) sched = generate4Team2Court();
        else if (sheetTeamCount === 5) sched = generate5Team2Court();
        else if (sheetTeamCount === 6) sched = generate6Team2Court().firstHalf;
        else sched = generate1Court(sheetTeamCount, 2);

        dispatch({
          type: 'SET_FIELDS',
          fields: {
            attendees: allPlayers,
            teamCount: sheetTeamCount,
            courtCount: cc,
            matchMode: "schedule",
            draftMode: hasPrebuilt ? "sheet" : "snake",
            teams: finalTeams,
            teamNames: tNames,
            teamColorIndices: tColors,
            gks: {},
            schedule: sched || [],
            currentRoundIdx: 0,
            completedMatches: [],
            allEvents: [],
            isExtraRound: false,
            viewingRoundIdx: 0,
            confirmedRounds: {},
            matchModal: null,
            phase: "match",
            ...(sheetTeamCount === 6 ? { splitPhase: "first" } : {}),
          },
        });
      }
    });
  };

  // Attendance sync
  const syncAttendance = () => {
    set('attendanceLoading', true);
    fetchAttendanceData()
      .then(data => {
        dispatch({ type: 'SET_FIELDS', fields: { attendees: data.attendees, ...(data.teamCount ? { teamCount: data.teamCount } : {}) } });
      })
      .catch(err => alert("참석명단 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };

  // Auto-save
  const saveTimerRef = useRef(null);
  const isSyncingRef = useRef(false);
  const gameState = useMemo(() => ({
    gameId: gameId || "legacy",
    gameCreator: state.gameCreator || authUser?.name || "알 수 없음",
    phase, teams, teamNames, teamColorIndices, gks, gksHistory, allEvents,
    completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees,
    teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, pushState,
    soccerMatches: state.soccerMatches, currentMatchIdx: state.currentMatchIdx, opponents: state.opponents, soccerFormation: state.soccerFormation,
    lastEditor: authUser?.name || "알 수 없음",
    lastEditTime: Date.now(),
  }), [phase, teams, teamNames, teamColorIndices, gks, gksHistory, allEvents, completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees, teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, pushState, state.soccerMatches, authUser, gameId]);

  const autoSave = useCallback(() => {
    if (isSyncingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      set('syncStatus', 'saving');
      const team = teamContext?.team || "";
      try {
        await FirebaseSync.saveState(team, gameId || "legacy", gameState);
        if (AppSync.enabled()) {
          await AppSync.saveState(gameState);
        }
        set('syncStatus', 'saved');
        setTimeout(() => set('syncStatus', ''), 2000);
      } catch (e) {
        console.warn("자동저장 실패:", e.message);
        set('syncStatus', 'error');
      }
    }, 800);
  }, [gameState, teamContext]);

  useEffect(() => {
    if (phase !== "setup" && phase !== "") {
      autoSave();
    }
  }, [allEvents, completedMatches, currentRoundIdx, phase, gks, pushState, state.soccerMatches]);

  // Firebase listener
  const lastRemoteUpdateRef = useRef(0);
  useEffect(() => {
    const team = teamContext?.team;
    if (!team) return;
    const gid = gameId || "legacy";
    const unsub = FirebaseSync.listen(team, gid, (data) => {
      if (!data || !data.state) return;
      if (data.updatedAt && Math.abs(Date.now() - data.updatedAt) < 1500) {
        if (data.state.lastEditor === authUser?.name) return;
      }
      if (data.updatedAt && data.updatedAt <= lastRemoteUpdateRef.current) return;
      lastRemoteUpdateRef.current = data.updatedAt || Date.now();
      isSyncingRef.current = true;
      dispatch({ type: 'RESTORE_STATE', state: data.state });
      setTimeout(() => { isSyncingRef.current = false; }, 500);
    });
    return unsub;
  }, [teamContext?.team, authUser?.name]);

  // Derived state
  const sortedPlayers = useMemo(() => {
    const arr = [...seasonPlayers];
    if (playerSortMode === "name") return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return arr.sort((a, b) => b.point - a.point);
  }, [seasonPlayers, playerSortMode]);

  const getTeamStandings = useCallback(() => {
    const stats = {};
    teamNames.forEach((t, i) => { stats[t] = { idx: i, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }; });
    completedMatches.forEach(m => {
      if (m.isExtra || !stats[m.homeTeam] || !stats[m.awayTeam]) return;
      stats[m.homeTeam].games++; stats[m.awayTeam].games++;
      stats[m.homeTeam].gf += m.homeScore; stats[m.homeTeam].ga += m.awayScore;
      stats[m.awayTeam].gf += m.awayScore; stats[m.awayTeam].ga += m.homeScore;
      if (m.homeScore > m.awayScore) { stats[m.homeTeam].wins++; stats[m.homeTeam].points += 3; stats[m.awayTeam].losses++; }
      else if (m.awayScore > m.homeScore) { stats[m.awayTeam].wins++; stats[m.awayTeam].points += 3; stats[m.homeTeam].losses++; }
      else { stats[m.homeTeam].draws++; stats[m.awayTeam].draws++; stats[m.homeTeam].points++; stats[m.awayTeam].points++; }
    });
    return Object.entries(stats).map(([name, s]) => ({ name, ...s })).sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  }, [completedMatches, teamNames]);

  const finalStandings = useMemo(() => getTeamStandings(), [getTeamStandings]);

  const allRoundsComplete = useMemo(() => {
    if (matchMode === "schedule" && schedule.length > 0) {
      // 마지막 라운드가 확정됐으면 전체 완료
      const lastIdx = schedule.length - 1;
      return confirmedRounds[lastIdx] === true;
    }
    if (matchMode === "free" || matchMode === "push") return phase === "summary";
    return false;
  }, [matchMode, schedule, confirmedRounds, phase]);

  const getPlayerTeamName = useCallback((player) => {
    for (let i = 0; i < teams.length; i++) { if (teams[i].includes(player)) return teamNames[i]; }
    return null;
  }, [teams, teamNames]);

  const playerMatchStats = useMemo(() => {
    const stats = {};
    attendees.forEach(p => { stats[p] = { goals: 0, assists: 0, owngoals: 0, conceded: 0, keeperGames: 0, cleanSheets: 0 }; });
    allEvents.forEach(e => {
      if (e.type === "goal") { if (stats[e.player]) stats[e.player].goals++; if (e.assist && stats[e.assist]) stats[e.assist].assists++; if (e.concedingGk && stats[e.concedingGk]) stats[e.concedingGk].conceded++; }
      if (e.type === "owngoal") { if (stats[e.player]) stats[e.player].owngoals++; if (e.concedingGk && stats[e.concedingGk]) stats[e.concedingGk].conceded += 2; }
    });
    completedMatches.forEach(m => {
      if (m.homeGk && stats[m.homeGk]) { stats[m.homeGk].keeperGames++; if (m.awayScore === 0) stats[m.homeGk].cleanSheets++; }
      if (m.awayGk && stats[m.awayGk]) { stats[m.awayGk].keeperGames++; if (m.homeScore === 0) stats[m.awayGk].cleanSheets++; }
    });
    return stats;
  }, [allEvents, completedMatches, attendees]);

  const getSeasonLeader = useCallback((type) => {
    const data = type === "crova" ? seasonCrova : seasonGoguma;
    const entries = Object.entries(data).filter(([, v]) => v !== 0);
    if (entries.length === 0) return null;
    const sorted = entries.sort(([, a], [, b]) => b - a);
    if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) return null;
    return sorted[0][0];
  }, [seasonCrova, seasonGoguma]);

  const calcPlayerPoints = useCallback((player) => {
    const st = playerMatchStats[player];
    if (!st) return { total: 0, goals: 0, assists: 0, owngoals: 0, cleanSheets: 0, crova: 0, goguma: 0, conceded: 0, keeperGames: 0 };
    const { ownGoalPoint, crovaPoint, gogumaPoint, bonusMultiplier } = gameSettings;
    let pts = st.goals + st.assists + st.owngoals * ownGoalPoint + st.cleanSheets;
    let crova = 0, goguma = 0;
    if (matchMode !== "push" && (allRoundsComplete || earlyFinish) && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
      const pt = getPlayerTeamName(player);
      const first = finalStandings[0], last = finalStandings[finalStandings.length - 1];
      const sgl = getSeasonLeader("goguma"), scl = getSeasonLeader("crova");
      let cm = 1, gm = 1;
      if (sgl && getPlayerTeamName(sgl) === first.name) cm = bonusMultiplier;
      if (scl && getPlayerTeamName(scl) === last.name) gm = bonusMultiplier;
      if (pt === first.name) { crova = crovaPoint * cm; pts += crova; }
      if (pt === last.name) { goguma = gogumaPoint * gm; pts += goguma; }
    }
    return { total: pts, goals: st.goals, assists: st.assists, owngoals: st.owngoals, cleanSheets: st.cleanSheets, crova, goguma, conceded: st.conceded, keeperGames: st.keeperGames };
  }, [playerMatchStats, finalStandings, completedMatches, getPlayerTeamName, getSeasonLeader, allRoundsComplete, earlyFinish, gameSettings]);

  // Actions
  const handleGkChange = useCallback((teamIdx, player) => {
    set('gks', { ...gks, [teamIdx]: player });
  }, [gks]);

  const recordMatchEvent = (courtId, event) => dispatch({ type: 'ADD_EVENT', event: { ...event, id: generateEventId(), courtId, timestamp: Date.now() } });
  const undoMatchEvent = (courtId, matchId) => dispatch({ type: 'UNDO_EVENT', courtId, matchId });
  const deleteEvent = (globalIdx) => dispatch({ type: 'DELETE_EVENT', index: globalIdx });
  const editEvent = (globalIdx, updatedEvent) => dispatch({ type: 'EDIT_EVENT', index: globalIdx, event: updatedEvent });

  const finishMatch = (matchData) => dispatch({ type: 'FINISH_MATCH', match: { ...matchData, isExtra: isExtraRound } });
  const confirmPushRound = (matchResult, newPushState) => {
    dispatch({ type: 'CONFIRM_PUSH_ROUND', matchResult, newPushState });
  };

  const unconfirmLastPushRound = () => {
    if (completedMatches.length === 0) return;
    const last = completedMatches[completedMatches.length - 1];
    if (!confirm(`${last.homeTeam} ${last.homeScore}:${last.awayScore} ${last.awayTeam}\n\n이 경기의 확정을 취소하시겠습니까?`)) return;
    // pushState를 이전 상태로 되돌리기: 마지막 경기 결과를 제외하고 처음부터 재계산
    let prevPushState = createInitialPushState(teamCount);
    for (let i = 0; i < completedMatches.length - 1; i++) {
      const m = completedMatches[i];
      prevPushState = calcNextPushMatch(prevPushState, { homeIdx: m.homeIdx, awayIdx: m.awayIdx, homeScore: m.homeScore, awayScore: m.awayScore }, teamCount, teamNames);
    }
    dispatch({ type: 'UNCONFIRM_PUSH_ROUND', prevPushState });
  };

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
  const addOpponent = (name) => {
    const newOpponents = [...(state.opponents || []), name];
    dispatch({ type: 'SET_OPPONENTS', opponents: newOpponents });
    saveSettings(teamContext?.team, { opponents: newOpponents });
  };

  const makeTeamName = (members) => {
    const top = [...members].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers))[0];
    const firstName = top.length > 1 ? top.slice(1) : top;
    return `팀 ${firstName}`;
  };

  const goToTeamBuild = () => {
    if (matchMode === "soccer") {
      dispatch({ type: 'START_MATCHES', schedule: null, pushState: null });
      return;
    }
    if (draftMode === "snake") {
      if (attendees.length < teamCount * 2) { alert(`최소 ${teamCount * 2}명 선택`); return; }
      const drafted = snakeDraft(attendees, teamCount, seasonPlayers);
      dispatch({ type: 'SET_FIELDS', fields: { teams: drafted, teamNames: drafted.map(t => makeTeamName(t)), teamColorIndices: Array.from({ length: teamCount }, (_, i) => i % TEAM_COLORS.length), gks: {}, phase: "teamBuild" } });
    } else {
      if (attendees.length === 0) {
        dispatch({ type: 'SET_FIELDS', fields: { attendees: sortedPlayers.map(p => p.name) } });
      }
      dispatch({ type: 'SET_FIELDS', fields: { teams: Array.from({ length: teamCount }, () => []), teamNames: Array.from({ length: teamCount }, (_, i) => `팀 ${i + 1}`), teamColorIndices: Array.from({ length: teamCount }, (_, i) => i % TEAM_COLORS.length), gks: {}, freeSelectTeam: 0, phase: "teamBuild" } });
    }
  };

  const reshuffleTeams = () => {
    const d = snakeDraft(attendees, teamCount, seasonPlayers);
    dispatch({ type: 'SET_FIELDS', fields: { teams: d, teamNames: d.map(t => makeTeamName(t)), gks: {} } });
  };

  const freeAddPlayer = (player) => {
    const newTeams = teams.map(t => [...t]);
    newTeams[freeSelectTeam].push(player);
    const newNames = [...teamNames];
    newNames[freeSelectTeam] = makeTeamName(newTeams[freeSelectTeam]);
    dispatch({ type: 'SET_FIELDS', fields: { teams: newTeams, teamNames: newNames } });
  };

  const freeRemovePlayer = (player, teamIdx) => {
    const newTeams = teams.map(t => [...t]);
    newTeams[teamIdx] = newTeams[teamIdx].filter(p => p !== player);
    const newNames = [...teamNames];
    newNames[teamIdx] = newTeams[teamIdx].length > 0 ? makeTeamName(newTeams[teamIdx]) : `팀 ${teamIdx + 1}`;
    const newGks = { ...gks };
    if (newGks[teamIdx] === player) delete newGks[teamIdx];
    dispatch({ type: 'SET_FIELDS', fields: { teams: newTeams, teamNames: newNames, gks: newGks } });
  };

  const unassignedPlayers = useMemo(() => {
    const assigned = new Set(teams.flat());
    return attendees.filter(p => !assigned.has(p));
  }, [teams, attendees]);

  const startMatches = () => {
    if (teams.some(t => t.length < 1)) { alert("모든 팀에 최소 1명"); return; }
    let sched = null;
    let initPushState = null;
    if (matchMode === "schedule") {
      if (courtCount === 2) {
        if (teamCount === 4) sched = generate4Team2Court();
        else if (teamCount === 5) sched = generate5Team2Court();
        else if (teamCount === 6) { sched = generate6Team2Court().firstHalf; set('splitPhase', 'first'); }
      } else sched = generate1Court(teamCount, rotations);
    } else if (matchMode === "push") {
      initPushState = createInitialPushState(teamCount);
    }
    dispatch({ type: 'START_MATCHES', schedule: sched, pushState: initPushState });
  };

  const confirmRound = (roundIdx, matchResults) => {
    let newSchedule = null, newSplitPhase = null;
    const isLastRound = roundIdx >= schedule.length - 1;
    const nextIdx = matchMode === "schedule" && !isExtraRound && !isLastRound ? roundIdx + 1 : null;
    if (matchMode === "schedule" && !isExtraRound && teamCount === 6 && courtCount === 2 && splitPhase === "first") {
      // 6라운드 × 2코트 = 12경기 모두 완료 시 스플릿
      const cnt = completedMatches.filter(m => !m.isExtra).length + matchResults.length;
      if (cnt >= 12) {
        // 현재 라운드 결과까지 포함하여 순위 계산
        const allMatches = [...completedMatches.filter(m => !m.isExtra), ...matchResults];
        const stats = {};
        teamNames.forEach((t, i) => { stats[t] = { idx: i, points: 0, gf: 0, ga: 0 }; });
        allMatches.forEach(m => {
          if (!stats[m.homeTeam] || !stats[m.awayTeam]) return;
          stats[m.homeTeam].gf += m.homeScore; stats[m.homeTeam].ga += m.awayScore;
          stats[m.awayTeam].gf += m.awayScore; stats[m.awayTeam].ga += m.homeScore;
          if (m.homeScore > m.awayScore) { stats[m.homeTeam].points += 3; }
          else if (m.awayScore > m.homeScore) { stats[m.awayTeam].points += 3; }
          else { stats[m.homeTeam].points++; stats[m.awayTeam].points++; }
        });
        const ranked = Object.entries(stats)
          .map(([, s]) => s)
          .sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
        const rankedIndices = ranked.map(s => s.idx);
        const secondHalf = generate6TeamSecondHalf(rankedIndices);
        newSchedule = [...schedule, ...secondHalf];
        newSplitPhase = "second";
      }
    }
    dispatch({ type: 'CONFIRM_ROUND', roundIdx, matchResults, nextRoundIdx: nextIdx, newSchedule, newSplitPhase });
  };

  const handleConfirmScheduleRound = () => {
    const viewRound = schedule[viewingRoundIdx];
    if (!viewRound) return;
    const results = viewRound.matches.map((pair, i) => {
      const matchId = `R${viewingRoundIdx + 1}_C${i}`;
      const evts = allEvents.filter(e => e.matchId === matchId);
      const homeTeam = teamNames[pair[0]], awayTeam = teamNames[pair[1]];
      return {
        homeIdx: pair[0], awayIdx: pair[1], matchId, homeTeam, awayTeam,
        homeGk: gks[pair[0]] || null, awayGk: gks[pair[1]] || null,
        homeScore: calcMatchScore(evts, matchId, homeTeam),
        awayScore: calcMatchScore(evts, matchId, awayTeam),
        court: courtCount === 2 ? (i === 0 ? "A구장" : "B구장") : "",
        mercenaries: [],
      };
    });
    for (const r of results) {
      if (!r.homeGk || !r.awayGk) {
        alert(`${r.court} 키퍼를 지정하세요: ${!r.homeGk ? r.homeTeam : ""}${!r.homeGk && !r.awayGk ? ", " : ""}${!r.awayGk ? r.awayTeam : ""}`);
        return;
      }
    }
    const msg = results.map(r => `${r.court ? r.court + ": " : ""}${r.homeTeam} ${r.homeScore}:${r.awayScore} ${r.awayTeam}`).join("\n");
    if (!confirm(msg + "\n\n라운드 " + (viewingRoundIdx + 1) + " 결과를 확정하시겠습니까?")) return;
    confirmRound(viewingRoundIdx, results);
  };

  const handleUnconfirmRound = (roundIdx) => {
    if (!confirm(`라운드 ${roundIdx + 1} 확정을 취소하시겠습니까?\n결과가 초기화되고 다시 수정할 수 있습니다.`)) return;
    dispatch({ type: 'UNCONFIRM_ROUND', roundIdx });
  };

  const handleEarlyFinish = () => {
    const confirmedCount = Object.keys(confirmedRounds).length;
    if (!confirm(`${confirmedCount}/${schedule.length} 라운드만 진행되었습니다.\n확정된 라운드 결과로 경기를 마감하시겠습니까?`)) return;
    dispatch({ type: 'SET_FIELD', field: 'earlyFinish', value: true });
    set('phase', 'summary');
  };

  const handleFinalize = async () => {
    // 경기일자: 경기 생성 시점 (gameId = "g_timestamp")
    const gameTs = gameId?.startsWith("g_") ? parseInt(gameId.slice(2)) : null;
    const gameD = gameTs ? new Date(gameTs) : new Date();
    const dateStr = `${gameD.getFullYear()}-${String(gameD.getMonth() + 1).padStart(2, "0")}-${String(gameD.getDate()).padStart(2, "0")}`;
    // 입력시간: 구글시트로 데이터전송 시점
    const inputTime = new Date().toLocaleString("ko-KR");

    if (matchMode === "soccer") {
      const finished = state.soccerMatches.filter(m => m.status === "finished");
      if (finished.length === 0) { alert("종료된 경기가 없습니다."); return; }
      if (!confirm(`${gameD.getMonth() + 1}월 ${gameD.getDate()}일 축구기록을 확정하시겠습니까?\n\n${finished.length}경기 · 3종 로그를 저장합니다.`)) return;

      const eventLogRows = buildEventLogRows(finished, dateStr);
      const pointLogRows = buildPointLogRows(finished, dateStr, inputTime);
      const playerLogRows = buildPlayerLogRows(finished, dateStr, inputTime);

      try {
        const results = await Promise.all([
          AppSync.writeEventLog({ events: eventLogRows }, gameSettings.eventLogSheet),
          AppSync.writeSoccerPointLog({ events: pointLogRows }, gameSettings.pointLogSheet),
          AppSync.writeSoccerPlayerLog({ players: playerLogRows }, gameSettings.playerLogSheet),
        ]);
        await AppSync.finalizeState(gameId);
        await FirebaseSync.clearState(teamContext?.team, gameId);
        alert(`기록 확정 완료!\n\n이벤트로그: ${results[0]?.count || 0}건\n포인트로그: ${results[1]?.count || 0}건\n선수별집계: ${results[2]?.count || 0}명`);
      } catch (err) {
        alert("시트 저장 실패: " + err.message);
      }
      return;
    }

    if (!confirm(`${gameD.getMonth() + 1}월 ${gameD.getDate()}일 풋살기록을 확정하시겠습니까?\n\n시트에 포인트로그 + 선수별집계를 저장합니다.`)) return;

    const formatMatchId = (mid) => {
      const pPush = mid?.match(/^P(\d+)_C0$/);
      if (pPush) return `${pPush[1]}경기`;
      const pFree = mid?.match(/^F(\d+)_C(\d+)$/);
      if (pFree) {
        const court = courtCount === 2 ? (pFree[2] === "0" ? "A구장" : "B구장") : "";
        return `${pFree[1]}경기${court ? " " + court : ""}`;
      }
      const p = mid?.match(/^R(\d+)_C(\d+)$/);
      if (!p) return mid || "";
      const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`;
      return `${p[1]}라운드 ${court}`;
    };
    const pointEvents = allEvents.filter(e => e.type === "goal" || e.type === "owngoal").map(e => ({
      gameDate: dateStr, matchId: formatMatchId(e.matchId),
      myTeam: e.team || "",
      opponentTeam: e.type === "goal" ? (e.concedingTeam || "") : (e.scoringTeam || ""),
      scorer: e.type === "goal" ? e.player : "", assist: e.assist || "",
      ownGoalPlayer: e.type === "owngoal" ? e.player : "",
      concedingGk: e.concedingGk || "",
      inputTime,
    }));

    // 팀순위점수 계산: 1등팀 = teamCount점, 꼴찌팀 = 1점
    const teamRankScore = {};
    finalStandings.forEach((t, i) => { teamRankScore[t.name] = teamCount - i; });

    const playerData = attendees.map(p => {
      const pts = calcPlayerPoints(p);
      const playerTeam = getPlayerTeamName(p);
      const rankScore = teamRankScore[playerTeam] || 0;
      if (pts.goals === 0 && pts.assists === 0 && pts.owngoals === 0 && pts.conceded === 0 && pts.cleanSheets === 0 && pts.keeperGames === 0 && pts.crova === 0 && pts.goguma === 0 && rankScore === 0) return null;
      return { gameDate: dateStr, name: p, ...pts, owngoals: pts.owngoals * gameSettings.ownGoalPoint, rankScore, inputTime };
    }).filter(Boolean);

    try {
      const [r1, r2] = await Promise.all([
        AppSync.writePointLog({ events: pointEvents }, gameSettings.pointLogSheet),
        AppSync.writePlayerLog({ players: playerData }, gameSettings.playerLogSheet),
      ]);
      await AppSync.finalizeState(gameId);
      await FirebaseSync.clearState(teamContext?.team, gameId);
      alert(`기록 확정 완료!\n\n포인트로그: ${r1?.count || 0}건\n선수별집계: ${r2?.count || 0}명`);
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
  };

  const { C, mode: themeMode, toggle: toggleTheme } = useTheme();
  const s = makeStyles(C);
  const viewRoundConfirmed = confirmedRounds[viewingRoundIdx] || false;

  // LOADING
  if (dataLoading) {
    return (
      <div style={{ ...s.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚽</div>
        <div style={{ color: C.white, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{teamContext?.team || "풋살"} 경기기록</div>
        <div style={{ color: C.gray, fontSize: 13 }}>선수 데이터 불러오는 중...</div>
      </div>
    );
  }

  // SETUP PHASE
  if (phase === "setup") {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>⚽ {teamContext?.team || "풋살"} 경기기록</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={s.subtitle}>{new Date().toLocaleDateString("ko-KR")} {teamContext?.mode || "풋살"} 기록기</div>
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
        {teamContext?.mode !== "축구" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>⚙️ 경기 설정</div>
          <div style={s.card}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>팀 수</div>
              <div style={s.row}>{(matchMode === "push" ? [3, 4, 5, 6] : [4, 5, 6]).map(n => <button key={n} onClick={() => set('teamCount', n)} style={s.btn(teamCount === n ? C.accent : C.grayDark, teamCount === n ? C.bg : C.white)}>{n}팀</button>)}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>구장 수</div>
              <div style={s.row}>{[1, 2].map(n => <button key={n} onClick={() => { if (matchMode !== "push") set('courtCount', n); }} disabled={matchMode === "push"} style={{ ...s.btn(courtCount === n ? C.accent : C.grayDark, courtCount === n ? C.bg : C.white), opacity: matchMode === "push" && n !== 1 ? 0.3 : 1 }}>{n}코트</button>)}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>경기 모드</div>
              <div style={s.row}>
                <button onClick={() => set('matchMode', 'schedule')} style={s.btn(matchMode === "schedule" ? C.accent : C.grayDark, matchMode === "schedule" ? C.bg : C.white)}>대진표</button>
                <button onClick={() => set('matchMode', 'free')} style={s.btn(matchMode === "free" ? C.accent : C.grayDark, matchMode === "free" ? C.bg : C.white)}>자유대진</button>
                <button onClick={() => { set('matchMode', 'push'); set('courtCount', 1); }} style={s.btn(matchMode === "push" ? C.accent : C.grayDark, matchMode === "push" ? C.bg : C.white)}>밀어내기</button>
              </div>
            </div>
            <div style={{ marginBottom: courtCount === 1 && matchMode === "schedule" ? 12 : 0 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>팀 편성 방식</div>
              <div style={s.row}>
                <button onClick={() => set('draftMode', 'snake')} style={s.btn(draftMode === "snake" ? C.accent : C.grayDark, draftMode === "snake" ? C.bg : C.white)}>스네이크</button>
                <button onClick={() => set('draftMode', 'free')} style={s.btn(draftMode === "free" ? C.accent : C.grayDark, draftMode === "free" ? C.bg : C.white)}>자유편성</button>
              </div>
            </div>
            {courtCount === 1 && matchMode === "schedule" && (
              <div>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>회전 수</div>
                <div style={s.row}>{[1, 2, 3, 4].map(n => <button key={n} onClick={() => set('rotations', n)} style={s.btn(rotations === n ? C.accent : C.grayDark, rotations === n ? C.bg : C.white)}>{n}회전</button>)}</div>
              </div>
            )}
            {matchMode === "schedule" && courtCount === 2 && (
              <div style={{ fontSize: 11, color: C.gray, marginTop: 8, background: C.cardLight, padding: 8, borderRadius: 8 }}>
                {teamCount === 4 && "동일팀 4번씩 경기 · 12라운드"}{teamCount === 5 && "동일팀 2번씩 경기 · 10라운드"}{teamCount === 6 && "조별리그 → 순위별 재편성 · 12라운드"}
              </div>
            )}
          </div>
        </div>
        )}
        <div style={s.section}>
          <div style={s.sectionTitle}>👥 참석자 선택 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({attendees.length}명)</span></div>
          <div style={{ ...s.row, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={syncAttendance} disabled={attendanceLoading} style={{ ...s.btnSm("#22c55e"), opacity: attendanceLoading ? 0.6 : 1 }}>
              {attendanceLoading ? "연동 중..." : "📋 시트 연동"}
            </button>
            <button onClick={() => dispatch({ type: 'SET_ATTENDEES', attendees: sortedPlayers.filter(p => p.games > 0).map(p => p.name) })} style={s.btnSm(C.grayDark)}>활동선수 전체</button>
            <button onClick={() => set('attendees', [])} style={s.btnSm(C.grayDark)}>초기화</button>
            <button onClick={() => set('playerSortMode', playerSortMode === "point" ? "name" : "point")}
              style={s.btnSm(C.accentDim, C.white)}>
              {playerSortMode === "point" ? "포인트순" : "이름순"}
            </button>
          </div>
          <div style={s.card}>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {sortedPlayers.map(p => (
                <div key={p.name} onClick={() => dispatch({ type: 'TOGGLE_ATTENDEE', name: p.name })} style={s.chip(attendees.includes(p.name))}>
                  <span>{p.name}</span><span style={{ fontSize: 10, opacity: 0.7 }}>{p.point}p</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input style={s.input} placeholder="새 선수 이름" value={newPlayer} onChange={e => set('newPlayer', e.target.value)} onKeyDown={e => {
              if (e.key === "Enter") { const name = newPlayer.trim(); if (name && !attendees.includes(name)) { dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }); } }
            }} />
            <button onClick={() => { const name = newPlayer.trim(); if (name && !attendees.includes(name)) { dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }); } }} style={s.btn(C.green)}>추가</button>
          </div>
        </div>
        <div style={s.bottomBar}>
          <button onClick={goToTeamBuild} style={{ ...s.btnFull(C.accent, C.bg), opacity: matchMode !== "soccer" && draftMode === "snake" && attendees.length < teamCount * 2 ? 0.5 : 1 }}>
            {matchMode === "soccer" ? `축구 경기 시작 (${attendees.length}명)` : draftMode === "free" ? `자유 편성 (${teamCount}팀)` : `팀 편성 (${attendees.length}명 → ${teamCount}팀)`}
          </button>
        </div>
      </div>
    );
  }

  // TEAM BUILD PHASE
  if (phase === "teamBuild") {
    const sortedTeam = (team) => [...team].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers));

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>⚽ 팀 편성</div>
          <div style={s.subtitle}>{draftMode === "snake" ? "스네이크 드래프트" : "자유 편성"} · {teamCount}팀 · {attendees.length}명</div>
        </div>
        <PhaseIndicator activeIndex={1} />
        <div style={s.section}>
          <div style={{ ...s.row, marginBottom: 12 }}>
            {draftMode === "snake" && <button onClick={reshuffleTeams} style={s.btnSm(C.grayDark)}>재배치</button>}
            {draftMode === "free" && <button onClick={() => dispatch({ type: 'SET_FIELDS', fields: { teams: Array.from({ length: teamCount }, () => []), teamNames: Array.from({ length: teamCount }, (_, i) => `팀 ${i + 1}`), gks: {} } })} style={s.btnSm(C.grayDark)}>초기화</button>}
            <span style={{ fontSize: 11, color: C.gray }}>전력: {teams.map(t => teamPower(t, seasonPlayers)).join(" / ")}</span>
          </div>

          {draftMode === "free" && unassignedPlayers.length > 0 && (
            <div style={{ ...s.card, border: `2px solid ${C.accent}44`, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8 }}>미배정 선수 ({unassignedPlayers.length}명) → 아래 팀을 선택 후 클릭</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[...unassignedPlayers].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers)).map(p => {
                  const pd = getPlayerData(p, seasonPlayers);
                  return (
                    <div key={p} onClick={() => freeAddPlayer(p)} style={{ ...s.chip(false), cursor: "pointer", padding: "6px 10px", fontSize: 12 }}>
                      <span>{p}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{pd.point}p</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {draftMode === "free" && (
            <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
              {teams.map((_, tIdx) => (
                <button key={tIdx} onClick={() => set('freeSelectTeam', tIdx)}
                  style={{ flex: 1, padding: "8px 4px", textAlign: "center", background: freeSelectTeam === tIdx ? TEAM_COLORS[teamColorIndices[tIdx]]?.bg || C.accent : C.card, color: freeSelectTeam === tIdx ? TEAM_COLORS[teamColorIndices[tIdx]]?.text || C.bg : C.gray, fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer", borderRadius: 0, borderBottom: freeSelectTeam === tIdx ? `3px solid ${C.white}` : "3px solid transparent" }}>
                  {teamNames[tIdx]} ({teams[tIdx].length})
                </button>
              ))}
            </div>
          )}

          {teams.map((team, tIdx) => {
            const color = TEAM_COLORS[teamColorIndices[tIdx]];
            const sorted = sortedTeam(team);
            const isSelectedFreeTeam = draftMode === "free" && freeSelectTeam === tIdx;
            return (
              <div key={tIdx} style={{ ...s.teamCard(teamColorIndices[tIdx]), border: isSelectedFreeTeam ? `2px solid ${color?.bg || C.accent}` : "none" }}
                onClick={() => { if (draftMode === "free") set('freeSelectTeam', tIdx); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {editingTeamName === tIdx ? (
                      <input autoFocus style={{ ...s.input, width: 100, padding: "4px 8px", fontSize: 14, fontWeight: 700 }} value={teamNames[tIdx]}
                        onChange={e => { const c = [...teamNames]; c[tIdx] = e.target.value; set('teamNames', c); }}
                        onBlur={() => set('editingTeamName', null)} onKeyDown={e => e.key === "Enter" && set('editingTeamName', null)} />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); set('editingTeamName', tIdx); }}>{teamNames[tIdx]}</span>
                    )}
                    <span style={{ fontSize: 11, color: C.gray }}>전력 {teamPower(team, seasonPlayers)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {TEAM_COLORS.map((tc, ci) => (
                      <div key={ci} onClick={(e) => { e.stopPropagation(); const c = [...teamColorIndices]; c[tIdx] = ci; set('teamColorIndices', c); }}
                        style={{ width: 16, height: 16, borderRadius: "50%", background: tc.bg, border: teamColorIndices[tIdx] === ci ? `2px solid ${C.white}` : `1px solid ${C.grayDark}`, cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {sorted.map((player, pIdx) => {
                    const pd = getPlayerData(player, seasonPlayers);
                    return (
                      <div key={player} style={{ ...s.playerInTeam(color), color: C.white }}>
                        {pIdx === 0 && team.length > 0 && <span style={{ fontSize: 10, marginRight: 2 }}>👑</span>}
                        <span>{player}</span>
                        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{pd.point}p</span>
                        {draftMode === "snake" ? (
                          <button onClick={e => { e.stopPropagation(); set('moveSource', moveSource?.player === player ? null : { player, teamIdx: tIdx }); }}
                            style={{ ...s.btnSm(moveSource?.player === player ? C.orange : C.grayDarker, C.gray), padding: "2px 6px", fontSize: 10, marginLeft: 4 }}>
                            {moveSource?.player === player ? "취소" : "↔"}
                          </button>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); freeRemovePlayer(player, tIdx); }}
                            style={{ ...s.btnSm(C.redDim, C.white), padding: "2px 6px", fontSize: 10, marginLeft: 4 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {draftMode === "snake" && moveSource && moveSource.teamIdx !== tIdx && (
                    <div onClick={() => { dispatch({ type: 'MOVE_PLAYER', player: moveSource.player, fromIdx: moveSource.teamIdx, toIdx: tIdx }); set('moveSource', null); }}
                      style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 8, fontSize: 12, margin: 2, cursor: "pointer", border: `2px dashed ${C.accent}`, color: C.accent }}>
                      + {moveSource.player}
                    </div>
                  )}
                  {draftMode === "free" && team.length === 0 && (
                    <div style={{ color: C.grayDark, fontSize: 12, padding: 8 }}>위에서 선수를 클릭하세요</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={s.bottomBar}>
          <button onClick={() => set('phase', 'setup')} style={s.btn(C.grayDark)}>이전</button>
          <button onClick={startMatches} style={{ ...s.btn(C.green), flex: 1, opacity: teams.some(t => t.length < 1) ? 0.5 : 1 }}>경기 시작</button>
        </div>
      </div>
    );
  }

  // MATCH PHASE
  if (phase === "match") {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={onBackToMenu} style={{ position: "absolute", left: 16, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>홈</button>
            <div style={s.title}>⚽ 경기 진행</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={s.subtitle}>{matchMode === "soccer" ? `축구 · ${state.soccerMatches.filter(m => m.status === "finished").length}경기` : matchMode === "schedule" ? `${allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1}/${schedule.length}`}` : matchMode === "push" ? `밀어내기 · ${completedMatches.length}경기` : `자유대전 · ${completedMatches.length}매치`}</div>
            {AppSync.enabled() && syncStatus && (
              <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: syncStatus === "saved" ? "#22c55e22" : syncStatus === "saving" ? "#3b82f622" : "#ef444422", color: syncStatus === "saved" ? "#22c55e" : syncStatus === "saving" ? "#3b82f6" : "#ef4444", fontWeight: 600 }}>
                {syncStatus === "saving" ? "저장 중..." : syncStatus === "saved" ? "저장됨" : "저장 실패"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
            {matchMode === "schedule" && <button onClick={() => set('matchModal', 'schedule')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>대진표</button>}
            {matchMode !== "soccer" && <button onClick={() => set('matchModal', 'teamRoster')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>팀명단</button>}
            {matchMode !== "soccer" && <button onClick={() => set('matchModal', 'standings')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>팀순위</button>}
            <button onClick={() => set('matchModal', 'playerStats')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>개인기록</button>
            {(allRoundsComplete || matchMode === "free" || matchMode === "soccer" || (matchMode === "push" && completedMatches.length > 0)) && (
              <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>경기마감</button>
            )}
            {matchMode === "schedule" && !allRoundsComplete && Object.keys(confirmedRounds).length > 0 && (
              earlyFinish
                ? <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>최종집계</button>
                : <button onClick={handleEarlyFinish} style={{ ...s.btnSm(C.orange, C.bg), fontSize: 11, fontWeight: 700 }}>조기마감</button>
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

        {matchModal === "schedule" && (
          <ScheduleModal schedule={schedule} currentRoundIdx={currentRoundIdx} viewingRoundIdx={viewingRoundIdx}
            setViewingRoundIdx={(v) => set('viewingRoundIdx', v)} confirmedRounds={confirmedRounds}
            allEvents={allEvents} teamNames={teamNames} teamColorIndices={teamColorIndices} courtCount={courtCount}
            splitPhase={splitPhase} teamCount={teamCount} matchMode={matchMode} rotations={rotations}
            onClose={() => set('matchModal', null)} styles={s} />
        )}

        {matchModal === "teamRoster" && (
          <Modal onClose={() => set('matchModal', null)} title="팀 명단">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((team, tIdx) => {
                const color = TEAM_COLORS[teamColorIndices[tIdx]];
                const colWidth = teams.length <= 4 ? `calc(${100 / teams.length}% - 5px)` : `calc(${100 / Math.ceil(teams.length / 2)}% - 5px)`;
                return (
                  <div key={tIdx} style={{ width: colWidth, background: C.card, borderRadius: 10, borderTop: `3px solid ${color?.bg || C.accent}`, padding: "8px 6px" }}>
                    <div style={{ textAlign: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: color?.bg || C.accent }}>{teamNames[tIdx]}</div>
                      <div style={{ fontSize: 9, color: C.gray }}>{team.length}명</div>
                    </div>
                    {team.map((p, pIdx) => (
                      <div key={p} style={{ padding: "4px 2px", borderBottom: pIdx < team.length - 1 ? `1px solid ${C.grayDarker}` : "none", fontSize: 11 }}>
                        <span style={{ fontWeight: 600, color: C.white }}>{p}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Modal>
        )}

        {matchModal === "standings" && <StandingsModal standings={getTeamStandings()} splitPhase={splitPhase} teamCount={teamCount} onClose={() => set('matchModal', null)} styles={s} />}
        {matchModal === "playerStats" && <PlayerStatsModal attendees={attendees} calcPlayerPoints={calcPlayerPoints} onClose={() => set('matchModal', null)} styles={s} />}

        {matchModal === "gameFormat" && (
          <Modal onClose={() => set('matchModal', null)} title="경기방식">
            <div style={{ fontSize: 13, color: C.white, lineHeight: 1.7 }}>
              <div style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: C.accent, marginBottom: 6 }}>현재 설정</div>
                <div>{teamCount}팀 · {courtCount}코트 · {matchMode === "schedule" ? "대진표" : matchMode === "push" ? "밀어내기" : "자유대진"}{matchMode === "schedule" && courtCount === 1 ? ` · ${rotations}회전` : ""}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>
                  {teamCount === 4 && courtCount === 2 && "동일팀 4번씩 경기 · 12라운드"}
                  {teamCount === 5 && courtCount === 2 && "동일팀 2번씩 경기 · 10라운드 · 매 라운드 1팀 휴식"}
                  {teamCount === 6 && courtCount === 2 && "조별리그 → 순위별 재편성 · 12라운드"}
                  {courtCount === 1 && matchMode === "schedule" && `모든 팀 순서대로 경기 × ${rotations}회전`}
                  {matchMode === "free" && "매 라운드 직접 대진 선택"}
                  {matchMode === "push" && "승리팀 잔류, 패배팀 교체 · 2골 이상 승리 시 연장 · 3연승 후 휴식"}
                </div>
              </div>
              <details style={{ marginBottom: 8 }}>
                <summary style={{ fontSize: 12, color: C.gray, cursor: "pointer", padding: "8px 0" }}>다른 경기방식 보기</summary>
                <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.8, padding: "8px 0" }}>
                  <b style={{ color: C.orange }}>4팀·2코트</b> — 동일팀 4번씩 경기 (4×라운드로빈) 12R<br/>
                  <b style={{ color: C.orange }}>5팀·2코트</b> — 동일팀 2번씩 경기 (더블 라운드로빈) 10R. 매 라운드 1팀 휴식<br/>
                  <b style={{ color: C.orange }}>6팀·2코트</b> — 조별리그 → 순위별 재편성 (그룹 스플릿) 12R<br/>
                  <b style={{ color: C.orange }}>N팀·1코트</b> — 모든 팀 순서대로 경기 × 회전수<br/>
                  <b style={{ color: C.accent }}>자동 팀편성</b> — 포인트순 지그재그 배정 (1→2→3→4 / 4→3→2→1)
                </div>
              </details>
            </div>
          </Modal>
        )}

        <div style={s.section}>
          {matchMode === "soccer" ? (
            <SoccerMatchView
              soccerMatches={state.soccerMatches} currentMatchIdx={state.currentMatchIdx}
              attendees={attendees} opponents={state.opponents || gameSettings.opponents || []}
              onCreateMatch={createSoccerMatch} onAddEvent={addSoccerEvent}
              onDeleteEvent={deleteSoccerEvent} onFinishMatch={finishSoccerMatch}
              onAddOpponent={addOpponent} onGoToSummary={() => set('phase', 'summary')}
              gameSettings={gameSettings} styles={s}
              savedFormation={state.soccerFormation}
              onFormationChange={(f) => dispatch({ type: 'SET_SOCCER_FORMATION', formation: f })}
            />
          ) : matchMode === "push" ? (
            <PushMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks} gksHistory={gksHistory || {}}
              allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onConfirmPushRound={confirmPushRound} onUnconfirmLastRound={unconfirmLastPushRound} completedMatches={completedMatches}
              attendees={attendees} onGkChange={handleGkChange} pushState={pushState} styles={s} />
          ) : matchMode === "schedule" && schedule.length > 0 && !isExtraRound ? (
            <ScheduleMatchView schedule={schedule} currentRoundIdx={currentRoundIdx}
              viewingRoundIdx={viewingRoundIdx} setViewingRoundIdx={(v) => set('viewingRoundIdx', v)}
              confirmedRounds={confirmedRounds} onConfirmRound={confirmRound}
              teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks} gksHistory={gksHistory || {}}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              completedMatches={completedMatches} attendees={attendees} onGkChange={handleGkChange} splitPhase={splitPhase} styles={s} />
          ) : (
            <FreeMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onFinishMatch={finishMatch} completedMatches={completedMatches}
              attendees={attendees} onGkChange={handleGkChange} styles={s} isExtraRound={isExtraRound} />
          )}
        </div>

        {matchMode === "schedule" && schedule.length > 0 && !isExtraRound && (
          <div style={s.bottomBar}>
            {!viewRoundConfirmed && viewingRoundIdx <= currentRoundIdx && viewingRoundIdx < schedule.length ? (
              <button onClick={handleConfirmScheduleRound} style={{ ...s.btn(C.accent, C.bg), flex: 1 }}>
                라운드 {viewingRoundIdx + 1} 종료 확정
              </button>
            ) : viewRoundConfirmed ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ color: C.green, fontWeight: 700, padding: 10 }}>라운드 {viewingRoundIdx + 1} 종료됨</span>
                <button onClick={() => handleUnconfirmRound(viewingRoundIdx)}
                  style={{ ...s.btnSm(C.orange, C.bg), fontSize: 11 }}>확정취소</button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // SUMMARY PHASE
  if (phase === "summary") {
    const standings = finalStandings;
    const playerRows = attendees.map(p => ({ name: p, team: getPlayerTeamName(p), ...calcPlayerPoints(p) })).sort((a, b) => b.total - a.total);

    // Soccer summary
    if (matchMode === "soccer") {
      const finished = state.soccerMatches.filter(m => m.status === "finished");
      const sStats = calcSoccerPlayerStats(finished);
      const sRows = Object.entries(sStats).map(([name, st]) => ({
        name, ...st, point: calcSoccerPlayerPoint(st, gameSettings),
      })).sort((a, b) => b.point - a.point);

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

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>📊 최종 집계</div>
          <div style={s.subtitle}>{new Date().toLocaleDateString("ko-KR")} · {completedMatches.length}매치</div>
        </div>
        <PhaseIndicator activeIndex={3} />
        <div style={s.section}>
          <div style={s.sectionTitle}>🏆 팀 순위</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#", "팀", "경기", "승", "무", "패", "득", "실", "승점", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {standings.map((t, i) => (
                  <tr key={t.name} style={{ background: i === 0 ? `${C.green}11` : i === standings.length - 1 ? `${C.red}11` : "transparent" }}>
                    <td style={s.td()}>{i + 1}</td><td style={s.td(true)}>{t.name}</td>
                    <td style={s.td()}>{t.games}</td><td style={s.td()}>{t.wins}</td><td style={s.td()}>{t.draws}</td><td style={s.td()}>{t.losses}</td>
                    <td style={s.td()}>{t.gf}</td><td style={s.td()}>{t.ga}</td><td style={s.td(true)}>{t.points}</td>
                    <td style={s.td()}>{i === 0 ? "🍀" : i === standings.length - 1 ? "🍠" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>👤 선수별 기록</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{(matchMode === "push" ? ["선수", "골", "어시", "역주행", "클린", "실점", "GK", "총점"] : ["선수", "골", "어시", "역주행", "클린", "🍀", "🍠", "실점", "GK", "총점"]).map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {playerRows.map(p => (
                  <tr key={p.name}>
                    <td style={s.td(true)}>{p.name}<span style={{ fontSize: 10, color: C.gray, fontWeight: 400 }}>({p.team})</span></td>
                    <td style={s.td(p.goals > 0)}>{p.goals}</td><td style={s.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals > 0 ? p.owngoals * gameSettings.ownGoalPoint : 0}</td>
                    <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    {matchMode !== "push" && <td style={{ ...s.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>}
                    {matchMode !== "push" && <td style={{ ...s.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>}
                    <td style={s.td()}>{p.conceded}</td><td style={s.td()}>{p.keeperGames}</td>
                    <td style={{ ...s.td(true), fontSize: 14, fontWeight: 800 }}>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>📋 경기 기록</div>
          {completedMatches.map((m, i) => {
            const evts = allEvents.filter(e => e.matchId === m.matchId);
            return (
              <div key={i} style={{ ...s.card, background: m.isExtra ? `${C.orange}11` : C.card }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.gray }}>{(() => { const pP = m.matchId.match(/^P(\d+)_C0$/); if (pP) return `${pP[1]}경기`; const pF = m.matchId.match(/^F(\d+)_C(\d+)$/); if (pF) { const ct = courtCount === 2 ? (pF[2] === "0" ? "A구장" : "B구장") : ""; return `${pF[1]}경기${ct ? " " + ct : ""}`; } const p = m.matchId.match(/^R(\d+)_C(\d+)$/); if (!p) return m.matchId; const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`; return `${p[1]}라운드 ${court}`; })()}{m.isExtra ? " (임시)" : ""}</span>
                  {m.court && <span style={{ fontSize: 10, color: C.gray }}>{m.court}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 16, fontWeight: 700 }}>
                  <span style={{ color: m.homeScore > m.awayScore ? C.green : C.white }}>{m.homeTeam}</span>
                  <span style={{ fontSize: 24, fontWeight: 900 }}>{m.homeScore} : {m.awayScore}</span>
                  <span style={{ color: m.awayScore > m.homeScore ? C.green : C.white }}>{m.awayTeam}</span>
                </div>
                {evts.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {evts.map((e, ei) => (
                      <div key={ei} style={s.eventLog}>
                        <span>{e.type === "goal" ? "⚽" : "🔴"}</span>
                        <span style={{ fontWeight: 600 }}>{e.player}</span>
                        <span style={{ color: C.gray, fontSize: 11 }}>({e.type === "goal" ? "골" : "자책골"})</span>
                        {e.assist && <span style={{ color: C.gray, fontSize: 11 }}> ← {e.assist}<span style={{ opacity: 0.7 }}>(어시)</span></span>}
                        {e.concedingGk && <span style={{ color: C.gray, fontSize: 11 }}> / 실점: {e.concedingGk}{e.type === "owngoal" ? " (2점)" : ""}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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

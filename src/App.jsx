import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { C, TEAM_COLORS } from './config/constants';
import { FALLBACK_DATA } from './config/fallbackData';
import { getPlayerPoint, getPlayerData, teamPower } from './utils/scoring';
import { snakeDraft } from './utils/draft';
import { generateRoundRobin, generate4Team2Court, generate5Team2Court, generate6Team2Court, generate1Court } from './utils/brackets';
import { generateEventId } from './utils/idGenerator';
import { fetchSheetData, fetchAttendanceData } from './services/sheetService';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import { useGameReducer } from './hooks/useGameReducer';
import { styles } from './styles/theme';
import PhaseIndicator from './components/common/PhaseIndicator';
import Modal from './components/common/Modal';
import ScheduleMatchView from './components/game/ScheduleMatchView';
import FreeMatchView from './components/game/FreeMatchView';
import ScheduleModal from './components/game/ScheduleModal';
import StandingsModal from './components/game/StandingsModal';
import PlayerStatsModal from './components/game/PlayerStatsModal';

export default function App({ authUser, teamContext, isNewGame, gameMode, onLogout, onBackToMenu }) {
  const [state, dispatch] = useGameReducer();
  const {
    phase, dataLoading, dataSource, seasonPlayers, seasonCrova, seasonGoguma,
    syncStatus, attendanceLoading, attendees, newPlayer, teamCount, courtCount,
    matchMode, rotations, draftMode, freeSelectTeam, teams, teamNames,
    teamColorIndices, gks, editingTeamName, moveSource, schedule, currentRoundIdx,
    viewingRoundIdx, confirmedRounds, completedMatches, allEvents, isExtraRound,
    splitPhase, matchModal, matchModal_sortKey, playerSortMode,
  } = state;

  const set = (field, value) => dispatch({ type: 'SET_FIELD', field, value });

  // Load data on mount
  useEffect(() => {
    const team = teamContext?.team || "";
    const loadPromises = [
      fetchSheetData().catch(err => { console.warn("시트 로딩 실패:", err.message); return null; }),
      AppSync.getCumulativeBonus().catch(err => { console.warn("누적보너스 로딩 실패:", err.message); return { crova: {}, goguma: {} }; }),
    ];
    if (!isNewGame) {
      loadPromises.push(
        FirebaseSync.loadState(team).then(fb => fb || AppSync.loadState())
      );
    }
    // 구글시트 연동 모드: 참석명단도 함께 로딩
    if (gameMode === "sheetSync") {
      loadPromises.push(
        fetchAttendanceData().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
    Promise.all(loadPromises).then(([sheetData, cumBonus, saved, attendanceData]) => {
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

      if (!isNewGame && saved && saved.found && saved.state && saved.state.phase !== "setup") {
        dispatch({ type: 'RESTORE_STATE', state: saved.state });
        return;
      }

      // 구글시트 연동 모드: 참석명단 → 자동 팀편성 → 바로 경기
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        const sp = players || FALLBACK_DATA.players;
        const sheetTeamCount = attendanceData.teamCount || 4;
        const sheetAttendees = attendanceData.attendees;
        const drafted = snakeDraft(sheetAttendees, sheetTeamCount, sp);
        const makeNameFromTeam = (members) => {
          const top = [...members].sort((a, b) => getPlayerPoint(b, sp) - getPlayerPoint(a, sp))[0];
          const firstName = top.length > 1 ? top.slice(1) : top;
          return `팀 ${firstName}`;
        };
        const tNames = drafted.map(t => makeNameFromTeam(t));
        const tColors = Array.from({ length: sheetTeamCount }, (_, i) => i % TEAM_COLORS.length);

        // 스케줄 생성 (기본: 2코트, 대진표 모드)
        const cc = 2;
        let sched = null;
        if (sheetTeamCount === 4) sched = generate4Team2Court();
        else if (sheetTeamCount === 5) sched = generate5Team2Court();
        else if (sheetTeamCount === 6) sched = generate6Team2Court().firstHalf;
        else sched = generate1Court(sheetTeamCount, 2);

        dispatch({
          type: 'SET_FIELDS',
          fields: {
            attendees: sheetAttendees,
            teamCount: sheetTeamCount,
            courtCount: cc,
            matchMode: "schedule",
            draftMode: "snake",
            teams: drafted,
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
  }, []);

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
    phase, teams, teamNames, teamColorIndices, gks, allEvents,
    completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees,
    teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations,
    lastEditor: authUser?.name || "알 수 없음",
    lastEditTime: Date.now(),
  }), [phase, teams, teamNames, teamColorIndices, gks, allEvents, completedMatches, schedule, currentRoundIdx, viewingRoundIdx, confirmedRounds, attendees, teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, authUser]);

  const autoSave = useCallback(() => {
    if (isSyncingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      set('syncStatus', 'saving');
      const team = teamContext?.team || "";
      FirebaseSync.saveState(team, gameState);
      if (AppSync.enabled()) {
        AppSync.saveState(gameState).then(() => {
          set('syncStatus', 'saved');
          setTimeout(() => set('syncStatus', ''), 2000);
        }).catch(() => set('syncStatus', 'error'));
      } else {
        set('syncStatus', 'saved');
        setTimeout(() => set('syncStatus', ''), 2000);
      }
    }, 800);
  }, [gameState, teamContext]);

  useEffect(() => {
    if (phase !== "setup" && phase !== "") autoSave();
  }, [allEvents, completedMatches, currentRoundIdx, phase, gks]);

  // Firebase listener
  const lastRemoteUpdateRef = useRef(0);
  useEffect(() => {
    const team = teamContext?.team;
    if (!team) return;
    const unsub = FirebaseSync.listen(team, (data) => {
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
    if (matchMode === "schedule" && schedule.length > 0) return currentRoundIdx >= schedule.length;
    if (matchMode === "free") return phase === "summary";
    return false;
  }, [matchMode, schedule, currentRoundIdx, phase]);

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
    let pts = st.goals + st.assists + st.owngoals * -2 + st.cleanSheets;
    let crova = 0, goguma = 0;
    if (allRoundsComplete && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
      const pt = getPlayerTeamName(player);
      const first = finalStandings[0], last = finalStandings[finalStandings.length - 1];
      const sgl = getSeasonLeader("goguma"), scl = getSeasonLeader("crova");
      let cm = 1, gm = 1;
      if (sgl && getPlayerTeamName(sgl) === first.name) cm = 2;
      if (scl && getPlayerTeamName(scl) === last.name) gm = 2;
      if (pt === first.name) { crova = 2 * cm; pts += crova; }
      if (pt === last.name) { goguma = -1 * gm; pts += goguma; }
    }
    return { total: pts, goals: st.goals, assists: st.assists, owngoals: st.owngoals, cleanSheets: st.cleanSheets, crova, goguma, conceded: st.conceded, keeperGames: st.keeperGames };
  }, [playerMatchStats, finalStandings, completedMatches, getPlayerTeamName, getSeasonLeader, allRoundsComplete]);

  // Actions
  const handleGkChange = useCallback((teamIdx, player) => {
    set('gks', { ...gks, [teamIdx]: player });
  }, [gks]);

  const recordMatchEvent = (courtId, event) => dispatch({ type: 'ADD_EVENT', event: { ...event, id: generateEventId(), courtId, timestamp: Date.now() } });
  const undoMatchEvent = (courtId, matchId) => dispatch({ type: 'UNDO_EVENT', courtId, matchId });
  const deleteEvent = (globalIdx) => dispatch({ type: 'DELETE_EVENT', index: globalIdx });
  const editEvent = (globalIdx, updatedEvent) => dispatch({ type: 'EDIT_EVENT', index: globalIdx, event: updatedEvent });

  const finishMatch = (matchData) => dispatch({ type: 'FINISH_MATCH', match: { ...matchData, isExtra: isExtraRound } });

  const makeTeamName = (members) => {
    const top = [...members].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers))[0];
    const firstName = top.length > 1 ? top.slice(1) : top;
    return `팀 ${firstName}`;
  };

  const goToTeamBuild = () => {
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
    if (matchMode === "schedule") {
      if (courtCount === 2) {
        if (teamCount === 4) sched = generate4Team2Court();
        else if (teamCount === 5) sched = generate5Team2Court();
        else if (teamCount === 6) { sched = generate6Team2Court().firstHalf; set('splitPhase', 'first'); }
      } else sched = generate1Court(teamCount, rotations);
    }
    dispatch({ type: 'START_MATCHES', schedule: sched });
  };

  const confirmRound = (roundIdx, matchResults) => {
    let newSchedule = null, newSplitPhase = null;
    const nextIdx = matchMode === "schedule" && !isExtraRound ? roundIdx + 1 : null;
    if (matchMode === "schedule" && !isExtraRound && teamCount === 6 && courtCount === 2 && splitPhase === "first") {
      const cnt = completedMatches.filter(m => !m.isExtra).length + matchResults.length;
      if (cnt >= 6) {
        const standings = getTeamStandings();
        const top = standings.slice(0, 3).map(s => s.idx);
        const bot = standings.slice(3, 6).map(s => s.idx);
        const rrT = generateRoundRobin(top), rrB = generateRoundRobin(bot);
        const sh = [];
        for (let r = 0; r < 2; r++) for (let i = 0; i < rrT.length; i++) sh.push({ matches: [...(rrT[i] || []), ...(rrB[i] || [])] });
        newSchedule = [...schedule, ...sh];
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
        homeScore: evts.filter(e => e.scoringTeam === homeTeam).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0),
        awayScore: evts.filter(e => e.scoringTeam === awayTeam).reduce((s, e) => s + (e.type === "owngoal" ? 2 : 1), 0),
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

  const handleFinalize = async () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!confirm(`${d.getMonth() + 1}월 ${d.getDate()}일 풋살기록을 확정하시겠습니까?\n\n시트에 포인트로그 + 선수별집계를 저장합니다.`)) return;

    const pointEvents = allEvents.filter(e => e.type === "goal" || e.type === "owngoal").map(e => ({
      gameDate: dateStr, matchId: e.matchId || "",
      myTeam: e.team || "",
      opponentTeam: e.type === "goal" ? (e.concedingTeam || "") : (e.scoringTeam || ""),
      scorer: e.type === "goal" ? e.player : "", assist: e.assist || "",
      ownGoalPlayer: e.type === "owngoal" ? e.player : "",
      concedingGk: e.concedingGk || "",
      inputTime: new Date(e.timestamp).toLocaleString("ko-KR"),
    }));

    const now = new Date().toLocaleString("ko-KR");
    const playerData = attendees.map(p => {
      const pts = calcPlayerPoints(p);
      if (pts.goals === 0 && pts.assists === 0 && pts.owngoals === 0 && pts.conceded === 0 && pts.cleanSheets === 0 && pts.keeperGames === 0 && pts.crova === 0 && pts.goguma === 0) return null;
      return { gameDate: dateStr, name: p, ...pts, inputTime: now };
    }).filter(Boolean);

    try {
      const [r1, r2] = await Promise.all([
        AppSync.writePointLog({ events: pointEvents }),
        AppSync.writePlayerLog({ players: playerData }),
      ]);
      await AppSync.finalizeState();
      await FirebaseSync.clearState(teamContext?.team);
      alert(`기록 확정 완료!\n\n포인트로그: ${r1?.count || 0}건\n선수별집계: ${r2?.count || 0}명`);
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
  };

  const s = styles;
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
        <div style={s.section}>
          <div style={s.sectionTitle}>⚙️ 경기 설정</div>
          <div style={s.card}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>팀 수</div>
              <div style={s.row}>{[4, 5, 6].map(n => <button key={n} onClick={() => set('teamCount', n)} style={s.btn(teamCount === n ? C.accent : C.grayDark, teamCount === n ? C.bg : C.white)}>{n}팀</button>)}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>구장 수</div>
              <div style={s.row}>{[1, 2].map(n => <button key={n} onClick={() => set('courtCount', n)} style={s.btn(courtCount === n ? C.accent : C.grayDark, courtCount === n ? C.bg : C.white)}>{n}코트</button>)}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>경기 모드</div>
              <div style={s.row}>
                <button onClick={() => set('matchMode', 'schedule')} style={s.btn(matchMode === "schedule" ? C.accent : C.grayDark, matchMode === "schedule" ? C.bg : C.white)}>대진표</button>
                <button onClick={() => set('matchMode', 'free')} style={s.btn(matchMode === "free" ? C.accent : C.grayDark, matchMode === "free" ? C.bg : C.white)}>자유대진</button>
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
                {teamCount === 4 && "4×라운드로빈 · 12라운드"}{teamCount === 5 && "더블 라운드로빈 · 10라운드"}{teamCount === 6 && "그룹 스플릿 · 12라운드"}
              </div>
            )}
          </div>
        </div>
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
          <button onClick={goToTeamBuild} style={{ ...s.btnFull(C.accent, C.bg), opacity: draftMode === "snake" && attendees.length < teamCount * 2 ? 0.5 : 1 }}>
            {draftMode === "free" ? `자유 편성 (${teamCount}팀)` : `팀 편성 (${attendees.length}명 → ${teamCount}팀)`}
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
          <div style={s.title}>⚽ 경기 진행</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={s.subtitle}>{matchMode === "schedule" ? `${allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1}/${schedule.length}`}` : `자유대전 · ${completedMatches.length}경기`}</div>
            {AppSync.enabled() && syncStatus && (
              <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: syncStatus === "saved" ? "#22c55e22" : syncStatus === "saving" ? "#3b82f622" : "#ef444422", color: syncStatus === "saved" ? "#22c55e" : syncStatus === "saving" ? "#3b82f6" : "#ef4444", fontWeight: 600 }}>
                {syncStatus === "saving" ? "저장 중..." : syncStatus === "saved" ? "저장됨" : "저장 실패"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
            {matchMode === "schedule" && <button onClick={() => set('matchModal', 'schedule')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>대진표</button>}
            <button onClick={() => set('matchModal', 'teamRoster')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>팀명단</button>
            <button onClick={() => set('matchModal', 'standings')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>팀순위</button>
            <button onClick={() => set('matchModal', 'playerStats')} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 11 }}>개인기록</button>
            {(allRoundsComplete || matchMode === "free") && (
              <button onClick={() => set('phase', 'summary')} style={{ ...s.btnSm(C.green, C.bg), fontSize: 11, fontWeight: 700 }}>게임마감</button>
            )}
          </div>
        </div>

        {matchModal === "schedule" && (
          <ScheduleModal schedule={schedule} currentRoundIdx={currentRoundIdx} viewingRoundIdx={viewingRoundIdx}
            setViewingRoundIdx={(v) => set('viewingRoundIdx', v)} confirmedRounds={confirmedRounds}
            allEvents={allEvents} teamNames={teamNames} courtCount={courtCount}
            onClose={() => set('matchModal', null)} styles={s} />
        )}

        {matchModal === "teamRoster" && (
          <Modal onClose={() => set('matchModal', null)} title="팀 명단">
            {teams.map((team, tIdx) => {
              const color = TEAM_COLORS[teamColorIndices[tIdx]];
              const sorted = [...team].sort((a, b) => { const pa = calcPlayerPoints(a), pb = calcPlayerPoints(b); return pb.total - pa.total; });
              const teamTodayTotal = team.reduce((s, p) => s + calcPlayerPoints(p).total, 0);
              return (
                <div key={tIdx} style={{ ...s.teamCard(teamColorIndices[tIdx]), marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: color?.bg || C.accent }}>{teamNames[tIdx]}</span>
                    <span style={{ fontSize: 11, color: C.gray }}>{team.length}명 · 오늘 {teamTodayTotal}p</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {sorted.map((p, pIdx) => {
                      const pts = calcPlayerPoints(p);
                      return (
                        <span key={p} style={{ ...s.playerInTeam(color), color: C.white }}>
                          {pIdx === 0 && <span style={{ fontSize: 10, marginRight: 2 }}>👑</span>}
                          {p}
                          <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4, color: pts.total > 0 ? C.green : pts.total < 0 ? C.red : C.gray }}>{pts.total > 0 ? "+" : ""}{pts.total}p</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Modal>
        )}

        {matchModal === "standings" && <StandingsModal standings={getTeamStandings()} onClose={() => set('matchModal', null)} styles={s} />}
        {matchModal === "playerStats" && <PlayerStatsModal attendees={attendees} calcPlayerPoints={calcPlayerPoints} onClose={() => set('matchModal', null)} styles={s} />}

        <div style={s.section}>
          {matchMode === "schedule" && schedule.length > 0 && !isExtraRound ? (
            <ScheduleMatchView schedule={schedule} currentRoundIdx={currentRoundIdx}
              viewingRoundIdx={viewingRoundIdx} setViewingRoundIdx={(v) => set('viewingRoundIdx', v)}
              confirmedRounds={confirmedRounds} onConfirmRound={confirmRound}
              teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              completedMatches={completedMatches} attendees={attendees} onGkChange={handleGkChange} styles={s} />
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
              <div style={{ flex: 1, textAlign: "center", color: C.green, fontWeight: 700, padding: 10 }}>라운드 {viewingRoundIdx + 1} 종료됨</div>
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

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>📊 최종 집계</div>
          <div style={s.subtitle}>{new Date().toLocaleDateString("ko-KR")} · {completedMatches.length}경기</div>
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
          <div style={{ ...s.card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead><tr>{["선수", "팀", "골", "어시", "역주행", "클린", "🍀", "🍠", "실점", "GK", "총점"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {playerRows.map(p => (
                  <tr key={p.name}>
                    <td style={s.td(true)}>{p.name}</td><td style={s.td()}>{p.team}</td>
                    <td style={s.td(p.goals > 0)}>{p.goals}</td><td style={s.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                    <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={{ ...s.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>
                    <td style={{ ...s.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>
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
                  <span style={{ fontSize: 11, color: C.gray }}>{m.matchId}{m.isExtra ? " (임시)" : ""}</span>
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
            {teamContext?.role === "관리자" ? "기록 확정" : "기록 확정 (관리자만)"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

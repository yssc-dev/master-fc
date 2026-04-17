import { useReducer } from 'react';
import { FALLBACK_DATA } from '../config/fallbackData';

const initialState = {
  phase: "setup",
  dataLoading: true,
  dataSource: "",
  seasonPlayers: FALLBACK_DATA.players,
  seasonCrova: FALLBACK_DATA.seasonCrova,
  seasonGoguma: FALLBACK_DATA.seasonGoguma,
  syncStatus: "",
  attendanceLoading: false,
  attendees: [],
  newPlayer: "",
  teamCount: 4,
  courtCount: 2,
  matchMode: "schedule",
  rotations: 2,
  draftMode: "snake",
  freeSelectTeam: 0,
  teams: [],
  teamNames: [],
  teamColorIndices: [],
  gks: {},
  gksHistory: {},  // { roundIdx: { teamIdx: playerName } } — 확정된 라운드별 GK 기록
  editingTeamName: null,
  moveSource: null,
  schedule: [],
  currentRoundIdx: 0,
  viewingRoundIdx: 0,
  confirmedRounds: {},
  completedMatches: [],
  allEvents: [],
  isExtraRound: false,
  splitPhase: "first",
  gameCreator: "",
  earlyFinish: false,
  matchModal: null,
  matchModal_sortKey: "total",
  playerSortMode: "point",
  pushState: null,
  // 경기 중 팀 명단 수정
  teamEditMode: false,
  teamEditSnapshot: null,
  // 축구 전용
  soccerMatches: [],
  currentMatchIdx: -1,
  opponents: [],
  soccerFormation: null, // { formation, assignments, positionMap, subs, gk, viewState, selectedOpponent }
  // 경기 시작 시 스냅샷된 effective settings — 경기 중 규칙 변경에 영향받지 않음
  settingsSnapshot: null,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_FIELDS':
      return { ...state, ...action.fields };
    case 'RESTORE_STATE': {
      const s = action.state;
      const updates = {};
      // 배열/객체 필드: != null 체크로 빈 배열([])과 빈 객체({})도 정상 복원
      if (s.attendees != null) updates.attendees = s.attendees;
      if (s.teamCount != null) updates.teamCount = s.teamCount;
      if (s.courtCount != null) updates.courtCount = s.courtCount;
      if (s.matchMode != null) updates.matchMode = s.matchMode;
      if (s.rotations != null) updates.rotations = s.rotations;
      if (s.teams != null) updates.teams = s.teams;
      if (s.teamNames != null) updates.teamNames = s.teamNames;
      if (s.teamColorIndices != null) updates.teamColorIndices = s.teamColorIndices;
      if (s.gks != null) updates.gks = s.gks;
      if (s.gksHistory != null) updates.gksHistory = s.gksHistory;
      if (s.schedule != null) updates.schedule = s.schedule;
      if (s.currentRoundIdx != null) {
        // ★ 범위 보정: schedule 길이를 초과하면 마지막 라운드로 고정
        const maxIdx = (updates.schedule || s.schedule || state.schedule || []).length - 1;
        updates.currentRoundIdx = maxIdx >= 0 ? Math.min(s.currentRoundIdx, maxIdx) : s.currentRoundIdx;
      }
      if (s.completedMatches != null) updates.completedMatches = s.completedMatches;
      if (s.allEvents != null) updates.allEvents = s.allEvents;
      if (s.isExtraRound != null) updates.isExtraRound = s.isExtraRound;
      if (s.splitPhase != null) updates.splitPhase = s.splitPhase;
      if (s.viewingRoundIdx != null) {
        const maxIdx2 = (updates.schedule || s.schedule || state.schedule || []).length - 1;
        updates.viewingRoundIdx = maxIdx2 >= 0 ? Math.min(s.viewingRoundIdx, maxIdx2) : s.viewingRoundIdx;
      }
      if (s.confirmedRounds != null) updates.confirmedRounds = s.confirmedRounds;
      if (s.earlyFinish != null) updates.earlyFinish = s.earlyFinish;
      if (s.pushState != null) updates.pushState = s.pushState;
      if (s.soccerMatches != null) updates.soccerMatches = s.soccerMatches;
      if (s.currentMatchIdx != null) updates.currentMatchIdx = s.currentMatchIdx;
      if (s.opponents != null) updates.opponents = s.opponents;
      if (s.soccerFormation != null) updates.soccerFormation = s.soccerFormation;
      if (s.gameCreator != null) updates.gameCreator = s.gameCreator;
      if (s.phase != null) updates.phase = s.phase;
      if (s.settingsSnapshot != null) updates.settingsSnapshot = s.settingsSnapshot;
      return { ...state, ...updates };
    }
    case 'TOGGLE_ATTENDEE': {
      const name = action.name;
      const attendees = state.attendees.includes(name)
        ? state.attendees.filter(x => x !== name)
        : [...state.attendees, name];
      return { ...state, attendees };
    }
    case 'SET_ATTENDEES':
      return { ...state, attendees: action.attendees };
    case 'ADD_EVENT':
      return { ...state, allEvents: [...state.allEvents, action.event] };
    case 'UNDO_EVENT': {
      const { courtId, matchId } = action;
      const idx = [];
      state.allEvents.forEach((e, i) => { if (e.matchId === matchId && e.courtId === courtId) idx.push(i); });
      if (idx.length === 0) return state;
      return { ...state, allEvents: state.allEvents.filter((_, i) => i !== idx[idx.length - 1]) };
    }
    case 'DELETE_EVENT':
      return { ...state, allEvents: state.allEvents.filter((_, i) => i !== action.index) };
    case 'EDIT_EVENT':
      return {
        ...state,
        allEvents: state.allEvents.map((e, i) =>
          i === action.index ? { ...action.event, courtId: e.courtId, timestamp: e.timestamp } : e
        ),
      };
    case 'FINISH_MATCH':
      return { ...state, completedMatches: [...state.completedMatches, action.match] };
    case 'CONFIRM_PUSH_ROUND': {
      const { matchResult, newPushState } = action;
      return {
        ...state,
        completedMatches: [...state.completedMatches, matchResult],
        gksHistory: { ...state.gksHistory, [state.completedMatches.length]: { ...state.gks } },
        gks: {},
        pushState: newPushState,
      };
    }
    case 'UNCONFIRM_PUSH_ROUND': {
      const { prevPushState } = action;
      const newCompleted = state.completedMatches.slice(0, -1);
      const lastIdx = state.completedMatches.length - 1;
      const restoredGks = state.gksHistory[lastIdx] || {};
      const newGksHistory = { ...state.gksHistory };
      delete newGksHistory[lastIdx];
      return {
        ...state,
        completedMatches: newCompleted,
        gks: restoredGks,
        gksHistory: newGksHistory,
        pushState: prevPushState,
      };
    }
    case 'CONFIRM_ROUND': {
      const { roundIdx, matchResults, nextRoundIdx, newSchedule, newSplitPhase } = action;
      const newCompleted = [...state.completedMatches, ...matchResults.map(r => ({ ...r, isExtra: state.isExtraRound }))];
      // 현재 GK를 라운드별 히스토리에 저장 후 초기화
      const updates = {
        completedMatches: newCompleted,
        confirmedRounds: { ...state.confirmedRounds, [roundIdx]: true },
        gksHistory: { ...state.gksHistory, [roundIdx]: { ...state.gks } },
        gks: {},
      };
      if (newSchedule) updates.schedule = newSchedule;
      if (newSplitPhase) updates.splitPhase = newSplitPhase;
      if (nextRoundIdx != null) {
        updates.currentRoundIdx = nextRoundIdx;
        updates.viewingRoundIdx = nextRoundIdx;
      }
      return { ...state, ...updates };
    }
    case 'UNCONFIRM_ROUND': {
      const { roundIdx } = action;
      const prefix = `R${roundIdx + 1}_`;
      const newConfirmed = { ...state.confirmedRounds };
      delete newConfirmed[roundIdx];
      const restoredGks = state.gksHistory[roundIdx] || {};
      const newGksHistory = { ...state.gksHistory };
      delete newGksHistory[roundIdx];
      const newCompleted = state.completedMatches.filter(
        m => !m.matchId.startsWith(prefix) || m.isExtra
      );
      const updates = {
        confirmedRounds: newConfirmed,
        gks: restoredGks,
        gksHistory: newGksHistory,
        completedMatches: newCompleted,
        currentRoundIdx: roundIdx,
        viewingRoundIdx: roundIdx,
        earlyFinish: false,
      };
      // 6팀 스플릿 후 전반부 취소 시 스플릿 초기화
      if (state.splitPhase === "second") {
        const firstHalfLen = state.teamCount === 6 && state.courtCount === 2 ? 6 : state.schedule.length;
        const isFirstHalf = roundIdx < firstHalfLen;
        if (isFirstHalf) {
          updates.splitPhase = "first";
          updates.schedule = state.schedule.slice(0, firstHalfLen);
        }
      }
      return { ...state, ...updates };
    }
    case 'MOVE_PLAYER': {
      const { player, fromIdx, toIdx } = action;
      const teams = state.teams.map(t => [...t]);
      teams[fromIdx] = teams[fromIdx].filter(p => p !== player);
      teams[toIdx] = [...teams[toIdx], player];
      const gks = { ...state.gks };
      if (gks[fromIdx] === player) delete gks[fromIdx];
      return { ...state, teams, gks };
    }
    case 'ENTER_TEAM_EDIT': {
      return {
        ...state,
        teamEditMode: true,
        teamEditSnapshot: {
          teams: state.teams.map(t => [...t]),
          teamNames: [...state.teamNames],
          attendees: [...state.attendees],
          gks: { ...state.gks },
        },
        phase: 'teamBuild',
        draftMode: 'free',
        matchModal: null,
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'EXIT_TEAM_EDIT_SAVE': {
      // GK 정리: 각 팀에서 빠진 선수가 GK로 지정돼 있으면 해제
      const newGks = { ...state.gks };
      state.teams.forEach((team, i) => {
        if (newGks[i] && !team.includes(newGks[i])) delete newGks[i];
      });
      return {
        ...state,
        teamEditMode: false,
        teamEditSnapshot: null,
        gks: newGks,
        phase: 'match',
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'EXIT_TEAM_EDIT_CANCEL': {
      const snap = state.teamEditSnapshot;
      return {
        ...state,
        teams: snap.teams,
        teamNames: snap.teamNames,
        attendees: snap.attendees,
        gks: snap.gks,
        teamEditMode: false,
        teamEditSnapshot: null,
        phase: 'match',
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'START_MATCHES': {
      const { schedule, pushState: initPushState } = action;
      return {
        ...state,
        schedule: schedule || [],
        currentRoundIdx: 0,
        completedMatches: [],
        allEvents: [],
        isExtraRound: false,
        viewingRoundIdx: 0,
        confirmedRounds: {},
        matchModal: null,
        phase: "match",
        pushState: initPushState || null,
        soccerMatches: [],
        currentMatchIdx: -1,
      };
    }
    case 'CREATE_SOCCER_MATCH': {
      const { opponent, lineup, gk, defenders } = action;
      const newMatch = {
        matchIdx: state.soccerMatches.length,
        opponent, lineup, gk, defenders,
        events: [],
        startedAt: Date.now(),
        ourScore: 0, opponentScore: 0,
        status: "playing",
      };
      return {
        ...state,
        soccerMatches: [...state.soccerMatches, newMatch],
        currentMatchIdx: state.soccerMatches.length,
      };
    }
    case 'ADD_SOCCER_EVENT': {
      const { matchIdx, event } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const events = [...m.events, { ...event, id: event.id || Date.now().toString(), timestamp: event.timestamp || Date.now() }];
        let ourScore = 0, opponentScore = 0;
        for (const ev of events) {
          if (ev.type === "goal") ourScore++;
          else if (ev.type === "owngoal") opponentScore++;
          else if (ev.type === "opponentGoal") opponentScore++;
        }
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
    case 'DELETE_SOCCER_EVENT': {
      const { matchIdx, eventId } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const events = m.events.filter(e => e.id !== eventId);
        let ourScore = 0, opponentScore = 0;
        for (const ev of events) {
          if (ev.type === "goal") ourScore++;
          else if (ev.type === "owngoal") opponentScore++;
          else if (ev.type === "opponentGoal") opponentScore++;
        }
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
    case 'FINISH_SOCCER_MATCH': {
      const { matchIdx } = action;
      const matches = state.soccerMatches.map((m, i) =>
        i === matchIdx ? { ...m, status: "finished" } : m
      );
      return { ...state, soccerMatches: matches, currentMatchIdx: -1 };
    }
    case 'SET_SOCCER_FORMATION': {
      return { ...state, soccerFormation: action.formation };
    }
    case 'SET_OPPONENTS': {
      return { ...state, opponents: action.opponents };
    }
    case 'SET_SETTINGS_SNAPSHOT':
      return { ...state, settingsSnapshot: action.snapshot };
    default:
      return state;
  }
}

export function useGameReducer() {
  return useReducer(gameReducer, initialState);
}

export { initialState };

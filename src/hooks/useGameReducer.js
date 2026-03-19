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
  matchModal: null,
  matchModal_sortKey: "total",
  playerSortMode: "point",
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
      if (s.attendees) updates.attendees = s.attendees;
      if (s.teamCount) updates.teamCount = s.teamCount;
      if (s.courtCount) updates.courtCount = s.courtCount;
      if (s.matchMode) updates.matchMode = s.matchMode;
      if (s.rotations) updates.rotations = s.rotations;
      if (s.teams) updates.teams = s.teams;
      if (s.teamNames) updates.teamNames = s.teamNames;
      if (s.teamColorIndices) updates.teamColorIndices = s.teamColorIndices;
      if (s.gks) updates.gks = s.gks;
      if (s.gksHistory) updates.gksHistory = s.gksHistory;
      if (s.schedule) updates.schedule = s.schedule;
      if (s.currentRoundIdx != null) {
        // ★ 범위 보정: schedule 길이를 초과하면 마지막 라운드로 고정
        const maxIdx = (updates.schedule || s.schedule || state.schedule || []).length - 1;
        updates.currentRoundIdx = maxIdx >= 0 ? Math.min(s.currentRoundIdx, maxIdx) : s.currentRoundIdx;
      }
      if (s.completedMatches) updates.completedMatches = s.completedMatches;
      if (s.allEvents) updates.allEvents = s.allEvents;
      if (s.isExtraRound != null) updates.isExtraRound = s.isExtraRound;
      if (s.splitPhase) updates.splitPhase = s.splitPhase;
      if (s.viewingRoundIdx != null) {
        const maxIdx2 = (updates.schedule || s.schedule || state.schedule || []).length - 1;
        updates.viewingRoundIdx = maxIdx2 >= 0 ? Math.min(s.viewingRoundIdx, maxIdx2) : s.viewingRoundIdx;
      }
      if (s.confirmedRounds) updates.confirmedRounds = s.confirmedRounds;
      if (s.gameCreator) updates.gameCreator = s.gameCreator;
      if (s.phase) updates.phase = s.phase;
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
    case 'MOVE_PLAYER': {
      const { player, fromIdx, toIdx } = action;
      const teams = state.teams.map(t => [...t]);
      teams[fromIdx] = teams[fromIdx].filter(p => p !== player);
      teams[toIdx] = [...teams[toIdx], player];
      const gks = { ...state.gks };
      if (gks[fromIdx] === player) delete gks[fromIdx];
      return { ...state, teams, gks };
    }
    case 'START_MATCHES': {
      const { schedule } = action;
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
      };
    }
    default:
      return state;
  }
}

export function useGameReducer() {
  return useReducer(gameReducer, initialState);
}

export { initialState };

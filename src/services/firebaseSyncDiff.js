// firebaseSync 의 순수 helper 함수들. firebase SDK 의존 없음.
// 별도 파일로 분리해 단위테스트 가능하게 함.

export const META_FIELDS = [
  'gameCreator', 'phase', 'currentRoundIdx', 'teamCount', 'courtCount',
  'matchMode', 'isExtraRound', 'splitPhase', 'rotations',
  'earlyFinish', 'gameFinalized', 'lastEditor',
  'currentMatchIdx', 'draftMode',
];

// 통째로 set 하는 배열/객체 필드 (변경 시 전체 교체)
export const WHOLE_REPLACE_FIELDS = [
  'teams', 'teamNames', 'teamColorIndices',
  'schedule', 'attendees', 'opponents',
  'pushState', 'settingsSnapshot', 'soccerFormation',
];

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

export function eventsToObj(arr) {
  const out = {};
  for (const e of (arr || [])) {
    if (!e || !e.id) continue;
    out[e.id] = e;
  }
  return out;
}

export function matchesToObj(arr) {
  const out = {};
  for (const m of (arr || [])) {
    if (!m || !m.matchId) continue;
    out[m.matchId] = m;
  }
  return out;
}

export function soccerMatchesToObj(arr) {
  const out = {};
  for (const m of (arr || [])) {
    if (!m) continue;
    const k = (m.matchIdx != null) ? String(m.matchIdx) : null;
    if (k == null) continue;
    out[k] = m;
  }
  return out;
}

// prev → next state diff. RTDB update() 에 그대로 쓸 수 있는 path-value map 반환.
// updatedAt/lastEditor 는 호출자가 첨부 (firebase SDK serverTimestamp 사용 위해).
export function diffStateToWrites(prev, next) {
  const writes = {};

  for (const f of META_FIELDS) {
    if (!deepEqual(prev?.[f], next?.[f])) {
      writes[`meta/${f}`] = next[f] === undefined ? null : next[f];
    }
  }

  for (const f of WHOLE_REPLACE_FIELDS) {
    if (!deepEqual(prev?.[f], next?.[f])) {
      writes[f] = next[f] === undefined ? null : next[f];
    }
  }

  // events
  {
    const prevObj = eventsToObj(prev?.allEvents);
    const nextObj = eventsToObj(next?.allEvents);
    for (const id of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[id], nextObj[id])) {
        writes[`events/${id}`] = nextObj[id] === undefined ? null : nextObj[id];
      }
    }
  }

  // matches (completedMatches)
  {
    const prevObj = matchesToObj(prev?.completedMatches);
    const nextObj = matchesToObj(next?.completedMatches);
    for (const id of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[id], nextObj[id])) {
        writes[`matches/${id}`] = nextObj[id] === undefined ? null : nextObj[id];
      }
    }
  }

  // soccerMatches
  {
    const prevObj = soccerMatchesToObj(prev?.soccerMatches);
    const nextObj = soccerMatchesToObj(next?.soccerMatches);
    for (const id of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[id], nextObj[id])) {
        writes[`soccerMatches/${id}`] = nextObj[id] === undefined ? null : nextObj[id];
      }
    }
  }

  // gks
  {
    const prevObj = prev?.gks || {};
    const nextObj = next?.gks || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`gks/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  // gksHistory (이중 객체 — round 단위로 diff)
  {
    const prevObj = prev?.gksHistory || {};
    const nextObj = next?.gksHistory || {};
    for (const round of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[round], nextObj[round])) {
        writes[`gksHistory/${round}`] = nextObj[round] === undefined ? null : nextObj[round];
      }
    }
  }

  // liveMercs
  {
    const prevObj = prev?.liveMercs || {};
    const nextObj = next?.liveMercs || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`liveMercs/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  // absentees — matchId 단위 diff (값 자체는 { teamIdx: [name] } 객체)
  {
    const prevObj = prev?.absentees || {};
    const nextObj = next?.absentees || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`absentees/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  // confirmedRounds
  {
    const prevObj = prev?.confirmedRounds || {};
    const nextObj = next?.confirmedRounds || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`confirmedRounds/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  return writes;
}

// RTDB는 빈 배열을 저장하지 않고, 희소 배열/중첩 배열은 객체로 변환됨.
// schedule[i].matches[j] = [homeIdx, awayIdx] 같은 깊은 중첩 구조에서
// 두 번째 매치가 trailing null로 인식돼 누락되거나 객체로 역직렬화되는 케이스 복구.
//
// 추가로 confirmedMatches에 라운드별 R{n}_C{ci} 매치가 남아있으면
// 그 정보로 누락된 round.matches 슬롯 보강.
export function normalizeSchedule(raw, completedMatches) {
  const objToArray = (v) => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const arr = [];
      for (const k of Object.keys(v)) {
        const i = +k;
        if (Number.isInteger(i) && i >= 0) arr[i] = v[k];
      }
      return arr;
    }
    return [];
  };
  const rounds = objToArray(raw);
  const completedByRound = {};
  for (const m of (completedMatches || [])) {
    const id = m?.matchId;
    const match = id ? id.match(/^R(\d+)_C(\d+)$/) : null;
    if (!match) continue;
    const ri = +match[1] - 1;
    const ci = +match[2];
    if (!completedByRound[ri]) completedByRound[ri] = {};
    completedByRound[ri][ci] = [m.homeIdx, m.awayIdx];
  }
  return rounds.map((round, ri) => {
    if (!round || typeof round !== 'object') return { matches: [] };
    let matches = objToArray(round.matches).map(p => {
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object') return objToArray(p);
      return p;
    });
    // completedMatches에 라운드 ri의 매치가 더 있으면 매치 슬롯 보강
    const completed = completedByRound[ri];
    if (completed) {
      for (const ciStr of Object.keys(completed)) {
        const ci = +ciStr;
        if (!matches[ci] || !Array.isArray(matches[ci]) || matches[ci].length !== 2) {
          matches[ci] = completed[ci];
        }
      }
    }
    // 희소 → 밀집(빈 슬롯은 제거)
    matches = matches.filter(m => Array.isArray(m) && m.length === 2);
    return { ...round, matches };
  });
}

// RTDB는 빈 배열을 저장하지 않고, 희소 배열은 객체로 변환됨.
// 0~teamCount-1 인덱스를 가진 배열로 정규화 + 길이를 teamCount로 패딩.
function normalizeTeamArray(raw, teamCount, fill) {
  let arr;
  if (Array.isArray(raw)) {
    arr = [...raw];
  } else if (raw && typeof raw === 'object') {
    arr = [];
    for (const k of Object.keys(raw)) {
      const i = +k;
      if (Number.isInteger(i) && i >= 0) arr[i] = raw[k];
    }
  } else {
    arr = [];
  }
  while (arr.length < teamCount) arr.push(typeof fill === 'function' ? fill(arr.length) : fill);
  for (let i = 0; i < teamCount; i++) if (arr[i] == null) arr[i] = typeof fill === 'function' ? fill(i) : fill;
  return arr;
}

// RTDB 노드 트리 → gameState 객체 재조립.
export function reconstructState(gameId, raw) {
  if (!raw) return null;
  const meta = raw.meta || {};
  const events = raw.events ? Object.values(raw.events) : [];
  events.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
  const matches = raw.matches ? Object.values(raw.matches) : [];
  const soccerMatches = raw.soccerMatches
    ? Object.values(raw.soccerMatches).sort((a, b) => (a?.matchIdx || 0) - (b?.matchIdx || 0))
    : [];
  const teamCount = meta.teamCount ?? 4;
  return {
    gameId,
    gameCreator: meta.gameCreator || '',
    phase: meta.phase || '',
    currentRoundIdx: meta.currentRoundIdx ?? 0,
    teamCount,
    courtCount: meta.courtCount ?? 2,
    matchMode: meta.matchMode || 'schedule',
    isExtraRound: meta.isExtraRound ?? false,
    splitPhase: meta.splitPhase ?? null,
    rotations: meta.rotations ?? 2,
    earlyFinish: meta.earlyFinish ?? false,
    gameFinalized: meta.gameFinalized ?? false,
    lastEditor: meta.lastEditor || '',
    currentMatchIdx: meta.currentMatchIdx ?? -1,
    draftMode: meta.draftMode || 'snake',
    teams: normalizeTeamArray(raw.teams, teamCount, () => []),
    teamNames: normalizeTeamArray(raw.teamNames, teamCount, (i) => `팀${i + 1}`),
    teamColorIndices: normalizeTeamArray(raw.teamColorIndices, teamCount, (i) => i),
    schedule: normalizeSchedule(raw.schedule, matches),
    attendees: raw.attendees || [],
    opponents: raw.opponents || [],
    pushState: raw.pushState ?? null,
    settingsSnapshot: raw.settingsSnapshot ?? null,
    soccerFormation: raw.soccerFormation ?? null,
    gks: raw.gks || {},
    gksHistory: raw.gksHistory || {},
    liveMercs: raw.liveMercs || {},
    absentees: raw.absentees || {},
    confirmedRounds: raw.confirmedRounds || {},
    allEvents: events,
    completedMatches: matches,
    soccerMatches,
  };
}

// state → RTDB 노드 구조 펼침. set() 으로 통짜 저장할 때 사용.
// updatedAt 는 호출자가 직접 첨부 (serverTimestamp 사용 위해).
export function expandStateForRtdb(state) {
  const meta = {};
  for (const f of META_FIELDS) {
    if (state[f] !== undefined) meta[f] = state[f];
  }
  const out = { meta };
  for (const f of WHOLE_REPLACE_FIELDS) {
    if (state[f] !== undefined && state[f] !== null) out[f] = state[f];
  }
  if (state.gks) out.gks = state.gks;
  if (state.gksHistory) out.gksHistory = state.gksHistory;
  if (state.liveMercs) out.liveMercs = state.liveMercs;
  if (state.absentees) out.absentees = state.absentees;
  if (state.confirmedRounds) out.confirmedRounds = state.confirmedRounds;
  if (state.allEvents) out.events = eventsToObj(state.allEvents);
  if (state.completedMatches) out.matches = matchesToObj(state.completedMatches);
  if (state.soccerMatches) out.soccerMatches = soccerMatchesToObj(state.soccerMatches);
  return out;
}

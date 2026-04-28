// 시트 rows → GameRecord[] 변환.
// 출력 스키마는 gameStateAnalyzer.parseGameHistory()와 동일 (calc* 함수 재사용 위함).

function safeParseArray(str) {
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function denormalizeEventType(standardType) {
  if (standardType === 'owngoal') return 'ownGoal';
  return standardType;
}

export function buildGameRecordsFromLogs(matchRows, eventRows) {
  if (!Array.isArray(matchRows) || matchRows.length === 0) return [];

  const byGame = new Map();
  for (const m of matchRows) {
    const gid = m.game_id || `_legacy_${m.date}_${m.our_team_name}`;
    if (!byGame.has(gid)) byGame.set(gid, []);
    byGame.get(gid).push(m);
  }

  const eventsByGameMatch = new Map();
  const eventsByLegacyKey = new Map();
  for (const e of eventRows || []) {
    if (e.game_id) {
      const k = `${e.game_id}|${e.match_id}`;
      if (!eventsByGameMatch.has(k)) eventsByGameMatch.set(k, []);
      eventsByGameMatch.get(k).push(e);
    } else {
      const k = `${e.date}|${e.match_id}|${e.our_team}`;
      if (!eventsByLegacyKey.has(k)) eventsByLegacyKey.set(k, []);
      eventsByLegacyKey.get(k).push(e);
    }
  }

  const records = [];
  for (const [, mRows] of byGame) {
    mRows.sort((a, b) => (a.match_idx || 0) - (b.match_idx || 0));
    const gameDate = mRows[0].date;
    const teamIdx = new Map();
    const teams = [];
    const teamNames = [];
    function ensureTeam(name, members) {
      if (!teamIdx.has(name)) {
        teamIdx.set(name, teams.length);
        teams.push(members);
        teamNames.push(name);
      }
      return teamIdx.get(name);
    }
    const matches = [];
    const events = [];
    for (const m of mRows) {
      const homeMembers = safeParseArray(m.our_members_json);
      const awayMembers = safeParseArray(m.opponent_members_json);
      const homeIdx = ensureTeam(m.our_team_name, homeMembers);
      const awayIdx = ensureTeam(m.opponent_team_name, awayMembers);
      matches.push({
        matchId: m.match_id,
        homeIdx, awayIdx,
        homeTeam: m.our_team_name, awayTeam: m.opponent_team_name,
        homeScore: Number(m.our_score) || 0,
        awayScore: Number(m.opponent_score) || 0,
        homeGk: m.our_gk || '',
        awayGk: m.opponent_gk || '',
        isExtra: !!m.is_extra,
      });
      const byGid = eventsByGameMatch.get(`${m.game_id}|${m.match_id}`) || [];
      const byLegacy = eventsByLegacyKey.get(`${m.date}|${m.match_id}|${m.our_team_name}`) || [];
      const merged = [...byGid, ...byLegacy];
      for (const e of merged) {
        events.push({
          type: denormalizeEventType(e.event_type),
          matchId: m.match_id,
          player: e.player,
          assist: e.related_player || '',
          timestamp: e.input_time || '',
          scoringTeam: undefined,
          concedingTeam: undefined,
        });
        // 신규 스키마: goal/owngoal 행에 concede_gk 가 포함되면 별도 concede 항목 합성
        if ((e.event_type === 'goal' || e.event_type === 'owngoal') && e.concede_gk) {
          events.push({
            type: 'concede',
            matchId: m.match_id,
            player: e.concede_gk,
            assist: '',
            timestamp: e.input_time || '',
            scoringTeam: undefined,
            concedingTeam: undefined,
          });
        }
      }
    }
    records.push({ gameDate, teams, teamNames, attendees: [], matches, events });
  }
  return records;
}

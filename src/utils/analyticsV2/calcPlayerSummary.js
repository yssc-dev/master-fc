// PersonalAnalysisTab의 6개 카드 숫자(rounds/keeperRounds/fieldRounds/matches/conceded/winRate)를
// 단일 소스(matchLogs + eventLogs + playerGameLogs)에서 일관되게 계산.
//
// 데이터 소스 정책:
// - rounds/matches/wins/draws/losses: matchLogs (members_json + score)
// - goals/assists/ownGoals: eventLogs
// - keeperRounds/conceded(GK 실점): playerGameLogs(PG) 우선, 없으면 matchLogs.our_gk fallback
//   * 이유: 2026-04-23 이전 matchLogs.our_gk가 거의 비어 있음 (legacy 데이터 누락).
//     PG가 keeper 정보의 권위 소스. 향후 matchLogs.our_gk가 항상 채워지면 PG 의존 제거 가능.
// - fieldRounds = rounds - keeperRounds (음수 방지)
// - fieldConceded = (출전 매치의 자기팀 실점 합) - conceded(GK)
// - is_extra=true 매치는 모든 카운트에서 제외

// ★ 휴식 매치는 본인이 안 뛴 매치이므로 모든 카운트(rounds/matches/wins...)에서 제외
//   our_members_json이 배열/객체 두 형식 모두 수용, actual(출전자)만 반영
import { parseActualPlayers } from './parseMembers';

function safeParseArray(s) {
  return parseActualPlayers(s);
}

export function calcPlayerSummary({ matchLogs = [], eventLogs = [], playerGameLogs = [] } = {}) {
  // 1) matchLogs 패스: rounds/wins/teamConceded/날짜별 출전 카운트
  const perPlayer = {};
  const sessionDates = new Set();
  const ensure = (name) => {
    if (!perPlayer[name]) {
      perPlayer[name] = {
        rounds: 0, keeperRounds: 0, fieldRounds: 0,
        games: 0,
        goals: 0, assists: 0, ownGoals: 0, fouls: 0,
        conceded: 0, fieldConceded: 0, avgConceded: 0,
        matches: 0, wins: 0, draws: 0, losses: 0, winRate: 0,
        _teamConceded: 0,        // 출전 매치의 자기팀 총 실점 (fieldConceded 계산용)
        _mtKeeperRounds: 0,      // matchLogs.our_gk 기반 fallback
        _mtConceded: 0,
        _attendedDates: new Set(), // PG 합산 시 출전 날짜만 인정
        _roundsByDate: {},       // PG keeperRounds 캡 계산용
      };
    }
    return perPlayer[name];
  };

  for (const m of matchLogs) {
    if (m.is_extra) continue;
    sessionDates.add(m.date || '');
    const home = safeParseArray(m.our_members_json);
    const away = safeParseArray(m.opponent_members_json);
    const ourScore = Number(m.our_score) || 0;
    const oppScore = Number(m.opponent_score) || 0;
    const ourGk = m.our_gk || '';
    const oppGk = m.opponent_gk || '';
    const ourWin = ourScore > oppScore;
    const draw = ourScore === oppScore;
    const date = m.date || '';

    const seen = new Set();
    const credit = (name, side) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const s = ensure(name);
      s.rounds++;
      s.matches++;
      s._attendedDates.add(date);
      s._roundsByDate[date] = (s._roundsByDate[date] || 0) + 1;
      const teamConceded = side === 'our' ? oppScore : ourScore;
      s._teamConceded += teamConceded;
      const isGk = (side === 'our' && name === ourGk) || (side === 'opp' && name === oppGk);
      if (isGk) {
        s._mtKeeperRounds++;
        s._mtConceded += teamConceded;
      }
      const won = side === 'our' ? ourWin : (!ourWin && !draw);
      if (draw) s.draws++;
      else if (won) s.wins++;
      else s.losses++;
    };
    home.forEach(n => credit(n, 'our'));
    away.forEach(n => credit(n, 'opp'));
  }

  // 2) eventLogs 패스: goals/assists/ownGoals/fouls
  for (const e of eventLogs) {
    if (e.event_type === 'goal') {
      if (e.player) ensure(e.player).goals++;
      if (e.related_player) ensure(e.related_player).assists++;
    } else if (e.event_type === 'owngoal') {
      if (e.player) ensure(e.player).ownGoals++;
    } else if (e.event_type === 'foul') {
      if (e.player) ensure(e.player).fouls++;
    }
  }

  // 3) PG 패스: keeper 권위 데이터로 덮어쓰기 (해당 선수의 출전 날짜만 인정, rounds 캡)
  const pgByPlayer = {};
  for (const p of playerGameLogs) {
    const name = p.player;
    if (!name) continue;
    if (!pgByPlayer[name]) pgByPlayer[name] = [];
    pgByPlayer[name].push(p);
  }

  for (const name of Object.keys(perPlayer)) {
    const s = perPlayer[name];
    const pgRows = pgByPlayer[name];
    let keeperRounds = 0, conceded = 0, usedPg = false;
    if (pgRows && pgRows.length > 0) {
      usedPg = true;
      for (const p of pgRows) {
        if (!s._attendedDates.has(p.date)) continue; // 출전 안 한 날짜는 무시
        keeperRounds += Number(p.keeper_games || p.keeperGames) || 0;
        conceded += Number(p.conceded) || 0;
      }
    } else {
      keeperRounds = s._mtKeeperRounds;
      conceded = s._mtConceded;
    }
    s.keeperRounds = keeperRounds;
    s.conceded = conceded;
    s.fieldRounds = Math.max(0, s.rounds - keeperRounds);
    s.fieldConceded = Math.max(0, s._teamConceded - conceded);
    s.avgConceded = s.fieldRounds > 0 ? s.fieldConceded / s.fieldRounds : 0;
    s.winRate = s.matches > 0 ? (s.wins + s.draws * 0.5) / s.matches : 0;
    s.games = s._attendedDates.size;
    // 내부 필드 정리
    delete s._teamConceded; delete s._mtKeeperRounds; delete s._mtConceded;
    delete s._attendedDates; delete s._roundsByDate;
    void usedPg;
  }

  let maxRounds = 0;
  for (const name of Object.keys(perPlayer)) {
    if (perPlayer[name].rounds > maxRounds) maxRounds = perPlayer[name].rounds;
  }

  return { perPlayer, maxRounds, totalSessions: sessionDates.size };
}

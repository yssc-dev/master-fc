// 다크호스 랭킹 — 용병으로 출전했을 때의 성과(승률/기여도/실점)와 본팀 대비 향상도(Δ).
//
// 용병 감지(스키마 변경 없음): 로그_선수경기의 session_team(그 세션 최초 소속팀)과
// 로그_매치의 our_team_name/opponent_team_name을 비교. 자기 소속팀이 아닌 팀 이름으로
// 명단에 든 경기 = 용병 출전, 같으면 본팀 출전.
// session_team이 비어있는(""=어느 팀에도 없는 순수 게스트) 선수는 비교 기준선이 없어 제외.
//
// 정렬: 용병 승률 내림차순 → 용병 기여도 → 한글 이름. 향상도(Δ)는 표시용(정렬 미반영).
import { parseActualPlayers } from './parseMembers';

export function calcDarkhorse({ matchLogs, playerGameLogs, eventLogs, minMercGames = 4, topN = 5 }) {
  // 1) 본팀 룩업: `${date}|${player}` → session_team (빈 값은 등록 안 함)
  const baseTeam = new Map();
  for (const p of playerGameLogs || []) {
    const st = (p.session_team || '').trim();
    if (!p.player || !st) continue;
    baseTeam.set(`${p.date || ''}|${p.player}`, st);
  }

  // 누적 버킷: acc[player] = { merc, own } 각각 {games,wins,draws,conceded,ga}
  const acc = {};
  const ensure = (name) => {
    if (!acc[name]) {
      acc[name] = {
        merc: { games: 0, wins: 0, draws: 0, conceded: 0, ga: 0 },
        own: { games: 0, wins: 0, draws: 0, conceded: 0, ga: 0 },
      };
    }
    return acc[name];
  };

  // 이벤트 귀속용: `${match_id}|${player}` → 'merc' | 'own'
  const flagByMatchPlayer = new Map();

  // 2) 매치 패스
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const date = m.date || '';
    const mid = m.match_id || '';
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const seen = new Set();
    const side = (members, teamName, teamScore, concededScore, won, draw) => {
      for (const name of members) {
        if (seen.has(name)) continue;
        seen.add(name);
        const base = baseTeam.get(`${date}|${name}`);
        if (!base) continue; // 게스트(소속 없음) 제외
        const bucket = base === teamName ? 'own' : 'merc';
        const b = ensure(name)[bucket];
        b.games++;
        if (draw) b.draws++;
        else if (won) b.wins++;
        b.conceded += concededScore;
        if (mid) flagByMatchPlayer.set(`${mid}|${name}`, bucket);
      }
    };
    side(parseActualPlayers(m.our_members_json), m.our_team_name || '', our, opp, our > opp, our === opp);
    side(parseActualPlayers(m.opponent_members_json), m.opponent_team_name || '', opp, our, opp > our, our === opp);
  }

  // 3) 이벤트 패스 — 골/어시를 해당 경기의 버킷(용병/본팀)에 귀속
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const mid = e.match_id || '';
    const credit = (name) => {
      if (!name) return;
      const bucket = flagByMatchPlayer.get(`${mid}|${name}`);
      if (bucket) acc[name][bucket].ga++;
    };
    credit(e.player);
    credit(e.related_player);
  }

  // 4) 행 생성
  const winRate = (b) => (b.wins + 0.5 * b.draws) / b.games;
  const ranking = [];
  for (const [player, v] of Object.entries(acc)) {
    if (v.merc.games < minMercGames) continue;
    const hasOwn = v.own.games > 0;
    const mercWinRate = winRate(v.merc);
    const mercContrib = v.merc.ga / v.merc.games;
    const mercConceded = v.merc.conceded / v.merc.games;
    const ownWinRate = hasOwn ? winRate(v.own) : null;
    const ownContrib = hasOwn ? v.own.ga / v.own.games : null;
    const ownConceded = hasOwn ? v.own.conceded / v.own.games : null;
    ranking.push({
      player,
      mercGames: v.merc.games, mercWinRate, mercContrib, mercConceded,
      ownGames: v.own.games, ownWinRate, ownContrib, ownConceded,
      dWin: hasOwn ? mercWinRate - ownWinRate : null,
      dContrib: hasOwn ? mercContrib - ownContrib : null,
      dConceded: hasOwn ? mercConceded - ownConceded : null,
    });
  }

  // 5) 정렬: 용병 승률 → 기여도 → 이름
  ranking.sort((a, b) =>
    b.mercWinRate - a.mercWinRate ||
    b.mercContrib - a.mercContrib ||
    a.player.localeCompare(b.player, 'ko')
  );

  return { ranking: ranking.slice(0, topN) };
}

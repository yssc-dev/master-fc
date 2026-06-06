// 다크호스 랭킹 — 용병으로 출전했을 때의 성과(승률/기여도/실점)와 "빌린 팀 기여도(Δ)".
//
// 용병 감지(스키마 변경 없음): 로그_선수경기의 session_team(그 세션 최초 소속팀)과
// 로그_매치의 our_team_name/opponent_team_name을 비교. 자기 소속팀이 아닌 팀 이름으로
// 명단에 든 경기 = 용병 출전, 같으면 본팀 출전.
// session_team이 비어있는(""=어느 팀에도 없는 순수 게스트) 선수는 비교 기준선이 없어 제외.
//
// Δ(팀 중심): "용병 P를 빌린 팀이 P 있을 때 vs P 없을 때" 성과 차이.
//   merc     = P가 용병으로 든 매치들 (= 빌린 팀이 P 있을 때)
//   baseline = P를 빌린 (date, 팀) 쌍에서 P가 빠진 매치들 (= 같은 팀이 P 없을 때)
// 풋살은 라운드(매치)별로 멤버가 다르게 기록되므로, 같은 세션 안에서도 빌린 팀의
// P-부재 매치가 존재한다(= baseline 계산 가능). dWin/dConceded = merc − baseline.
// G+A는 용병 출전 시 P 개인 기여도만 표시(팀 Δ 없음).
//
// 정렬: 용병 승률 내림차순 → 용병 기여도 → 한글 이름. Δ는 표시용(정렬 미반영).
import { parseActualPlayers } from './parseMembers';

export function calcDarkhorse({ matchLogs, playerGameLogs, eventLogs, minMercGames = 4, topN = 5 }) {
  // 1) 본팀 룩업: `${date}|${player}` → session_team (빈 값은 등록 안 함)
  const baseTeam = new Map();
  for (const p of playerGameLogs || []) {
    const st = (p.session_team || '').trim();
    if (!p.player || !st) continue;
    baseTeam.set(`${p.date || ''}|${p.player}`, st);
  }

  // 2) G+A 룩업: `${match_id}|${player}` → 골+어시 수 (골 이벤트만, dedupe 금지)
  const gaByMatchPlayer = new Map();
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const mid = e.match_id || '';
    const bump = (name) => {
      if (!name) return;
      const k = `${mid}|${name}`;
      gaByMatchPlayer.set(k, (gaByMatchPlayer.get(k) || 0) + 1);
    };
    bump(e.player);
    bump(e.related_player);
  }

  // 3) (date, 팀) 게임 인덱스: 같은 팀이 그 날 치른 매치들 — 멤버 스냅샷/결과/실점
  // teamGames: Map<date, Map<teamName, [{members:Set, won, draw, conceded, mid}]>>
  const teamGames = new Map();
  const addTeamGame = (date, teamName, members, won, draw, conceded, mid) => {
    if (!teamName) return;
    if (!teamGames.has(date)) teamGames.set(date, new Map());
    const byTeam = teamGames.get(date);
    if (!byTeam.has(teamName)) byTeam.set(teamName, []);
    byTeam.get(teamName).push({ members: new Set(members), won, draw, conceded, mid });
  };
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const date = m.date || '';
    const mid = m.match_id || '';
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    addTeamGame(date, m.our_team_name || '', parseActualPlayers(m.our_members_json), our > opp, our === opp, opp, mid);
    addTeamGame(date, m.opponent_team_name || '', parseActualPlayers(m.opponent_members_json), opp > our, our === opp, our, mid);
  }

  // 4) 선수별 집계: acc[player] = { merc, base }
  //    merc = 용병 출전 매치(승/무/실점/GA), base = 빌린 팀이 P 없이 뛴 매치(승/무/실점)
  const acc = {};
  const ensure = (name) => {
    if (!acc[name]) {
      acc[name] = {
        merc: { games: 0, wins: 0, draws: 0, conceded: 0, ga: 0 },
        base: { games: 0, wins: 0, draws: 0, conceded: 0 },
      };
    }
    return acc[name];
  };

  for (const [date, byTeam] of teamGames) {
    for (const [teamName, games] of byTeam) {
      // 이 (date, 팀)에서 용병으로 든 선수들 = 멤버 중 본팀(session_team)이 이 팀이 아닌 자
      const mercHere = new Set();
      for (const g of games) {
        for (const name of g.members) {
          const base = baseTeam.get(`${date}|${name}`);
          if (base && base !== teamName) mercHere.add(name);
        }
      }
      if (mercHere.size === 0) continue;
      // 각 용병 P에 대해: 이 팀 매치 중 P 있으면 merc, 없으면 baseline
      for (const P of mercHere) {
        const b = ensure(P);
        for (const g of games) {
          if (g.members.has(P)) {
            b.merc.games++;
            if (g.draw) b.merc.draws++;
            else if (g.won) b.merc.wins++;
            b.merc.conceded += g.conceded;
            b.merc.ga += gaByMatchPlayer.get(`${g.mid}|${P}`) || 0;
          } else {
            b.base.games++;
            if (g.draw) b.base.draws++;
            else if (g.won) b.base.wins++;
            b.base.conceded += g.conceded;
          }
        }
      }
    }
  }

  // 5) 행 생성
  const winRate = (x) => (x.wins + 0.5 * x.draws) / x.games;
  const ranking = [];
  for (const [player, v] of Object.entries(acc)) {
    if (v.merc.games < minMercGames) continue;
    const hasBase = v.base.games > 0;
    const mercWinRate = winRate(v.merc);
    const mercContrib = v.merc.ga / v.merc.games;
    const mercConceded = v.merc.conceded / v.merc.games;
    const baselineWinRate = hasBase ? winRate(v.base) : null;
    const baselineConceded = hasBase ? v.base.conceded / v.base.games : null;
    ranking.push({
      player,
      mercGames: v.merc.games, mercWinRate, mercContrib, mercConceded,
      baselineGames: v.base.games, baselineWinRate, baselineConceded,
      dWin: hasBase ? mercWinRate - baselineWinRate : null,
      dConceded: hasBase ? mercConceded - baselineConceded : null,
    });
  }

  // 6) 정렬: 용병 승률 → 기여도 → 이름
  ranking.sort((a, b) =>
    b.mercWinRate - a.mercWinRate ||
    b.mercContrib - a.mercContrib ||
    a.player.localeCompare(b.player, 'ko')
  );

  return { ranking: ranking.slice(0, topN) };
}

import { describe, it, expect } from 'vitest';
import { calcDarkhorse } from './calcDarkhorse';

// 헬퍼: 로그_매치 한 행
const match = (date, matchId, ourName, ourMembers, oppName, oppMembers, ourScore, oppScore, extra = {}) => ({
  date, match_id: matchId,
  our_team_name: ourName, opponent_team_name: oppName,
  our_members_json: JSON.stringify(ourMembers),
  opponent_members_json: JSON.stringify(oppMembers),
  our_score: ourScore, opponent_score: oppScore,
  ...extra,
});
// PG: 선수 세션 소속팀
const pg = (date, player, sessionTeam) => ({ date, player, session_team: sessionTeam });
// 골 이벤트
const goal = (matchId, scorer, assist = '') => ({ match_id: matchId, event_type: 'goal', player: scorer, related_player: assist });

describe('calcDarkhorse — 용병/본팀 분리', () => {
  it('session_team≠경기팀명 이면 용병, 같으면 본팀으로 집계한다', () => {
    // A는 팀1 소속. m1에선 팀1으로(본팀, 승), m2에선 팀2로(용병, 패)
    const matchLogs = [
      match('2026-06-01', 'M1', '팀1', ['A'], '팀2', ['B'], 3, 1),
      match('2026-06-01', 'M2', '팀2', ['A'], '팀3', ['C'], 0, 2),
    ];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const a = r.ranking.find(x => x.player === 'A');
    expect(a.mercGames).toBe(1);
    expect(a.mercWinRate).toBe(0);   // 용병 1경기 패
    expect(a.ownGames).toBe(1);
    expect(a.ownWinRate).toBe(1);    // 본팀 1경기 승
    expect(a.dWin).toBe(-1);         // 용병 - 본팀
  });

  it('opponent 측에 든 용병도 잡힌다 (양 팀 처리)', () => {
    // B는 팀9 소속인데 opponent_members(팀2)로 출전 → 용병. 팀2가 이김(opp_score>our_score)
    const matchLogs = [match('2026-06-01', 'M1', '팀1', ['A'], '팀2', ['B'], 1, 4)];
    const playerGameLogs = [pg('2026-06-01', 'B', '팀9')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const b = r.ranking.find(x => x.player === 'B');
    expect(b.mercGames).toBe(1);
    expect(b.mercWinRate).toBe(1);   // 용병으로 든 팀2가 승
    expect(b.mercConceded).toBe(1);  // 팀2 실점 = our_score(1)
  });

  it('G+A는 용병/본팀 경기별로 귀속된다', () => {
    const matchLogs = [
      match('2026-06-01', 'M1', '팀1', ['A'], '팀2', ['B'], 1, 0), // A 본팀
      match('2026-06-01', 'M2', '팀2', ['A'], '팀3', ['C'], 2, 0), // A 용병
    ];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1')];
    const eventLogs = [
      goal('M1', 'A'),          // 본팀 골
      goal('M2', 'A', 'C'),     // 용병 골 + (C 어시지만 C는 PG없어 제외)
      goal('M2', 'C', 'A'),     // 용병 경기에서 A 어시
    ];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs, minMercGames: 1 });
    const a = r.ranking.find(x => x.player === 'A');
    expect(a.mercContrib).toBe(2);   // 용병 1경기: 골1 + 어시1 = 2 / 1경기
    expect(a.ownContrib).toBe(1);    // 본팀 1경기: 골1 / 1경기
    expect(a.dContrib).toBe(1);
  });

  it('minMercGames 미달 선수는 랭킹에서 제외', () => {
    const matchLogs = [match('2026-06-01', 'M1', '팀2', ['A'], '팀3', ['B'], 1, 0)];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1')]; // 용병 1경기뿐
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 4 });
    expect(r.ranking.find(x => x.player === 'A')).toBeUndefined();
  });

  it('session_team이 비면(순수 게스트) 집계에서 제외', () => {
    const matchLogs = [match('2026-06-01', 'M1', '팀1', ['게스트'], '팀2', ['B'], 1, 0)];
    const playerGameLogs = [pg('2026-06-01', '게스트', '')]; // 소속 없음
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    expect(r.ranking.find(x => x.player === '게스트')).toBeUndefined();
  });

  it('is_extra 매치는 제외', () => {
    const matchLogs = [
      match('2026-06-01', 'M1', '팀2', ['A'], '팀3', ['B'], 2, 0),
      match('2026-06-01', 'M2', '팀2', ['A'], '팀3', ['B'], 0, 5, { is_extra: true }),
    ];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const a = r.ranking.find(x => x.player === 'A');
    expect(a.mercGames).toBe(1); // 추가경기 제외 → 1경기
    expect(a.mercWinRate).toBe(1);
  });

  it('용병 승률 내림차순 정렬, 동률이면 기여도', () => {
    const matchLogs = [
      // A: 용병 2경기 1승1패 (50%)
      match('2026-06-01', 'A1', '팀2', ['A'], '팀3', ['x'], 1, 0),
      match('2026-06-01', 'A2', '팀2', ['A'], '팀3', ['x'], 0, 1),
      // B: 용병 2경기 2승 (100%)
      match('2026-06-01', 'B1', '팀2', ['B'], '팀3', ['x'], 1, 0),
      match('2026-06-01', 'B2', '팀2', ['B'], '팀3', ['x'], 2, 0),
    ];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1'), pg('2026-06-01', 'B', '팀9')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 2 });
    expect(r.ranking.map(x => x.player)).toEqual(['B', 'A']);
  });
});

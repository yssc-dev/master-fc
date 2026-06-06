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

// 팀 중심 다크호스: Δ = "용병 P가 든 팀이 P 있을 때 vs P 없을 때" 성과 차이.
// baseline = P를 빌린 (date, 팀)에서 P가 빠진 매치들 (= P의 한계 기여).
describe('calcDarkhorse — 팀 중심 Δ (용병의 팀 기여도)', () => {
  it('Δ승률: 빌린 팀이 P 있을 때 vs P 없을 때 (같은 세션, 라운드별 멤버)', () => {
    // P는 팀9 소속인데 팀1에 차출(용병). 같은 세션 팀1은 P 있는 매치/없는 매치를 둘 다 가짐
    const matchLogs = [
      match('2026-06-01', 'M1', '팀1', ['P', 'a'], '팀2', ['b'], 3, 1), // P 있음 → 팀1 승, 실점1
      match('2026-06-01', 'M2', '팀1', ['a', 'c'], '팀3', ['d'], 0, 2), // P 없음 → 팀1 패, 실점2
    ];
    const playerGameLogs = [pg('2026-06-01', 'P', '팀9')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const p = r.ranking.find(x => x.player === 'P');
    expect(p.mercGames).toBe(1);
    expect(p.mercWinRate).toBe(1);        // P 있을 때 팀1 승률
    expect(p.mercConceded).toBe(1);       // P 있을 때 팀1 실점
    expect(p.baselineGames).toBe(1);
    expect(p.baselineWinRate).toBe(0);    // P 없을 때 팀1 승률
    expect(p.baselineConceded).toBe(2);   // P 없을 때 팀1 실점
    expect(p.dWin).toBe(1);               // +100%p (P가 있으면 더 이김)
    expect(p.dConceded).toBe(-1);         // 실점 1 감소 (P가 있으면 덜 먹음)
  });

  it('opponent 측에 차출된 용병도 잡히고, 그 팀의 P 없는 매치가 baseline', () => {
    // B는 팀9 소속, 팀2(opponent)로 차출. 같은 세션 팀2는 B 없는 매치도 있음
    const matchLogs = [
      match('2026-06-01', 'M1', '팀1', ['A'], '팀2', ['B'], 1, 4), // B 있음 → 팀2 승(opp4>our1), 팀2 실점1
      match('2026-06-01', 'M2', '팀2', ['c'], '팀3', ['x'], 0, 1), // B 없음 → 팀2 패, 팀2 실점1
    ];
    const playerGameLogs = [pg('2026-06-01', 'B', '팀9')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const b = r.ranking.find(x => x.player === 'B');
    expect(b.mercGames).toBe(1);
    expect(b.mercWinRate).toBe(1);
    expect(b.baselineGames).toBe(1);
    expect(b.baselineWinRate).toBe(0);
    expect(b.dWin).toBe(1);
  });

  it('P의 본팀이 P 없이 뛴 경기는 baseline에서 제외 (빌린 팀만 baseline)', () => {
    // P 본팀=팀1. 팀2로만 용병 출전. 팀2에는 P 없는 매치가 없고, 팀1(본팀)이 P 없이 뛴 매치만 있음 → baseline 0
    const matchLogs = [
      match('2026-06-01', 'M1', '팀2', ['P'], '팀3', ['x'], 1, 0), // P 용병(팀2) 승
      match('2026-06-01', 'M2', '팀1', ['y'], '팀3', ['x'], 1, 0), // 팀1(본팀)이 P 없이 — baseline 아님
    ];
    const playerGameLogs = [pg('2026-06-01', 'P', '팀1')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const p = r.ranking.find(x => x.player === 'P');
    expect(p.mercGames).toBe(1);
    expect(p.baselineGames).toBe(0);     // 본팀 P-부재 매치는 안 셈
    expect(p.baselineWinRate).toBeNull();
    expect(p.dWin).toBeNull();           // baseline 없으면 Δ null
    expect(p.dConceded).toBeNull();
  });

  it('여러 팀에 차출되면 baseline이 빌린 팀들 전체에서 합산된다', () => {
    const matchLogs = [
      match('2026-06-01', 'M1', '팀1', ['P'], '팀3', ['x'], 2, 0), // 용병(팀1) 승
      match('2026-06-01', 'M2', '팀1', ['a'], '팀3', ['x'], 0, 1), // 팀1 P없음 패 (baseline)
      match('2026-06-01', 'M3', '팀2', ['P'], '팀3', ['x'], 0, 1), // 용병(팀2) 패
      match('2026-06-01', 'M4', '팀2', ['b'], '팀3', ['x'], 0, 2), // 팀2 P없음 패 (baseline)
    ];
    const playerGameLogs = [pg('2026-06-01', 'P', '팀9')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const p = r.ranking.find(x => x.player === 'P');
    expect(p.mercGames).toBe(2);          // 팀1+팀2 용병 출전
    expect(p.mercWinRate).toBe(0.5);      // 1승1패
    expect(p.baselineGames).toBe(2);      // 팀1·팀2 각 P-부재 1매치
    expect(p.baselineWinRate).toBe(0);    // 둘 다 패
    expect(p.dWin).toBe(0.5);
  });

  it('G+A는 용병 출전 시 P 개인 기여도만, Δ 없음(dContrib 미존재)', () => {
    const matchLogs = [
      match('2026-06-01', 'M1', '팀1', ['P'], '팀3', ['x'], 1, 0), // 용병
      match('2026-06-01', 'M2', '팀1', ['a'], '팀3', ['x'], 1, 0), // 팀1 P없음(baseline)
    ];
    const playerGameLogs = [pg('2026-06-01', 'P', '팀9')];
    const eventLogs = [
      goal('M1', 'P'),        // P 골
      goal('M1', 'C', 'P'),   // P 어시
    ];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs, minMercGames: 1 });
    const p = r.ranking.find(x => x.player === 'P');
    expect(p.mercContrib).toBe(2);        // 용병 1경기 골1+어시1
    expect(p.dContrib).toBeUndefined();   // G+A는 Δ 제거
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

  it('is_extra 매치는 merc/baseline 양쪽에서 제외', () => {
    const matchLogs = [
      match('2026-06-01', 'M1', '팀2', ['A'], '팀3', ['B'], 2, 0),              // 용병 정규
      match('2026-06-01', 'M2', '팀2', ['A'], '팀3', ['B'], 0, 5, { is_extra: true }), // 추가경기
      match('2026-06-01', 'M3', '팀2', ['c'], '팀3', ['B'], 0, 1, { is_extra: true }), // 추가경기(P없음)
    ];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 1 });
    const a = r.ranking.find(x => x.player === 'A');
    expect(a.mercGames).toBe(1);          // 추가경기 제외
    expect(a.mercWinRate).toBe(1);
    expect(a.baselineGames).toBe(0);      // 추가경기 P-부재도 제외
  });

  it('용병 승률 내림차순 정렬, 동률이면 기여도', () => {
    const matchLogs = [
      // A: 용병 2경기 1승1패 (50%)
      match('2026-06-01', 'A1', '팀2', ['A'], '팀3', ['x'], 1, 0),
      match('2026-06-01', 'A2', '팀2', ['A'], '팀3', ['x'], 0, 1),
      // B: 용병 2경기 2승 (100%)
      match('2026-06-01', 'B1', '팀4', ['B'], '팀3', ['x'], 1, 0),
      match('2026-06-01', 'B2', '팀4', ['B'], '팀3', ['x'], 2, 0),
    ];
    const playerGameLogs = [pg('2026-06-01', 'A', '팀1'), pg('2026-06-01', 'B', '팀9')];
    const r = calcDarkhorse({ matchLogs, playerGameLogs, eventLogs: [], minMercGames: 2 });
    expect(r.ranking.map(x => x.player)).toEqual(['B', 'A']);
  });
});

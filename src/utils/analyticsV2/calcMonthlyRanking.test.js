import { describe, it, expect } from 'vitest';
import { calcMonthlyRanking } from './calcMonthlyRanking';

// 자유대진: 라운드마다 1행, our=홈자리/opponent=어웨이자리 (임의 위치)
const row = (date, ourMembers, oppMembers, ourScore, oppScore, extra = {}) => ({
  date,
  our_members_json: JSON.stringify(ourMembers),
  opponent_members_json: JSON.stringify(oppMembers),
  our_score: ourScore,
  opponent_score: oppScore,
  ...extra,
});

describe('calcMonthlyRanking 승률 — 양 팀 집계', () => {
  it('opponent 측에 배정된 선수도 게임/승패로 카운트된다', () => {
    const matchLogs = [row('2026-06-04', ['A'], ['B'], 3, 1)]; // A 승, B 패
    const r = calcMonthlyRanking({
      yearMonth: '2026-06', playerLogs: [], matchLogs, winRateMinGames: 1,
    });
    const get = (n) => r.winRate.find(x => x.player === n);
    expect(get('A')).toMatchObject({ value: 1, games: 1 });
    expect(get('B')).toMatchObject({ value: 0, games: 1 }); // 이전 버그: B는 아예 누락됐음
  });

  it('같은 팀이었던 두 선수는 홈/어웨이 위치와 무관하게 승률이 같다', () => {
    // 같은 팀(이영문·김종현). 라운드마다 좌우 위치만 뒤바뀜.
    const matchLogs = [
      row('2026-06-04', ['이영문', '김종현'], ['X'], 2, 0), // 홈 자리, 승
      row('2026-06-04', ['Y'], ['이영문', '김종현'], 0, 1), // 어웨이 자리, 승
      row('2026-06-04', ['이영문', '김종현'], ['Z'], 0, 3), // 홈 자리, 패
    ];
    const r = calcMonthlyRanking({
      yearMonth: '2026-06', playerLogs: [], matchLogs, winRateMinGames: 1,
    });
    const lym = r.winRate.find(x => x.player === '이영문');
    const kjh = r.winRate.find(x => x.player === '김종현');
    expect(lym).toMatchObject({ games: 3, value: 2 / 3 });
    // 같은 팀이면 승률·게임수가 반드시 동일 (이전 버그에선 위치 따라 갈렸음)
    expect(kjh.value).toBe(lym.value);
    expect(kjh.games).toBe(lym.games);
  });

  it('is_extra 매치는 승률에서 제외한다', () => {
    const matchLogs = [
      row('2026-06-04', ['A'], ['B'], 3, 1),
      row('2026-06-04', ['A'], ['B'], 0, 3, { is_extra: true }), // 추가경기 → 무시
    ];
    const r = calcMonthlyRanking({
      yearMonth: '2026-06', playerLogs: [], matchLogs, winRateMinGames: 1,
    });
    expect(r.winRate.find(x => x.player === 'A')).toMatchObject({ value: 1, games: 1 });
  });
});

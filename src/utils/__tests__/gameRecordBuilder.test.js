import { describe, it, expect } from 'vitest';
import { buildGameRecordsFromLogs } from '../gameRecordBuilder';

describe('buildGameRecordsFromLogs', () => {
  it('같은 game_id의 매치들을 한 GameRecord로 그룹핑', () => {
    const matchRows = [
      {
        game_id: 'g_1', date: '2026-04-10', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'Team A', opponent_team_name: 'Team B',
        our_members_json: JSON.stringify(['A1','A2','A3','A4','A5']),
        opponent_members_json: JSON.stringify(['B1','B2','B3','B4','B5']),
        our_score: 2, opponent_score: 1,
        our_gk: 'A1', opponent_gk: 'B1',
        is_extra: false,
      },
      {
        game_id: 'g_1', date: '2026-04-10', sport: '풋살', match_idx: 2,
        match_id: 'R2_C0', round_idx: 2, court_id: 0,
        our_team_name: 'Team A', opponent_team_name: 'Team C',
        our_members_json: JSON.stringify(['A1','A2','A3','A4','A5']),
        opponent_members_json: JSON.stringify(['C1','C2','C3','C4','C5']),
        our_score: 0, opponent_score: 0,
        our_gk: 'A1', opponent_gk: 'C1',
        is_extra: false,
      },
    ];
    const eventRows = [
      { game_id: 'g_1', match_id: 'R1_C0', event_type: 'goal', player: 'A2', related_player: 'A3' },
      { game_id: 'g_1', match_id: 'R1_C0', event_type: 'goal', player: 'A4', related_player: '' },
      { game_id: 'g_1', match_id: 'R1_C0', event_type: 'concede', player: 'A1', related_player: '' },
    ];
    const records = buildGameRecordsFromLogs(matchRows, eventRows);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.gameDate).toBe('2026-04-10');
    expect(r.matches).toHaveLength(2);
    expect(r.teamNames).toEqual(['Team A', 'Team B', 'Team C']);
    expect(r.teams[0]).toEqual(['A1','A2','A3','A4','A5']);
    expect(r.teams[1]).toEqual(['B1','B2','B3','B4','B5']);
    expect(r.teams[2]).toEqual(['C1','C2','C3','C4','C5']);
    expect(r.matches[0]).toMatchObject({
      matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
      homeScore: 2, awayScore: 1,
      homeGk: 'A1', awayGk: 'B1',
      isExtra: false,
    });
    expect(r.events).toHaveLength(3);
    expect(r.events[0]).toMatchObject({ type: 'goal', matchId: 'R1_C0', player: 'A2', assist: 'A3' });
  });

  it('레거시 매칭: game_id 없는 이벤트는 (date + match_id + our_team) 조합으로 조인', () => {
    const matchRows = [
      {
        game_id: 'legacy_2026-04-01_masterfc', date: '2026-04-01', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'Team A', opponent_team_name: 'Team B',
        our_members_json: '["A1"]', opponent_members_json: '["B1"]',
        our_score: 1, opponent_score: 0, our_gk: 'A1', opponent_gk: 'B1',
        is_extra: false,
      },
    ];
    const eventRows = [
      { game_id: '', date: '2026-04-01', match_id: 'R1_C0', our_team: 'Team A', event_type: 'goal', player: 'A1' },
    ];
    const records = buildGameRecordsFromLogs(matchRows, eventRows);
    expect(records[0].events).toHaveLength(1);
  });

  it('members_json 파싱 실패 시 빈 배열 fallback', () => {
    const matchRows = [
      {
        game_id: 'g_bad', date: '2026-04-10', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'A', opponent_team_name: 'B',
        our_members_json: 'INVALID_JSON', opponent_members_json: '',
        our_score: 0, opponent_score: 0, our_gk: '', opponent_gk: '',
        is_extra: false,
      },
    ];
    const records = buildGameRecordsFromLogs(matchRows, []);
    expect(records[0].teams[0]).toEqual([]);
    expect(records[0].teams[1]).toEqual([]);
  });

  it('매치가 없으면 빈 배열', () => {
    expect(buildGameRecordsFromLogs([], [])).toEqual([]);
  });

  it('owngoal event_type은 ownGoal로 매핑 (기존 계산 함수 호환)', () => {
    const matchRows = [
      {
        game_id: 'g_x', date: '2026-04-10', sport: '풋살', match_idx: 1,
        match_id: 'R1_C0', round_idx: 1, court_id: 0,
        our_team_name: 'A', opponent_team_name: 'B',
        our_members_json: '[]', opponent_members_json: '[]',
        our_score: 0, opponent_score: 1, our_gk: '', opponent_gk: '',
        is_extra: false,
      },
    ];
    const eventRows = [
      { game_id: 'g_x', match_id: 'R1_C0', event_type: 'owngoal', player: 'A1' },
    ];
    const records = buildGameRecordsFromLogs(matchRows, eventRows);
    expect(records[0].events[0].type).toBe('ownGoal');
  });
});

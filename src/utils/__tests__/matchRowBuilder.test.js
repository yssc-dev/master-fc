import { describe, it, expect } from 'vitest';
import { buildRoundRowsFromFutsal, RAW_MATCH_COLUMNS } from '../matchRowBuilder';

describe('RAW_MATCH_COLUMNS', () => {
  it('필수 컬럼 순서', () => {
    expect(RAW_MATCH_COLUMNS).toEqual([
      'team', 'sport', 'mode', 'tournament_id',
      'date', 'game_id', 'match_idx',
      'round_idx', 'court_id', 'match_id',
      'our_team_name', 'opponent_team_name',
      'our_members_json', 'opponent_members_json',
      'our_score', 'opponent_score',
      'our_gk', 'opponent_gk',
      'formation', 'our_defenders_json',
      'is_extra', 'input_time',
    ]);
  });
});

describe('buildRoundRowsFromFutsal', () => {
  const baseState = {
    gameId: 'g_1713000000000',
    teams: [
      ['김성태', '이준호', '박민', '최영', '홍길동'],
      ['강백호', '서태웅', '정대만', '송태섭', '채치수'],
    ],
    teamNames: ['Team A', 'Team B'],
    completedMatches: [
      {
        matchId: 'R1_C0',
        homeIdx: 0, awayIdx: 1,
        homeTeam: 'Team A', awayTeam: 'Team B',
        homeScore: 3, awayScore: 1,
        homeGk: '김성태', awayGk: '강백호',
        isExtra: false,
      },
    ],
  };

  it('1라운드 → 1 row 반환', () => {
    const rows = buildRoundRowsFromFutsal({
      team: 'masterfc', mode: '기본', date: '2026-04-10',
      stateJSON: baseState, inputTime: '2026-04-10T20:00:00',
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.team).toBe('masterfc');
    expect(r.sport).toBe('풋살');
    expect(r.mode).toBe('기본');
    expect(r.game_id).toBe('g_1713000000000');
    expect(r.date).toBe('2026-04-10');
    expect(r.match_id).toBe('R1_C0');
    expect(r.round_idx).toBe(1);
    expect(r.court_id).toBe(0);
    expect(r.match_idx).toBe(1);
    expect(r.our_team_name).toBe('Team A');
    expect(r.opponent_team_name).toBe('Team B');
    expect(r.our_score).toBe(3);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('김성태');
    expect(r.opponent_gk).toBe('강백호');
    expect(JSON.parse(r.our_members_json)).toEqual(['김성태', '이준호', '박민', '최영', '홍길동']);
    expect(JSON.parse(r.opponent_members_json)).toEqual(['강백호', '서태웅', '정대만', '송태섭', '채치수']);
    expect(r.is_extra).toBe(false);
    expect(r.formation).toBe('');
    expect(JSON.parse(r.our_defenders_json)).toEqual([]);
  });

  it('match_id 파싱으로 round_idx / court_id 추출', () => {
    const state = {
      ...baseState,
      completedMatches: [{ ...baseState.completedMatches[0], matchId: 'R5_C1' }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].round_idx).toBe(5);
    expect(rows[0].court_id).toBe(1);
  });

  it('is_extra 경기도 포함 (is_extra=true)', () => {
    const state = {
      ...baseState,
      completedMatches: [{ ...baseState.completedMatches[0], isExtra: true }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].is_extra).toBe(true);
  });

  it('completedMatches 비어있으면 빈 배열', () => {
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: { ...baseState, completedMatches: [] }, inputTime: '' });
    expect(rows).toEqual([]);
  });

  it('match_idx는 배열 순서대로 1부터', () => {
    const state = {
      ...baseState,
      completedMatches: [
        { ...baseState.completedMatches[0], matchId: 'R1_C0' },
        { ...baseState.completedMatches[0], matchId: 'R2_C0' },
        { ...baseState.completedMatches[0], matchId: 'R3_C0' },
      ],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows.map(r => r.match_idx)).toEqual([1, 2, 3]);
  });
});

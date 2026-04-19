import { describe, it, expect } from 'vitest';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS, buildRawEventsFromFutsal } from '../rawLogBuilders';

describe('raw log column constants', () => {
  it('RAW_EVENT_COLUMNS: 13개, 스펙 순서대로', () => {
    expect(RAW_EVENT_COLUMNS).toHaveLength(13);
    expect(RAW_EVENT_COLUMNS[0]).toBe('team');
    expect(RAW_EVENT_COLUMNS[8]).toBe('event_type');
    expect(RAW_EVENT_COLUMNS[12]).toBe('input_time');
  });

  it('RAW_PLAYER_GAME_COLUMNS: 20개, 풋살 전용 필드 포함', () => {
    expect(RAW_PLAYER_GAME_COLUMNS).toHaveLength(20);
    expect(RAW_PLAYER_GAME_COLUMNS[0]).toBe('team');
    expect(RAW_PLAYER_GAME_COLUMNS[19]).toBe('input_time');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('crova');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('goguma');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('역주행');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('rank_score');
  });
});

describe('buildRawEventsFromFutsal', () => {
  const base = {
    team: '마스터FC',
    events: [{
      gameDate: '2026-04-10', matchId: '1라운드 A구장',
      myTeam: '블루', opponentTeam: '레드',
      scorer: '홍길동', assist: '김철수',
      ownGoalPlayer: '', concedingGk: '',
      inputTime: '2026-04-10 20:00:00',
    }],
  };

  it('득점 이벤트 → goal row 1개 (assist는 related_player)', () => {
    const rows = buildRawEventsFromFutsal(base);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '',
      date: '2026-04-10', match_id: '1라운드 A구장',
      our_team: '블루', opponent: '레드',
      event_type: 'goal', player: '홍길동', related_player: '김철수',
      position: '', input_time: '2026-04-10 20:00:00',
    });
  });

  it('자책골 이벤트 → ownGoal row', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '이영수', concedingGk: '',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('ownGoal');
    expect(rows[0].player).toBe('이영수');
    expect(rows[0].related_player).toBe('');
  });

  it('실점 (scorer 공란, concedingGk 있음) → concede row', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '', concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].player).toBe('박지성');
  });

  it('한 event에 goal + concedingGk 동시 → goal만 생성 (scorer 우선)', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '홍길동', assist: '', ownGoalPlayer: '', concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('goal');
  });

  it('빈 events → 빈 배열', () => {
    expect(buildRawEventsFromFutsal({ team: 'X', events: [] })).toEqual([]);
  });
});

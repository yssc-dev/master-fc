import { describe, it, expect } from 'vitest';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS, buildRawEventsFromFutsal, buildRawPlayerGamesFromFutsal, buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from '../rawLogBuilders';

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

describe('buildRawPlayerGamesFromFutsal', () => {
  it('플레이어 1명 → 1 row, 스키마 맞음', () => {
    const rows = buildRawPlayerGamesFromFutsal({
      team: '마스터FC', inputTime: '2026-04-10 21:00:00',
      players: [{
        gameDate: '2026-04-10', name: '홍길동',
        goals: 3, assists: 1, owngoals: 0, conceded: 0, cleanSheets: 1,
        crova: 1, goguma: 0, keeperGames: 1, rankScore: 4,
        역주행: 0, playerTeam: '블루',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '',
      date: '2026-04-10', player: '홍길동', session_team: '블루',
      games: 0, field_games: 0,       // 풋살은 games 원본 없음 → 0 기본
      keeper_games: 1,
      goals: 3, assists: 1, owngoals: 0, conceded: 0, cleansheets: 1,
      crova: 1, goguma: 0, 역주행: 0, rank_score: 4,
      input_time: '2026-04-10 21:00:00',
    });
  });

  it('역주행 기본 0', () => {
    const rows = buildRawPlayerGamesFromFutsal({
      team: '마스터FC', inputTime: 't',
      players: [{ gameDate: '2026-04-10', name: 'A', goals:0, assists:0, owngoals:0,
                  conceded:0, cleanSheets:0, crova:0, goguma:0, keeperGames:0, rankScore:0,
                  playerTeam:'블루' }],
    });
    expect(rows[0].역주행).toBe(0);
  });

  it('빈 players → 빈 배열', () => {
    expect(buildRawPlayerGamesFromFutsal({ team: 'X', players: [] })).toEqual([]);
  });
});

describe('buildRawEventsFromSoccer', () => {
  const mk = (ev) => ({
    team: '하버FC', mode: '기본', tournamentId: '',
    events: [{ gameDate: '2026-04-10', matchNum: 1, opponent: '상대A', ...ev }],
  });

  it('출전 → lineup', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '출전', player: 'A', relatedPlayer: '', position: 'GK', inputTime: 't' }));
    expect(rows[0]).toMatchObject({
      team: '하버FC', sport: '축구', mode: '기본', tournament_id: '',
      date: '2026-04-10', match_id: '1', our_team: '하버FC', opponent: '상대A',
      event_type: 'lineup', player: 'A', related_player: '', position: 'GK', input_time: 't',
    });
  });

  it('골 → goal (relatedPlayer 유지)', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '골', player: 'B', relatedPlayer: 'C', position: '', inputTime: 't' }));
    expect(rows[0].event_type).toBe('goal');
    expect(rows[0].player).toBe('B');
    expect(rows[0].related_player).toBe('C');
  });

  it('자책골 → ownGoal', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '자책골', player: 'D', relatedPlayer: '', position: '', inputTime: 't' }));
    expect(rows[0].event_type).toBe('ownGoal');
  });

  it('실점 → concede, position GK', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '실점', player: 'E', relatedPlayer: '', position: 'GK', inputTime: 't' }));
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].position).toBe('GK');
  });

  it('교체 → sub (playerIn/playerOut)', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '교체', player: 'IN', relatedPlayer: 'OUT', position: 'FW', inputTime: 't' }));
    expect(rows[0].event_type).toBe('sub');
    expect(rows[0].player).toBe('IN');
    expect(rows[0].related_player).toBe('OUT');
  });

  it('대회모드 → mode="대회", tournament_id 세팅', () => {
    const rows = buildRawEventsFromSoccer({
      team: '하버FC', mode: '대회', tournamentId: '하버리그2026',
      events: [{ gameDate: '2026-05-01', matchNum: 3, opponent: 'X', event: '골', player: 'Y', relatedPlayer: '', position: '', inputTime: 't' }],
    });
    expect(rows[0].mode).toBe('대회');
    expect(rows[0].tournament_id).toBe('하버리그2026');
  });

  it('알 수 없는 event → 스킵', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '경고', player: 'A', relatedPlayer: '', position: '', inputTime: 't' }));
    expect(rows).toHaveLength(0);
  });

  it('matchNum=0 → match_id="0" (not empty)', () => {
    const rows = buildRawEventsFromSoccer({
      team: '하버FC', mode: '기본', tournamentId: '',
      events: [{ gameDate: '2026-04-10', matchNum: 0, opponent: 'X',
                 event: '골', player: 'A', relatedPlayer: '', position: '', inputTime: 't' }],
    });
    expect(rows[0].match_id).toBe('0');
  });
});

describe('buildRawPlayerGamesFromSoccer', () => {
  it('매핑 정확', () => {
    const rows = buildRawPlayerGamesFromSoccer({
      team: '하버FC', inputTime: 't',
      players: [{ gameDate: '2026-04-10', name: 'A',
                  games: 3, fieldGames: 2, keeperGames: 1,
                  goals: 2, assists: 1, cleanSheets: 1, conceded: 3, owngoals: 0 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '하버FC', sport: '축구', mode: '기본', tournament_id: '',
      date: '2026-04-10', player: 'A', session_team: '하버FC',
      games: 3, field_games: 2, keeper_games: 1,
      goals: 2, assists: 1, owngoals: 0, conceded: 3, cleansheets: 1,
      crova: 0, goguma: 0, 역주행: 0, rank_score: 0,
      input_time: 't',
    });
  });

  it('빈 players → 빈 배열', () => {
    expect(buildRawPlayerGamesFromSoccer({ team: 'X', players: [] })).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS } from '../rawLogBuilders';

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

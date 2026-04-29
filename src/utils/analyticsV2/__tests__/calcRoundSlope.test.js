import { describe, it, expect } from 'vitest';
import { calcRoundSlope } from '../calcRoundSlope';

describe('calcRoundSlope', () => {
  it('returns empty result for no events', () => {
    const r = calcRoundSlope({ eventLogs: [], threshold: 10 });
    expect(r.perPlayer).toEqual({});
    expect(r.ranking.lateBloomers).toEqual([]);
    expect(r.ranking.earlyBirds).toEqual([]);
  });

  it('counts goal as ga=1 and goal+assist as ga=2 in same round', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal',  player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal',  player: 'A', related_player: 'B' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    // A: 2 goals in R1 → ga=2
    expect(r.perPlayer.A.points).toEqual([{ date: '2026-04-01', round_idx: 1, ga: 2 }]);
    // B: 1 assist in R1 → ga=1
    expect(r.perPlayer.B.points).toEqual([{ date: '2026-04-01', round_idx: 1, ga: 1 }]);
  });

  it('positive slope when activity grows with round', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 3 });
    expect(r.perPlayer.A.sampleCount).toBe(3);
    expect(r.perPlayer.A.slope).toBeGreaterThan(0);
    expect(r.ranking.lateBloomers[0].player).toBe('A');
    expect(r.ranking.earlyBirds).toEqual([]);
  });

  it('negative slope when activity decays with round', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 3 });
    expect(r.perPlayer.A.slope).toBeLessThan(0);
    expect(r.ranking.earlyBirds[0].player).toBe('A');
    expect(r.ranking.lateBloomers).toEqual([]);
  });

  it('threshold filters out players with sampleCount < threshold', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 10 });
    expect(r.perPlayer.A.sampleCount).toBe(2);
    expect(r.ranking.lateBloomers).toEqual([]);  // 미달
  });

  it('skips events with malformed match_id', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'BAD', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.points).toHaveLength(1);
  });

  it('owngoal does not count toward player ga', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'owngoal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer).toEqual({});
  });

  it('reads round_idx from matchLogs when match_id format is non-standard', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: '1라운드 A구장', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: '2경기',         event_type: 'goal', player: 'A', related_player: '' },
    ];
    const matchLogs = [
      { date: '2026-04-01', match_id: '1라운드 A구장', round_idx: 1 },
      { date: '2026-04-01', match_id: '2경기',         round_idx: 2 },
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 1 });
    expect(r.perPlayer.A.points).toEqual([
      { date: '2026-04-01', round_idx: 1, ga: 1 },
      { date: '2026-04-01', round_idx: 2, ga: 1 },
    ]);
  });

  it('matchLogs join takes precedence over match_id regex', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R5_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const matchLogs = [
      { date: '2026-04-01', match_id: 'R5_C0', round_idx: 99 },  // 시트 컬럼이 진실 소스
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 1 });
    expect(r.perPlayer.A.points[0].round_idx).toBe(99);
  });

  it('meanByRound averages across sessions for same round_idx', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-08', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.meanByRound[1]).toBeCloseTo(1.5, 5); // (2 + 1) / 2 sessions
  });
});

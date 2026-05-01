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

  it('빈 round_idx 셀("")은 lookup에서 제외 — fallback regex가 동작', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'P1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'P3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    // 시트에서 빈 셀이 ""로 들어온 경우 (Number('')=0이므로 잘못된 lookup 등록 방지 검증)
    const matchLogs = [
      { date: '2026-04-01', match_id: 'P1_C0', round_idx: '' },
      { date: '2026-04-01', match_id: 'P3_C0', round_idx: '' },
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 1 });
    expect(r.perPlayer.A.points.map(p => p.round_idx).sort()).toEqual([1, 3]);
  });

  it('parses round_idx from push (P{n}_C0) and free (F{n}_C{m}) match_ids', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'P1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'P2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'F3_C1', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.points).toHaveLength(3);
    expect(r.perPlayer.A.points.map(p => p.round_idx).sort()).toEqual([1, 2, 3]);
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

  it('출전 baseline: matchLogs members로 ga=0 표본 포함', () => {
    // A는 R1, R2, R3 모두 출전. R3에만 1골. 출전했지만 0골인 R1,R2도 표본.
    const matchLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', round_idx: 1, our_members_json: '["A","X"]', opponent_members_json: '["B"]' },
      { date: '2026-04-01', match_id: 'R2_C0', round_idx: 2, our_members_json: '["A","X"]', opponent_members_json: '["B"]' },
      { date: '2026-04-01', match_id: 'R3_C0', round_idx: 3, our_members_json: '["A","X"]', opponent_members_json: '["B"]' },
    ];
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 1 });
    expect(r.perPlayer.A.sampleCount).toBe(3);
    expect(r.perPlayer.A.activeCount).toBe(1);
    expect(r.perPlayer.A.points.find(p => p.round_idx === 1).ga).toBe(0);
    expect(r.perPlayer.A.points.find(p => p.round_idx === 2).ga).toBe(0);
    expect(r.perPlayer.A.points.find(p => p.round_idx === 3).ga).toBe(1);
    // R1=0, R2=0, R3=1 → 후반 폭격기 추세 (slope > 0)
    expect(r.perPlayer.A.slope).toBeGreaterThan(0);
  });

  it('opponent_members_json 선수도 출전 표본으로 포함', () => {
    const matchLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', round_idx: 1, our_members_json: '["X"]', opponent_members_json: '["A"]' },
      { date: '2026-04-01', match_id: 'R2_C0', round_idx: 2, our_members_json: '["X"]', opponent_members_json: '["A"]' },
    ];
    const r = calcRoundSlope({ eventLogs: [], matchLogs, threshold: 1 });
    expect(r.perPlayer.A.sampleCount).toBe(2);
    expect(r.perPlayer.A.activeCount).toBe(0);
  });

  it('activeCount<2면 ranking에서 제외 (G+A 표본 부족)', () => {
    // A는 12라운드 출전했지만 단 1골만 — 추세 분석 무의미
    const matchLogs = Array.from({ length: 12 }, (_, i) => ({
      date: '2026-04-01', match_id: `R${i + 1}_C0`, round_idx: i + 1,
      our_members_json: '["A"]', opponent_members_json: '[]',
    }));
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R6_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 10 });
    expect(r.perPlayer.A.sampleCount).toBe(12);
    expect(r.perPlayer.A.activeCount).toBe(1);
    expect(r.ranking.lateBloomers).toEqual([]);
    expect(r.ranking.earlyBirds).toEqual([]);
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

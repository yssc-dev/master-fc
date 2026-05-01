import { describe, it, expect } from 'vitest';
import { calcRoundSlope } from '../calcRoundSlope';

describe('calcRoundSlope', () => {
  it('returns empty result for no events', () => {
    const r = calcRoundSlope({ eventLogs: [], threshold: 10 });
    expect(r.perPlayer).toEqual({});
    expect(r.ranking.lateBloomers).toEqual([]);
    expect(r.ranking.earlyBirds).toEqual([]);
  });

  it('counts goal as 1 sample and assist as 1 sample (related_player)', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal',  player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal',  player: 'A', related_player: 'B' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    // A: 2 goal events
    expect(r.perPlayer.A.eventCount).toBe(2);
    // B: 1 assist event (related_player on goal event)
    expect(r.perPlayer.B.eventCount).toBe(1);
  });

  it('tendency > 0.5 (후반 폭격기) when events concentrated in late rounds', () => {
    // 세션은 R1~R3. A는 R3에 골 3개 → percentile 모두 1.0
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'X', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 3 });
    expect(r.perPlayer.A.tendency).toBeCloseTo(1.0, 5);
    expect(r.perPlayer.A.slope).toBeCloseTo(0.5, 5);
    expect(r.ranking.lateBloomers[0].player).toBe('A');
    expect(r.ranking.earlyBirds.find(x => x.player === 'A')).toBeUndefined();
  });

  it('tendency < 0.5 (초반 강자) when events concentrated in early rounds', () => {
    // 세션은 R1~R3. A는 R1에 골 3개 → percentile 모두 0.0
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'X', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 3 });
    expect(r.perPlayer.A.tendency).toBeCloseTo(0.0, 5);
    expect(r.perPlayer.A.slope).toBeCloseTo(-0.5, 5);
    expect(r.ranking.earlyBirds[0].player).toBe('A');
    expect(r.ranking.lateBloomers.find(x => x.player === 'A')).toBeUndefined();
  });

  it('tendency ≈ 0.5 when events evenly distributed across rounds', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R2_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    // percentiles: 0, 0.5, 1.0 → mean = 0.5
    expect(r.perPlayer.A.tendency).toBeCloseTo(0.5, 5);
    // tendency === 0.5 → ranking 양쪽 모두 제외
    expect(r.ranking.lateBloomers.find(x => x.player === 'A')).toBeUndefined();
    expect(r.ranking.earlyBirds.find(x => x.player === 'A')).toBeUndefined();
  });

  it('multiple events in same round count as separate samples (자연 가중치)', () => {
    // R1에 3골, R3에 1골 → tendency = (0+0+0+1)/4 = 0.25
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.eventCount).toBe(4);
    expect(r.perPlayer.A.tendency).toBeCloseTo(0.25, 5);
  });

  it('threshold filters out players with eventCount < threshold', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 10 });
    expect(r.perPlayer.A.eventCount).toBe(2);
    expect(r.ranking.lateBloomers).toEqual([]);
    expect(r.ranking.earlyBirds).toEqual([]);
  });

  it('skips events with malformed match_id (no round_idx resolvable)', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'BAD', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.eventCount).toBe(1);
  });

  it('빈 round_idx 셀("")은 lookup에서 제외 — fallback regex가 동작', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'P1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'P3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
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
    expect(r.perPlayer.A.eventCount).toBe(3);
    expect(r.perPlayer.A.points.map(p => p.round_idx).sort()).toEqual([1, 2, 3]);
  });

  it('legacy "N경기" 포맷 round_idx 추출 (N=라운드)', () => {
    const eventLogs = [
      { date: '2026-01-15', match_id: '3경기',  event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-01-15', match_id: '10경기', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.points.map(p => p.round_idx).sort((a,b)=>a-b)).toEqual([3, 10]);
  });

  it('legacy "N라운드 ..." 포맷 round_idx 추출', () => {
    const eventLogs = [
      { date: '2026-04-16', match_id: '2라운드 매치1',  event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-16', match_id: '7라운드 매치1',  event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-23', match_id: '10라운드 B구장', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.points.map(p => p.round_idx).sort((a,b)=>a-b)).toEqual([2, 7, 10]);
  });

  it('owngoal does not count toward player', () => {
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
    expect(r.perPlayer.A.points.map(p => p.round_idx).sort()).toEqual([1, 2]);
  });

  it('matchLogs join takes precedence over match_id regex', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R5_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const matchLogs = [
      { date: '2026-04-01', match_id: 'R5_C0', round_idx: 99 },
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 1 });
    expect(r.perPlayer.A.points[0].round_idx).toBe(99);
  });

  it('countByRound counts events per round (차트 막대 높이)', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-04-01', match_id: 'R3_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.countByRound[1]).toBe(2);
    expect(r.perPlayer.A.countByRound[3]).toBe(1);
    expect(r.perPlayer.A.activeRoundCount).toBe(2);
  });

  it('sessionMaxRound uses both matchLogs and eventLogs', () => {
    // matchLogs에 R5까지, eventLogs는 R1만 있어도 max=5로 잡혀야 함 (percentile=0)
    const matchLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', round_idx: 1 },
      { date: '2026-04-01', match_id: 'R5_C0', round_idx: 5 },
    ];
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, matchLogs, threshold: 1 });
    // (1-1)/(5-1) = 0 → 초반 강자
    expect(r.perPlayer.A.tendency).toBeCloseTo(0, 5);
  });

  it('single-round session (max=1) is skipped from percentile (정의 불가)', () => {
    const eventLogs = [
      { date: '2026-04-01', match_id: 'R1_C0', event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcRoundSlope({ eventLogs, threshold: 1 });
    // sessionMax=1 → percentile 정의 불가 → tendency=null
    expect(r.perPlayer.A.tendency).toBeNull();
    expect(r.perPlayer.A.slope).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { calcAssistPairs } from '../calcAssistPairs';

describe('calcAssistPairs', () => {
  it('returns empty for no events', () => {
    expect(calcAssistPairs({ eventLogs: [] })).toEqual([]);
  });

  it('counts (assister, scorer) pairs', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'B' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10 });
    expect(r).toEqual([{ assister: 'A', scorer: 'S', count: 3 }]);
  });

  it('order matters (A→S != S→A)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10 });
    expect(r).toHaveLength(2);
    expect(r.find(x => x.assister === 'A' && x.scorer === 'S').count).toBe(3);
    expect(r.find(x => x.assister === 'S' && x.scorer === 'A').count).toBe(3);
  });

  it('skips solo goals (no related_player)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: '' },
    ];
    expect(calcAssistPairs({ eventLogs, threshold: 1 })).toEqual([]);
  });

  it('skips owngoal', () => {
    const eventLogs = [
      { event_type: 'owngoal', player: 'S', related_player: 'A' },
    ];
    expect(calcAssistPairs({ eventLogs, threshold: 1 })).toEqual([]);
  });

  it('topN limits result length', () => {
    const eventLogs = [];
    for (let i = 0; i < 15; i++) {
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
    }
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 5 });
    expect(r).toHaveLength(5);
  });
});

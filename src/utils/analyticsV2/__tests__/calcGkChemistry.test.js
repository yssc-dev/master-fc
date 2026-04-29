import { describe, it, expect } from 'vitest';
import { calcGkChemistry } from '../calcGkChemistry';

describe('calcGkChemistry', () => {
  it('returns empty for no logs', () => {
    const r = calcGkChemistry({ matchLogs: [], threshold: 1 });
    expect(r.gks).toEqual([]);
    expect(r.byGk).toEqual({});
  });

  it('counts rounds with same GK + same field member', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A","B"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A","B"]', opponent_score: 1 },
      { our_gk: 'G', our_members_json: '["G","A","C"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    const gA = r.byGk.G.pairs.find(p => p.field === 'A');
    expect(gA).toEqual({ field: 'A', rounds: 3, cleanSheets: 2, cleanRate: 2 / 3 });
    const gB = r.byGk.G.pairs.find(p => p.field === 'B');
    expect(gB).toEqual({ field: 'B', rounds: 2, cleanSheets: 1, cleanRate: 1 / 2 });
    const gC = r.byGk.G.pairs.find(p => p.field === 'C');
    expect(gC).toEqual({ field: 'C', rounds: 1, cleanSheets: 1, cleanRate: 1 });
  });

  it('excludes GK from own pair list', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.byGk.G.pairs.find(p => p.field === 'G')).toBeUndefined();
  });

  it('skips rows with empty our_gk', () => {
    const matchLogs = [
      { our_gk: '', our_members_json: '["A","B"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.gks).toEqual([]);
  });

  it('threshold filters pairs below rounds', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 5 });
    expect(r.byGk.G.pairs).toEqual([]);
    expect(r.byGk.G.worst).toEqual([]);
  });

  it('worst is sorted by cleanRate asc, pairs by desc', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","B"]', opponent_score: 1 },
      { our_gk: 'G', our_members_json: '["G","B"]', opponent_score: 1 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 2 });
    expect(r.byGk.G.pairs[0].field).toBe('A');
    expect(r.byGk.G.worst[0].field).toBe('B');
  });

  it('skips malformed our_members_json', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: 'bad-json', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.byGk.G.pairs.find(p => p.field === 'A').rounds).toBe(1);
  });
});

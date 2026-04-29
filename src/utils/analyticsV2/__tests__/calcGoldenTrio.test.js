import { describe, it, expect } from 'vitest';
import { calcGoldenTrio } from '../calcGoldenTrio';

const mk = (id, members, our_score, opponent_score) => ({
  match_id: id,
  our_members_json: JSON.stringify(members),
  our_score,
  opponent_score,
});

describe('calcGoldenTrio', () => {
  it('sorts pairs by chemistry desc (winRate above individual avg)', () => {
    const matchLogs = [
      mk('R1_C1', ['A','B','C'], 2, 0),
      mk('R2_C1', ['A','B','C'], 3, 1),
      mk('R3_C1', ['A','B','C'], 0, 1),
      mk('R4_C1', ['A','B','D'], 1, 0),
      mk('R5_C1', ['A','B','D'], 0, 2),
      mk('R6_C1', ['A','B','D'], 0, 2),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    expect(r[0].winRate).toBeCloseTo(2 / 3, 5);
    expect(r[0].chemistry).toBeGreaterThan(0);
    expect(r[r.length - 1].chemistry).toBeLessThanOrEqual(r[0].chemistry);
  });

  it('filters trios below minRounds', () => {
    const matchLogs = [
      mk('R1_C1', ['A','B','C'], 1, 0),
      mk('R2_C1', ['A','B','D'], 1, 0),
      mk('R3_C1', ['A','B','D'], 1, 0),
      mk('R4_C1', ['A','B','D'], 1, 0),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    const ab = r.find(x => x.members[0] === 'A' && x.members[1] === 'B');
    const ad = r.find(x => x.members[0] === 'A' && x.members[1] === 'D');
    const bd = r.find(x => x.members[0] === 'B' && x.members[1] === 'D');
    expect(ab).toBeTruthy();
    expect(ad).toBeTruthy();
    expect(bd).toBeTruthy();
    expect(r.find(x => x.members.includes('C'))).toBeUndefined();
  });

  it('teams with <2 members produce no pairs', () => {
    const matchLogs = [
      mk('R1_C1', ['A'], 1, 0),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 1, topN: 5 });
    expect(r).toEqual([]);
  });

  it('respects topN', () => {
    const matchLogs = [];
    let id = 0;
    for (const trio of [['A','B','C'], ['A','B','D'], ['A','B','E']]) {
      for (let i = 0; i < 3; i++) {
        matchLogs.push(mk(`R${++id}_C1`, trio, 1, 0));
      }
    }
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 2 });
    expect(r).toHaveLength(2);
  });
});

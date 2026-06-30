import { describe, it, expect } from 'vitest';
import { buildPointLogRows } from '../soccerScoring';

const match = (events) => [{ status: 'finished', matchIdx: 0, opponent: '터틀파크', events }];

describe('buildPointLogRows — 실점(conceded) 컬럼', () => {
  it('opponentGoal(실점)은 conceded에 실점 키퍼명을 넣는다 (리터럴 "실점" 아님)', () => {
    const rows = buildPointLogRows(match([
      { type: 'opponentGoal', currentGk: '박동휘', timestamp: 1 },
    ]), '2026-06-10', 'now');
    expect(rows).toHaveLength(1);
    expect(rows[0].conceded).toBe('박동휘');
    expect(rows[0].conceded).not.toBe('실점');
    expect(rows[0].scorer).toBe('');
  });

  it('currentGk가 없으면 conceded는 빈 문자열', () => {
    const rows = buildPointLogRows(match([{ type: 'opponentGoal', timestamp: 1 }]), '2026-06-10', 'now');
    expect(rows[0].conceded).toBe('');
  });

  it('goal/owngoal 행은 영향 없음', () => {
    const rows = buildPointLogRows(match([
      { type: 'goal', player: '강지선', assist: '양병선', timestamp: 1 },
      { type: 'owngoal', player: '최진서', timestamp: 2 },
    ]), '2026-06-10', 'now');
    expect(rows[0]).toMatchObject({ scorer: '강지선', assist: '양병선', conceded: '', ownGoalPlayer: '' });
    expect(rows[1]).toMatchObject({ scorer: 'OG', ownGoalPlayer: '최진서', conceded: '' });
  });

  it('finished 아닌 경기는 제외', () => {
    const rows = buildPointLogRows(
      [{ status: 'playing', matchIdx: 0, opponent: 'X', events: [{ type: 'goal', player: 'A', timestamp: 1 }] }],
      '2026-06-10', 'now');
    expect(rows).toHaveLength(0);
  });
});

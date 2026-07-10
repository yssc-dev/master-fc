import { describe, it, expect } from 'vitest';
import { calcMatchScore } from '../scoring';

// 반칙(🟨 옐로카드)은 스코어에 영향 없어야 함 — goal/owngoal만 집계
describe('calcMatchScore', () => {
  const M = 'R1_C0';
  const goal = (scoringTeam) => ({ matchId: M, type: 'goal', scoringTeam });
  const owngoal = (scoringTeam) => ({ matchId: M, type: 'owngoal', scoringTeam });
  const foul = (scoringTeam) => ({ matchId: M, type: 'foul', scoringTeam });

  it('goal은 득점팀에 +1', () => {
    expect(calcMatchScore([goal('A'), goal('A'), goal('B')], M, 'A')).toBe(2);
  });

  it('owngoal은 상대팀(scoringTeam)에 +2', () => {
    expect(calcMatchScore([owngoal('A')], M, 'A')).toBe(2);
  });

  it('foul(옐로카드)은 어느 팀 스코어에도 반영되지 않음', () => {
    expect(calcMatchScore([foul('A')], M, 'A')).toBe(0);
    expect(calcMatchScore([foul('A')], M, 'B')).toBe(0);
    // 골과 섞여도 골만 집계
    expect(calcMatchScore([goal('A'), foul('A'), foul('A')], M, 'A')).toBe(1);
  });

  it('다른 매치 이벤트는 미집계', () => {
    expect(calcMatchScore([{ matchId: 'R2_C0', type: 'goal', scoringTeam: 'A' }], M, 'A')).toBe(0);
  });
});

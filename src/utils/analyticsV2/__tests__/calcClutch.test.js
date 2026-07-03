import { describe, it, expect } from 'vitest';
import { calcClutch } from '../calcClutch';

const match = (id, ourMembers, oppMembers, ourScore, oppScore, extra = {}) => ({
  date: '2026-01-01', match_id: id,
  our_members_json: JSON.stringify(ourMembers),
  opponent_members_json: JSON.stringify(oppMembers),
  our_score: ourScore, opponent_score: oppScore,
  ...extra,
});
const goal = (mid, player, input_time = '', type = 'goal') => ({
  event_type: type, player, related_player: '', date: '2026-01-01', match_id: mid, input_time,
});

describe('calcClutch', () => {
  it('결승골 = 승리 매치에서 (패자 최종득점+1)번째 승자 골', () => {
    const matchLogs = [match('R1_C1', ['P1', 'P2'], ['Q'], 2, 1)];
    const eventLogs = [
      goal('R1_C1', 'P1'), // our 1:0
      goal('R1_C1', 'Q'),  // 1:1
      goal('R1_C1', 'P2'), // 2:1 ← 결승골 (L=1, 2번째 our 골)
    ];
    const r = calcClutch({ eventLogs, matchLogs });
    expect(r.perPlayer.P2.winningGoals).toBe(1);
    expect(r.perPlayer.P1?.winningGoals ?? 0).toBe(0);
  });

  it('동점골과 역전골 분류', () => {
    const matchLogs = [match('R1_C1', ['P1', 'P2'], ['Q'], 2, 1)];
    const eventLogs = [
      goal('R1_C1', 'Q'),  // 0:1 (our 뒤짐)
      goal('R1_C1', 'P1'), // 1:1 ← 동점골
      goal('R1_C1', 'P2'), // 2:1 ← 리드골 + 뒤졌던 적 있음 = 역전골
    ];
    const r = calcClutch({ eventLogs, matchLogs });
    expect(r.perPlayer.P1.equalizers).toBe(1);
    expect(r.perPlayer.P2.comebackGoals).toBe(1);
    expect(r.perPlayer.P2.winningGoals).toBe(1); // L=1 → 2번째 our 골
  });

  it('자책골은 상대 득점으로 재구성에 반영되고 득점자 크레딧 없음', () => {
    const matchLogs = [match('R1_C1', ['P1'], ['Q'], 1, 1)];
    const eventLogs = [
      goal('R1_C1', 'P1'),            // our 1:0
      goal('R1_C1', 'P1', '', 'owngoal'), // our 선수 자책 → opp 1:1
    ];
    const r = calcClutch({ eventLogs, matchLogs });
    expect(r.skippedMatches).toBe(0); // 재구성 1:1 = 기록 1:1 → 신뢰
    expect(r.perPlayer.P1.winningGoals).toBe(0); // 무승부 — 결승골 없음
  });

  it('이벤트 재구성이 기록 스코어와 다르면 그 매치는 스킵', () => {
    const matchLogs = [match('R1_C1', ['P1'], ['Q'], 3, 0)];
    const eventLogs = [goal('R1_C1', 'P1')]; // 재구성 1:0 ≠ 기록 3:0
    const r = calcClutch({ eventLogs, matchLogs });
    expect(r.skippedMatches).toBe(1);
    expect(r.perPlayer.P1?.winningGoals ?? 0).toBe(0);
  });

  it('input_time이 전부 있으면 그 순서로 재구성', () => {
    const matchLogs = [match('R1_C1', ['P1', 'P2'], ['Q'], 2, 1)];
    // 배열 순서는 뒤죽박죽, input_time이 진실
    const eventLogs = [
      goal('R1_C1', 'P2', '2026-01-01 20:30:00.300'), // 3번째: 2:1 결승골
      goal('R1_C1', 'P1', '2026-01-01 20:10:00.100'), // 1번째: 1:0
      goal('R1_C1', 'Q',  '2026-01-01 20:20:00.200'), // 2번째: 1:1
    ];
    const r = calcClutch({ eventLogs, matchLogs });
    expect(r.perPlayer.P2.winningGoals).toBe(1);
    expect(r.perPlayer.Q.equalizers).toBe(1);
  });

  it('랭킹은 결승골 수 내림차순', () => {
    const matchLogs = [
      match('R1_C1', ['A'], ['Z'], 1, 0),
      match('R2_C1', ['A'], ['Z'], 1, 0),
      match('R3_C1', ['B'], ['Z'], 1, 0),
    ];
    const eventLogs = [
      goal('R1_C1', 'A'), goal('R2_C1', 'A'), goal('R3_C1', 'B'),
    ];
    const r = calcClutch({ eventLogs, matchLogs });
    expect(r.ranking.winningGoals[0]).toMatchObject({ player: 'A', value: 2 });
  });
});

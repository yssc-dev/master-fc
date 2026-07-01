import { describe, it, expect } from 'vitest';
import { remapPlayerInSoccerEvents } from '../soccerScoring';

describe('remapPlayerInSoccerEvents', () => {
  const events = [
    { id: '1', type: 'goal', player: 'B', assist: 'X', timestamp: 1 },
    { id: '2', type: 'goal', player: 'Y', assist: 'B', timestamp: 2 },
    { id: '3', type: 'opponentGoal', currentGk: 'B', timestamp: 3 },
    { id: '4', type: 'sub', playerOut: 'B', playerIn: 'Z', position: 'DF', timestamp: 4 },
    { id: '5', type: 'yellowCard', player: 'B', timestamp: 5 },
    { id: '6', type: 'gkChange', playerOut: 'B', playerIn: 'W', timestamp: 6 },
    { id: '7', type: 'goal', player: 'X', assist: null, timestamp: 7 },
  ];

  it('모든 이름 필드에서 from→to 치환, 나머지 불변', () => {
    const r = remapPlayerInSoccerEvents(events, 'B', 'A');
    expect(r[0]).toMatchObject({ player: 'A', assist: 'X' });
    expect(r[1]).toMatchObject({ player: 'Y', assist: 'A' });
    expect(r[2]).toMatchObject({ currentGk: 'A' });
    expect(r[3]).toMatchObject({ playerOut: 'A', playerIn: 'Z' });
    expect(r[4]).toMatchObject({ player: 'A' });
    expect(r[5]).toMatchObject({ playerOut: 'A', playerIn: 'W' });
    expect(r[6].assist).toBeNull(); // null 유지
  });

  it('입력을 변형하지 않는다', () => {
    const copy = JSON.parse(JSON.stringify(events));
    remapPlayerInSoccerEvents(events, 'B', 'A');
    expect(events).toEqual(copy);
  });

  it('from===to면 원본 그대로', () => {
    expect(remapPlayerInSoccerEvents(events, 'B', 'B')).toBe(events);
  });
});

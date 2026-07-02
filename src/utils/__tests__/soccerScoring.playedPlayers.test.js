import { describe, it, expect } from 'vitest';
import { getSoccerPlayedPlayers, calcSoccerPlayerStats } from '../soccerScoring';

// 출전 = lineup ∪ sub 투입 ∪ gkChange 참여 ∪ 최종 피치(assignments).
// sub 이벤트가 삭제돼도(하버FC 6/30 1경기: 장주성/차진옥) 최종 배치에 있으면 출전으로 잡혀야 한다.
describe('getSoccerPlayedPlayers', () => {
  it('lineup만 있으면 lineup 그대로', () => {
    expect(getSoccerPlayedPlayers({ lineup: ['A', 'B'] })).toEqual(['A', 'B']);
  });

  it('sub 투입 선수 포함, 중복 제거', () => {
    const m = {
      lineup: ['A', 'B'],
      events: [{ type: 'sub', playerOut: 'B', playerIn: 'C' }],
    };
    expect(getSoccerPlayedPlayers(m)).toEqual(['A', 'B', 'C']);
  });

  it('sub 이벤트가 삭제돼 assignments에만 남은 선수도 출전(핵심 버그 케이스)', () => {
    const m = {
      lineup: ['A', 'B'],
      events: [],
      assignments: { 0: 'A', 1: '장주성' }, // B가 lineup에 남고 장주성이 피치에
    };
    expect(getSoccerPlayedPlayers(m)).toEqual(['A', 'B', '장주성']);
  });

  it('RTDB가 assignments를 배열로 돌려줘도(숫자키 변환) 동작, null 슬롯 무시', () => {
    const m = { lineup: ['A'], assignments: ['A', null, 'C'] };
    expect(getSoccerPlayedPlayers(m)).toEqual(['A', 'C']);
  });

  it('gkChange 참여자 포함', () => {
    const m = { lineup: ['A'], events: [{ type: 'gkChange', playerOut: 'A', playerIn: 'K' }] };
    expect(getSoccerPlayedPlayers(m)).toContain('K');
  });

  it('필드 없어도 안전(빈배열 누락 함정)', () => {
    expect(getSoccerPlayedPlayers({})).toEqual([]);
  });
});

describe('calcSoccerPlayerStats — assignments-only 선수 집계', () => {
  it('assignments에만 있는 선수도 games/cleanSheets 집계', () => {
    const stats = calcSoccerPlayerStats([{
      status: 'finished',
      lineup: ['GK1', 'D1'],
      gk: 'GK1',
      defenders: ['D1'],
      assignments: { 0: 'GK1', 1: '장주성' },
      events: [{ type: 'goal', player: '장주성', assist: null }],
    }]);
    expect(stats['장주성'].games).toBe(1);
    expect(stats['장주성'].goals).toBe(1);
  });
});

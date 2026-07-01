import { describe, it, expect } from 'vitest';
import { defendersFromPositionMap } from '../formations';

describe('defendersFromPositionMap', () => {
  it('DF role인 선수만 추출', () => {
    expect(defendersFromPositionMap({ GK1: 'GK', D1: 'DF', D2: 'DF', M1: 'MF' }).sort())
      .toEqual(['D1', 'D2']);
  });
  it('null/빈 입력 → 빈 배열', () => {
    expect(defendersFromPositionMap(null)).toEqual([]);
    expect(defendersFromPositionMap({})).toEqual([]);
  });
});

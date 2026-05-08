import { describe, it, expect } from 'vitest';
import { generateEventId, formatEventInputTime } from '../idGenerator';

describe('generateEventId', () => {
  it('각 호출마다 고유한 id 생성', () => {
    const a = generateEventId();
    const b = generateEventId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^evt_\d+_\d+$/);
  });
});

describe('formatEventInputTime', () => {
  it('ms 정밀도 포함 (같은 초 내 두 이벤트 구분 가능)', () => {
    const ts1 = new Date('2026-05-08T13:23:45.123+09:00').getTime();
    const ts2 = new Date('2026-05-08T13:23:45.456+09:00').getTime();
    const a = formatEventInputTime(ts1);
    const b = formatEventInputTime(ts2);
    expect(a).not.toBe(b);
    expect(a).toMatch(/\.123$/);
    expect(b).toMatch(/\.456$/);
  });

  it('timestamp 누락 시 fallback 반환', () => {
    expect(formatEventInputTime(0, 'batch_time')).toBe('batch_time');
    expect(formatEventInputTime(null, 'batch_time')).toBe('batch_time');
    expect(formatEventInputTime(undefined, 'batch_time')).toBe('batch_time');
  });

  it('동일 매치·동일 패턴 두 골이 ms 다르면 input_time 도 다름 (dedupe 회피)', () => {
    // 시나리오: 한 선수가 같은 매치에서 같은 어시·같은 상대 GK 로 2골
    // → row 의 다른 모든 컬럼은 동일하고 input_time 만 다르므로 시트 dedupe 키가 충돌하지 않음
    const ts1 = Date.now();
    const ts2 = ts1 + 17;
    expect(formatEventInputTime(ts1)).not.toBe(formatEventInputTime(ts2));
  });
});

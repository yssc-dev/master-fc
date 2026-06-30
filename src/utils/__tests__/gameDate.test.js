import { describe, it, expect } from 'vitest';
import { gameDateFromId } from '../gameDate';

describe('gameDateFromId', () => {
  it('g_<ts>에서 경기 날짜 복원', () => {
    const ts = Date.parse('2026-06-10T12:00:00+09:00');
    expect(gameDateFromId(`g_${ts}`).getTime()).toBe(ts);
  });

  it('레거시 gameId(g_ 아님)는 fallback 사용', () => {
    const fb = Date.parse('2026-06-01T00:00:00Z');
    expect(gameDateFromId('legacy', fb).getTime()).toBe(fb);
  });

  it('fallback 없으면 현재 시각 Date 반환 — 크래시 없음', () => {
    expect(gameDateFromId('legacy') instanceof Date).toBe(true);
    expect(gameDateFromId(undefined) instanceof Date).toBe(true);
  });

  it('ts<=0 / 숫자 아님은 fallback', () => {
    const fb = 1700000000000;
    expect(gameDateFromId('g_0', fb).getTime()).toBe(fb);
    expect(gameDateFromId('g_abc', fb).getTime()).toBe(fb);
  });
});

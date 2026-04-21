import { describe, it, expect } from 'vitest';
import { normalizeMatchId, buildStandardMatchId } from '../matchIdNormalizer';

describe('normalizeMatchId', () => {
  it('이미 표준 풋살 포맷 R{n}_C{n}은 그대로 반환', () => {
    expect(normalizeMatchId('R3_C0', '풋살')).toBe('R3_C0');
    expect(normalizeMatchId('R12_C1', '풋살')).toBe('R12_C1');
  });

  it('"N라운드 매치M" → R{N}_C{M-1}', () => {
    expect(normalizeMatchId('3라운드 매치1', '풋살')).toBe('R3_C0');
    expect(normalizeMatchId('1라운드 매치2', '풋살')).toBe('R1_C1');
    expect(normalizeMatchId('10라운드 매치1', '풋살')).toBe('R10_C0');
  });

  it('풋살 "N경기" → R{N}_C0 (단일 코트 가정)', () => {
    expect(normalizeMatchId('3경기', '풋살')).toBe('R3_C0');
    expect(normalizeMatchId('12경기', '풋살')).toBe('R12_C0');
  });

  it('풋살 순수 숫자 → R{N}_C0', () => {
    expect(normalizeMatchId('5', '풋살')).toBe('R5_C0');
  });

  it('축구 "N경기" → "{N}" 숫자 문자열', () => {
    expect(normalizeMatchId('3경기', '축구')).toBe('3');
    expect(normalizeMatchId('1경기', '축구')).toBe('1');
  });

  it('축구 순수 숫자는 그대로 문자열', () => {
    expect(normalizeMatchId('5', '축구')).toBe('5');
  });

  it('빈 값은 빈 값 그대로', () => {
    expect(normalizeMatchId('', '풋살')).toBe('');
    expect(normalizeMatchId(null, '풋살')).toBe(null);
    expect(normalizeMatchId(undefined, '축구')).toBe(undefined);
  });

  it('인식 불가 포맷은 원본 그대로 반환', () => {
    expect(normalizeMatchId('이상한값', '풋살')).toBe('이상한값');
    expect(normalizeMatchId('friendly-match-A', '축구')).toBe('friendly-match-A');
  });
});

describe('buildStandardMatchId', () => {
  it('풋살: R{round_idx}_C{court_id}', () => {
    expect(buildStandardMatchId({ sport: '풋살', round_idx: 3, court_id: 0 })).toBe('R3_C0');
    expect(buildStandardMatchId({ sport: '풋살', round_idx: 5, court_id: 1 })).toBe('R5_C1');
  });

  it('풋살 court_id 미지정 시 C0 기본값', () => {
    expect(buildStandardMatchId({ sport: '풋살', round_idx: 2 })).toBe('R2_C0');
  });

  it('축구: String(match_idx)', () => {
    expect(buildStandardMatchId({ sport: '축구', match_idx: 3 })).toBe('3');
    expect(buildStandardMatchId({ sport: '축구', match_idx: 1 })).toBe('1');
  });
});

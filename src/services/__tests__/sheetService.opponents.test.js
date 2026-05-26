import { describe, it, expect } from 'vitest';
import { parseSoccerOpponents } from '../sheetService.js';

// 대시보드 CSV 모사: 0~5열은 선수 데이터, 6열부터 상대팀 표(vs 상대팀명 | 경기 | 승 | 무 | 패 | 득점 | 실점)
const CSV = [
  ',,,,,,,,,,,,,',                                   // row0 잡음
  ',,,,,,,,,,,,,',                                   // row1 잡음
  'ppg,순위,등번호,이름,경기수,골,vs 상대팀명,경기,승,무,패,득점,실점', // row2 헤더
  '1.2,1,10,김철수,5,3,한울,31,22,7,2,71,18',         // row3
  '1.0,2,7,이영희,28,6,시청,3,3,0,0,12,2',            // row4
  ',,,,,,아이콘,28,6,13,9,29,36',                      // row5 (선수열은 비고 상대팀만)
  ',,,,,,,,,,,,,',                                    // row6 상대팀 끝 → 중단
  '0.5,9,3,박지성,10,1,,,,,,,'                         // row7 (상대팀열 비어있어 안 읽힘)
].join('\n');

describe('parseSoccerOpponents', () => {
  it('상대팀명 헤더를 자동탐지해 팀명+경기수를 경기수순으로 반환', () => {
    expect(parseSoccerOpponents(CSV)).toEqual([
      { name: '한울', games: 31 },
      { name: '아이콘', games: 28 },
      { name: '시청', games: 3 },
    ]);
  });

  it('헤더가 없으면 빈 배열', () => {
    expect(parseSoccerOpponents('a,b,c\n1,2,3')).toEqual([]);
  });

  it('빈 문자열도 안전하게 빈 배열', () => {
    expect(parseSoccerOpponents('')).toEqual([]);
  });
});

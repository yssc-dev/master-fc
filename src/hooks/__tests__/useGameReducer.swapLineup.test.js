import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const withState = (o) => ({ ...initialState, ...o });

// 4-4-2 슬롯: idx0=GK, 1-4=DF, 5-8=MF, 9-10=FW
const base = () => withState({ soccerMatches: [
  { matchIdx: 0, opponent: 'X', status: 'finished', formation: '4-4-2',
    lineup: ['GK1','D1','D2','D3','D4','M1','M2','M3','M4','F1','F2'],
    defenders: ['D1','D2','D3','D4'], gk: 'GK1',
    assignments: { 0:'GK1',1:'D1',2:'D2',3:'D3',4:'D4',5:'M1',6:'M2',7:'M3',8:'M4',9:'F1',10:'F2' },
    positionMap: { GK1:'GK',D1:'DF',D2:'DF',D3:'DF',D4:'DF',M1:'MF',M2:'MF',M3:'MF',M4:'MF',F1:'FW',F2:'FW' },
    subs: ['BN1'], events: [] },
  { matchIdx: 1, opponent: 'Y', status: 'finished', formation: '4-4-2',
    lineup: ['P1'], defenders: [], gk: '', assignments: {0:'P1'}, positionMap: {P1:'FW'}, subs: [], events: [] },
] });

describe('gameReducer — SWAP_SOCCER_LINEUP_POSITIONS', () => {
  it('두 필드 슬롯 위치 교대(assignments/positionMap 반영)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 5 });
    const m = next.soccerMatches[0];
    expect(m.assignments[1]).toBe('M1');
    expect(m.assignments[5]).toBe('D1');
    expect(m.positionMap['M1']).toBe('DF');
    expect(m.positionMap['D1']).toBe('MF');
  });
  it('DF↔MF 교대 시 defenders 재계산(D1 빠지고 M1 추가)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 5 });
    expect(next.soccerMatches[0].defenders.sort()).toEqual(['D2','D3','D4','M1'].sort());
  });
  it('GK 슬롯 교대 시 gk 갱신 + gkChange 1건', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 0, bIdx: 1 });
    const m = next.soccerMatches[0];
    expect(m.gk).toBe('D1');
    const gkc = m.events.filter(e => e.type === 'gkChange');
    expect(gkc).toHaveLength(1);
    expect(gkc[0].playerOut).toBe('GK1');
    expect(gkc[0].playerIn).toBe('D1');
  });
  it('非GK 교대 → gkChange 미추가(events 불변)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 2 });
    expect(next.soccerMatches[0].events).toHaveLength(0);
  });
  it('타 경기 무변경(격리)', () => {
    const s = base();
    const next = gameReducer(s, { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 1, bIdx: 5 });
    expect(next.soccerMatches[1]).toEqual(s.soccerMatches[1]);
  });
  it('동일 슬롯(aIdx===bIdx) → 안전(무변경)', () => {
    const next = gameReducer(base(), { type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx: 0, aIdx: 3, bIdx: 3 });
    expect(next.soccerMatches[0].assignments[3]).toBe('D3');
  });
});

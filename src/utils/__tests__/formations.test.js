import { describe, it, expect } from 'vitest';
import { swapFormationSlots } from '../formations';

const positions = [{ role: 'GK' }, { role: 'DF' }, { role: 'MF' }, { role: 'FW' }];

function base() {
  return {
    assignments: { 0: 'GK맨', 1: '수비수', 2: '미드', 3: '공격' },
    positionMap: { 'GK맨': 'GK', '수비수': 'DF', '미드': 'MF', '공격': 'FW' },
    gk: 'GK맨',
    positions,
  };
}

describe('swapFormationSlots — 출전 선수 위치 교대', () => {
  it('필드-필드 교대: 슬롯과 role이 서로 바뀌고 GK는 불변', () => {
    const r = swapFormationSlots(base(), 1, 2); // 수비수(DF) ↔ 미드(MF)
    expect(r.assignments).toEqual({ 0: 'GK맨', 1: '미드', 2: '수비수', 3: '공격' });
    expect(r.positionMap['수비수']).toBe('MF'); // 이동한 슬롯의 role을 가짐
    expect(r.positionMap['미드']).toBe('DF');
    expect(r.gk).toBe('GK맨');
  });

  it('GK 관여 교대: GK 슬롯에 들어온 선수가 새 GK, role도 교대', () => {
    const r = swapFormationSlots(base(), 0, 3); // GK맨(GK) ↔ 공격(FW)
    expect(r.assignments).toEqual({ 0: '공격', 1: '수비수', 2: '미드', 3: 'GK맨' });
    expect(r.gk).toBe('공격');
    expect(r.positionMap['공격']).toBe('GK');
    expect(r.positionMap['GK맨']).toBe('FW');
  });

  it('같은 슬롯이거나 빈 슬롯이면 no-op(입력 그대로 반환)', () => {
    const s = base();
    expect(swapFormationSlots(s, 1, 1).assignments).toBe(s.assignments);
    expect(swapFormationSlots(s, 1, 9).gk).toBe('GK맨'); // idx 9 없음
    expect(swapFormationSlots(s, 9, 1).assignments).toBe(s.assignments);
  });

  it('입력 객체를 변형하지 않는다(순수 함수)', () => {
    const s = base();
    const beforeA = { ...s.assignments };
    const beforePM = { ...s.positionMap };
    swapFormationSlots(s, 0, 3);
    expect(s.assignments).toEqual(beforeA);
    expect(s.positionMap).toEqual(beforePM);
    expect(s.gk).toBe('GK맨');
  });
});

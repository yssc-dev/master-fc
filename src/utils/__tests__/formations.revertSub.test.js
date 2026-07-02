import { describe, it, expect } from 'vitest';
import { revertSubInFormation } from '../formations';

// 교체(sub) 삭제 되돌리기 — 리듀서(DELETE_SOCCER_EVENT)와 레코더 로컬 state가
// 같은 로직을 공유해야 한다(레코더가 stale 스냅샷을 재push해 되돌림을 덮는 사고 방지).
describe('revertSubInFormation', () => {
  const base = () => ({
    assignments: { 0: 'GK1', 1: 'IN1' },
    positionMap: { GK1: 'GK', IN1: 'DF' },
    subs: ['BN1', 'OUT1'],
    gk: 'GK1',
  });
  const sub = { type: 'sub', playerOut: 'OUT1', playerIn: 'IN1', position: 'DF', posIdx: 1 };

  it('슬롯이 그대로면 배치/positionMap/subs 되돌림', () => {
    const r = revertSubInFormation(base(), sub);
    expect(r.assignments).toEqual({ 0: 'GK1', 1: 'OUT1' });
    expect(r.positionMap).toEqual({ GK1: 'GK', OUT1: 'DF' });
    expect(r.subs).toEqual(['BN1', 'IN1']);
    expect(r.gk).toBe('GK1');
  });

  it('GK 교체 되돌리면 gk 복원', () => {
    const st = { assignments: { 0: 'IN1' }, positionMap: { IN1: 'GK' }, subs: ['OUT1'], gk: 'IN1' };
    const r = revertSubInFormation(st, { ...sub, position: 'GK', posIdx: 0 });
    expect(r.gk).toBe('OUT1');
  });

  it('그 슬롯이 이후 바뀌었으면 null(오염 방지)', () => {
    const st = base();
    st.assignments[1] = 'SOMEONE_ELSE';
    expect(revertSubInFormation(st, sub)).toBeNull();
  });

  it('posIdx 없는 레거시 이벤트는 null', () => {
    expect(revertSubInFormation(base(), { ...sub, posIdx: undefined })).toBeNull();
  });
});

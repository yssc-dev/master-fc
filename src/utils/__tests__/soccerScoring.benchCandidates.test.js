import { describe, it, expect } from 'vitest';
import { getNonPlayers, getSubCandidates, keepLockedAttendees } from '../soccerScoring';

// 유저 정의: "참석자 전원에서 (스타팅멤버+교체출전자)를 제외한 나머지가 미출전".
// 핵심: 경기 생성 시점 스냅샷(m.subs)은 판정 근거가 아니다.
describe('getNonPlayers — 미출전 = 참석자 − 출전자', () => {
  it('참석자 중 출전 안 한 사람만 남긴다', () => {
    expect(getNonPlayers({ lineup: ['A', 'B'] }, ['A', 'B', 'C', 'D'])).toEqual(['C', 'D']);
  });

  it('경기 생성 후 참석 처리된 지각자도 후보로 나온다 (m.subs 무시)', () => {
    // 생성 시점 스냅샷엔 B가 없지만, 지금 참석자이므로 후보여야 한다 — 이 기능의 핵심.
    expect(getNonPlayers({ lineup: ['A'], subs: [] }, ['A', 'B'])).toEqual(['B']);
  });

  it('불참 처리된 벤치전용자는 m.subs에 남아 있어도 빠진다', () => {
    // C는 생성 시점 subs에 박혔지만 지금은 참석자가 아니므로 미출전이 아니다.
    expect(getNonPlayers({ lineup: ['A'], subs: ['C'] }, ['A', 'B'])).toEqual(['B']);
  });

  it('교체 투입된 선수는 출전이므로 미출전이 아니다', () => {
    const m = { lineup: ['A'], events: [{ type: 'sub', playerOut: 'A', playerIn: 'B' }] };
    expect(getNonPlayers(m, ['A', 'B', 'C'])).toEqual(['C']);
  });

  it('최종 배치(assignments)에만 있는 선수도 출전이다', () => {
    expect(getNonPlayers({ lineup: [], assignments: { 0: 'A' } }, ['A', 'B'])).toEqual(['B']);
  });

  it('휴식 경기(출전자 없음)는 참석자 전원이 미출전', () => {
    expect(getNonPlayers({ lineup: [], events: [] }, ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('attendees가 undefined/빈배열이면 빈배열 (표시 경로라 방어적)', () => {
    expect(getNonPlayers({ lineup: ['A'] }, undefined)).toEqual([]);
    expect(getNonPlayers({ lineup: ['A'] }, [])).toEqual([]);
  });
});

// 교체 후보는 미출전과 규칙이 다르다: 교체아웃된 선수는 출전자지만 재투입 가능해야 한다.
describe('getSubCandidates — 교체후보 = 참석자 − 피치위 − 퇴장자', () => {
  it('피치 위 선수는 후보가 아니다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A' }, [])).toEqual(['B']);
  });

  it('교체아웃된 선수는 후보로 복귀한다 (getNonPlayers와 다른 지점)', () => {
    // A는 lineup이라 '출전자'지만 피치를 떠났으므로 다시 넣을 수 있어야 한다.
    expect(getSubCandidates(['A', 'B'], { 0: 'B' }, [{ type: 'sub', playerOut: 'A', playerIn: 'B' }]))
      .toEqual(['A']);
  });

  it('레드카드 퇴장 선수는 후보가 아니다', () => {
    // 퇴장자는 assignments에서 지워지므로 onPitch에 없다 — expelled로 명시 배제해야 한다.
    expect(getSubCandidates(['A', 'B'], { 0: 'B' }, [{ type: 'redCard', player: 'A' }])).toEqual([]);
  });

  it('경기 도중 참석 처리된 지각자가 즉시 후보가 된다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A' }, [])).toEqual(['B']);
  });

  it('assignments의 빈 슬롯(null)은 무시한다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A', 1: null }, [])).toEqual(['B']);
  });

  it('events가 undefined여도 안전하다', () => {
    expect(getSubCandidates(['A', 'B'], { 0: 'A' }, undefined)).toEqual(['B']);
  });
});

// 해제 경로 3개 중 일괄 변경 2개(활동선수 전체 / 초기화)를 덮는다.
// 칩 탭(onToggle)은 SoccerApp에서 `if (locked.has(name)) return`으로 막고 브라우저 스모크로 확인.
describe('keepLockedAttendees — 일괄 변경에서 출전자 보존', () => {
  it('"활동선수 전체": 새 명단에 없는 출전자도 살아남는다', () => {
    // A가 오늘 뛰었는데 활동선수 목록엔 없는 경우(용병 등) — 조용히 빠지면 안 된다.
    expect(keepLockedAttendees(['B', 'C'], new Set(['A']))).toEqual(['B', 'C', 'A']);
  });

  it('"초기화": 출전자만 남는다', () => {
    expect(keepLockedAttendees([], new Set(['A', 'B']))).toEqual(['A', 'B']);
  });

  it('중복이 생기지 않는다', () => {
    expect(keepLockedAttendees(['A', 'B'], new Set(['A']))).toEqual(['A', 'B']);
  });

  it('잠금이 없으면 명단 그대로', () => {
    expect(keepLockedAttendees(['A', 'B'], new Set())).toEqual(['A', 'B']);
  });

  it('names가 undefined여도 안전하다', () => {
    expect(keepLockedAttendees(undefined, new Set(['A']))).toEqual(['A']);
  });
});

import { describe, it, expect } from 'vitest';
import { mergeAttendeesIntoRoster } from '../soccerScoring';

// 참석자 칩은 시즌 로스터(대시보드 시트)에서만 렌더돼 왔는데, 참석/출전 명단은
// 참석명단 시트에서 온다. 두 시트가 어긋나면 "참석자인데 칩이 없는 선수"가 생긴다.
// 실제 사례(2026-07-14 게임): 참석 24명 중 14명이 대시보드에 없어 토글 자체가 불가능했다.
describe('mergeAttendeesIntoRoster — 로스터에 없는 참석자도 칩을 갖는다', () => {
  const roster = [
    { name: '조재상', point: 42, games: 10 },
    { name: '차진옥', point: 24, games: 8 },
  ];

  it('로스터에 없는 참석자를 합성 항목으로 채운다', () => {
    const r = mergeAttendeesIntoRoster(roster, ['조재상', '황세원']);
    expect(r.map(p => p.name)).toEqual(['조재상', '차진옥', '황세원']);
  });

  it('합성 항목의 point/games는 0 — 대시보드 기준값을 알 수 없다', () => {
    const r = mergeAttendeesIntoRoster(roster, ['황세원']);
    expect(r.find(p => p.name === '황세원')).toEqual({ name: '황세원', point: 0, games: 0 });
  });

  it('games 0이라 "활동선수 전체"(games > 0 필터)에 안 잡힌다', () => {
    const r = mergeAttendeesIntoRoster(roster, ['황세원']);
    expect(r.filter(p => p.games > 0).map(p => p.name)).toEqual(['조재상', '차진옥']);
  });

  it('로스터에 이미 있는 참석자는 중복 추가하지 않는다', () => {
    const r = mergeAttendeesIntoRoster(roster, ['조재상', '차진옥']);
    expect(r).toHaveLength(2);
  });

  it('참석자 목록에 중복이 있어도 한 번만 추가한다', () => {
    const r = mergeAttendeesIntoRoster(roster, ['황세원', '황세원']);
    expect(r.filter(p => p.name === '황세원')).toHaveLength(1);
  });

  it('참석자가 없으면 로스터 그대로', () => {
    expect(mergeAttendeesIntoRoster(roster, [])).toEqual(roster);
  });

  it('원본 배열을 변형하지 않는다', () => {
    mergeAttendeesIntoRoster(roster, ['황세원']);
    expect(roster).toHaveLength(2);
  });

  it('undefined 입력에 안전하다', () => {
    expect(mergeAttendeesIntoRoster(undefined, ['황세원'])).toEqual([{ name: '황세원', point: 0, games: 0 }]);
    expect(mergeAttendeesIntoRoster(roster, undefined)).toEqual(roster);
  });
});

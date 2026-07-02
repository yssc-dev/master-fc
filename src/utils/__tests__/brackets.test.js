import { describe, it, expect } from 'vitest';
import { generate6Team2Court, generate6TeamSecondHalf } from '../brackets';

function restingTeams(round, teamCount = 6) {
  const playing = new Set(round.matches.flat());
  return Array.from({ length: teamCount }, (_, i) => i).filter(i => !playing.has(i));
}

describe('generate6Team2Court / generate6TeamSecondHalf', () => {
  it('R6에서 쉬는 팀은 항상 index 1, 4 (전반 스케줄은 고정)', () => {
    const { firstHalf } = generate6Team2Court();
    expect(restingTeams(firstHalf[5])).toEqual([1, 4]);
  });

  it('R6에 쉰 팀(1,4)이 상/하위 리그 3위(꼴찌)로 랭크되어도 R7에 다시 쉬지 않는다', () => {
    // rank1=0, rank2=2, rank3=1(R6에 쉼), rank4=3, rank5=5, rank6=4(R6에 쉼)
    const rankedIndices = [0, 2, 1, 3, 5, 4];
    const secondHalf = generate6TeamSecondHalf(rankedIndices);
    const r7Rest = restingTeams(secondHalf[0]);
    expect(r7Rest).not.toContain(1);
    expect(r7Rest).not.toContain(4);
  });

  it('상/하위 리그 각 그룹은 6라운드 동안 팀당 정확히 2회 휴식(공정성 유지)', () => {
    const rankedIndices = [0, 2, 1, 3, 5, 4];
    const secondHalf = generate6TeamSecondHalf(rankedIndices);
    const restCounts = {};
    secondHalf.forEach(round => {
      restingTeams(round).forEach(idx => { restCounts[idx] = (restCounts[idx] || 0) + 1; });
    });
    [0, 1, 2, 3, 4, 5].forEach(idx => {
      expect(restCounts[idx]).toBe(2);
    });
  });

  it('휴식 팀이 그룹 내에 없으면(모두 R6에 뛴 경우) 순위 순서를 그대로 유지', () => {
    // top3 그룹(rank1~3)에 1,4가 전혀 없는 경우: rank순서 그대로 [2,0,5] 사용
    const rankedIndices = [2, 0, 5, 1, 3, 4];
    const secondHalf = generate6TeamSecondHalf(rankedIndices);
    expect(secondHalf[0].matches[0]).toEqual([2, 0]);
  });

  it('R7 휴식팀은 가능하면 R5·R6를 모두 뛴 팀(2,5)을 우선 선택', () => {
    // top [2,0,3]: 0,3은 R5 휴식팀 → 2가 R7 휴식 / bottom [5,4,1]: 4,1은 R6 휴식팀 → 5가 R7 휴식
    const rankedIndices = [2, 0, 3, 5, 4, 1];
    const secondHalf = generate6TeamSecondHalf(rankedIndices);
    expect(restingTeams(secondHalf[0]).sort()).toEqual([2, 5]);
  });

  it('전수(720 순열) 불변식: 연속휴식 금지 + R5휴식팀 회피는 가능한 경우 항상 달성 + 경기수 보존', () => {
    const R5_REST = new Set([0, 3]); // 전반 고정 스케줄상 R5 휴식팀
    const R6_REST = new Set([1, 4]); // 전반 고정 스케줄상 R6 휴식팀
    const perms = (a) => a.length <= 1 ? [a] :
      a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
    perms([0, 1, 2, 3, 4, 5]).forEach(ranked => {
      const secondHalf = generate6TeamSecondHalf(ranked);
      // 1) R6 휴식팀은 R7에 절대 쉬지 않는다 (hard)
      const r7Rest = restingTeams(secondHalf[0]);
      r7Rest.forEach(t => expect(R6_REST.has(t)).toBe(false));
      // 2) 그룹에 R5·R6 모두 뛴 팀이 있으면 R5 휴식팀도 R7에 쉬지 않는다 (soft, 회피 가능 시 항상)
      [ranked.slice(0, 3), ranked.slice(3, 6)].forEach(group => {
        const hasIdeal = group.some(t => !R5_REST.has(t) && !R6_REST.has(t));
        const groupRester = r7Rest.find(t => group.includes(t));
        if (hasIdeal) expect(R5_REST.has(groupRester)).toBe(false);
      });
      // 3) 후반 6라운드 팀별 경기수 4, 휴식 2, 그룹 내 페어 2회씩
      const playCounts = {}, pairCounts = {};
      secondHalf.forEach(round => round.matches.forEach(([h, a]) => {
        playCounts[h] = (playCounts[h] || 0) + 1;
        playCounts[a] = (playCounts[a] || 0) + 1;
        const key = [h, a].sort().join('-');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }));
      [0, 1, 2, 3, 4, 5].forEach(t => expect(playCounts[t]).toBe(4));
      Object.values(pairCounts).forEach(c => expect(c).toBe(2));
    });
  });
});

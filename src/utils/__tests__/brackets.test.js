import { describe, it, expect } from 'vitest';
import { generate6Team2Court, generate6TeamSecondHalf, generate7Team2Court, generate8Team2Court, generate8TeamSecondHalf } from '../brackets';

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

describe('generate7Team2Court', () => {
  const sched = generate7Team2Court();

  it('11라운드: R1~R10은 2경기, R11은 1경기', () => {
    expect(sched).toHaveLength(11);
    sched.slice(0, 10).forEach(r => expect(r.matches).toHaveLength(2));
    expect(sched[10].matches).toHaveLength(1);
  });

  it('풀 라운드로빈: 21개 페어 정확히 1번씩 + 라운드 내 팀 중복 없음 + 팀당 6경기', () => {
    const pairCounts = {}, playCounts = {};
    sched.forEach(round => {
      const seen = new Set();
      round.matches.forEach(([h, a]) => {
        [h, a].forEach(t => {
          expect(seen.has(t)).toBe(false);
          seen.add(t);
          playCounts[t] = (playCounts[t] || 0) + 1;
        });
        const key = [h, a].sort().join('-');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      });
    });
    expect(Object.keys(pairCounts)).toHaveLength(21);
    Object.values(pairCounts).forEach(c => expect(c).toBe(1));
    [0, 1, 2, 3, 4, 5, 6].forEach(t => expect(playCounts[t]).toBe(6));
  });

  it('연속휴식은 마지막 1경기 라운드(R10→R11) 1팀뿐(수학적 최소), 최장 휴식 2라운드', () => {
    const events = [];
    for (let t = 0; t < 7; t++) {
      let run = 0;
      sched.forEach((round, ri) => {
        if (round.matches.flat().includes(t)) run = 0;
        else {
          run++;
          expect(run).toBeLessThanOrEqual(2);
          if (run === 2) events.push({ team: t, round: ri });
        }
      });
    }
    expect(events).toHaveLength(1);
    expect(events[0].round).toBe(10);
  });
});

describe('generate8Team2Court / generate8TeamSecondHalf', () => {
  const { firstHalf, needsMidSplit } = generate8Team2Court();

  it('전반 6라운드×2경기, needsMidSplit=true', () => {
    expect(needsMidSplit).toBe(true);
    expect(firstHalf).toHaveLength(6);
    firstHalf.forEach(r => expect(r.matches).toHaveLength(2));
  });

  it('코트A=0~3팀(A조), 코트B=4~7팀(B조), 조내 싱글RR(팀당 3경기, 페어 1번씩)', () => {
    const pairCounts = {}, playCounts = {};
    firstHalf.forEach(round => {
      expect(round.matches[0].every(t => t <= 3)).toBe(true);
      expect(round.matches[1].every(t => t >= 4)).toBe(true);
      round.matches.forEach(([h, a]) => {
        playCounts[h] = (playCounts[h] || 0) + 1;
        playCounts[a] = (playCounts[a] || 0) + 1;
        const key = [h, a].sort().join('-');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      });
    });
    expect(Object.keys(pairCounts)).toHaveLength(12); // 조당 C(4,2)=6 × 2조
    Object.values(pairCounts).forEach(c => expect(c).toBe(1));
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(t => expect(playCounts[t]).toBe(3));
  });

  it('전반 연속휴식은 팀당 최대 1회, 총 4회(조당 2회 = 4팀 1코트 RR의 수학적 최소)', () => {
    let events = 0;
    for (let t = 0; t < 8; t++) {
      let run = 0;
      firstHalf.forEach(round => {
        if (round.matches.flat().includes(t)) run = 0;
        else {
          run++;
          expect(run).toBeLessThanOrEqual(2);
          if (run === 2) events++;
        }
      });
    }
    expect(events).toBe(4);
  });

  it('후반 순위 그대로일 때 R6 휴식팀(0,3,4,7)은 R7에 뛴다', () => {
    const secondHalf = generate8TeamSecondHalf([0, 1, 2, 3, 4, 5, 6, 7]);
    const r7Playing = new Set(secondHalf[0].matches.flat());
    [0, 3, 4, 7].forEach(t => expect(r7Playing.has(t)).toBe(true));
  });

  it('전수(8! = 40320 순열) 불변식: 그룹 유지 + 팀당 3경기·페어 1회 + R7 연속휴식 최소 달성', () => {
    const r6Playing = new Set(firstHalf[5].matches.flat()); // 전반 R6 출전팀
    const permsOf = (a) => a.length <= 1 ? [a] :
      a.flatMap((x, i) => permsOf([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
    const violations = [];

    permsOf([0, 1, 2, 3, 4, 5, 6, 7]).forEach(ranked => {
      const topSet = new Set(ranked.slice(0, 4));
      const botSet = new Set(ranked.slice(4, 8));
      const secondHalf = generate8TeamSecondHalf(ranked);

      if (secondHalf.length !== 6) { violations.push(['rounds', ranked]); return; }
      const playCounts = {}, pairCounts = {};
      let ok = true;
      secondHalf.forEach(round => {
        const [topM, botM] = round.matches;
        if (!topM.every(t => topSet.has(t)) || !botM.every(t => botSet.has(t))) ok = false;
        round.matches.forEach(([h, a]) => {
          playCounts[h] = (playCounts[h] || 0) + 1;
          playCounts[a] = (playCounts[a] || 0) + 1;
          const key = [h, a].sort().join('-');
          pairCounts[key] = (pairCounts[key] || 0) + 1;
        });
      });
      if (!ok) { violations.push(['group-mix', ranked]); return; }
      if (![...Array(8).keys()].every(t => playCounts[t] === 3)) { violations.push(['playCount', ranked]); return; }
      if (!Object.values(pairCounts).every(c => c === 1)) { violations.push(['pairCount', ranked]); return; }

      // R7 연속휴식(R6 휴식팀이 R7에도 휴식) 횟수가 그룹 구성상 최소인지:
      // 그룹 내 R6 출전팀 k명 → R7 휴식 2자리 중 최소 max(0, 2-k)명은 R6 휴식팀
      const r7Playing = new Set(secondHalf[0].matches.flat());
      [ranked.slice(0, 4), ranked.slice(4, 8)].forEach(group => {
        const k = group.filter(t => r6Playing.has(t)).length;
        const consec = group.filter(t => !r7Playing.has(t) && !r6Playing.has(t)).length;
        if (consec !== Math.max(0, 2 - k)) violations.push(['r7-rest', ranked, group, consec]);
      });
    });

    expect(violations.slice(0, 5)).toEqual([]);
  });

  it('후반 내부 연속휴식(조당 2회 불가피)은 가능하면 전반 연속휴식 팀을 피해서 배치', () => {
    // 전반 연속휴식 팀 = 1,2,5,6 (R6 출전팀과 동일 집합)
    // 그룹 [0,3,1,2]: R7휴식(q2,q3)=1,2로 경계 위반 0 + 내부 이중휴식 q1=3(전반 무휴식팀) 배치
    const secondHalf = generate8TeamSecondHalf([0, 3, 1, 2, 4, 7, 5, 6]);
    // 순위 안정성: 해당 배치가 이미 최적이면 순위 순서 유지 → R7 = [0,3], [4,7]
    expect(secondHalf[0].matches).toEqual([[0, 3], [4, 7]]);
    // 팀0(전반 연속휴식 없음)이 내부 이중휴식 자리(q1: R8·R9 휴식)가 아닌 q0에 유지되는지는
    // 스택 방지 소프트 규칙: q1·q2 중 전반 연속휴식 팀 수가 최소인지 전 그룹 대상 검증
    const S = new Set([1, 2, 5, 6]);
    const permsOf = (a) => a.length <= 1 ? [a] :
      a.flatMap((x, i) => permsOf([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
    // 대표 그룹 구성 몇 가지: S 소속 수 k=0..4
    [[0, 3, 4, 7, 1, 2, 5, 6], [1, 0, 3, 4, 2, 5, 6, 7], [1, 2, 0, 3, 5, 6, 4, 7], [1, 2, 5, 0, 6, 3, 4, 7], [1, 2, 5, 6, 0, 3, 4, 7]].forEach(ranked => {
      const sh = generate8TeamSecondHalf(ranked);
      [0, 1].forEach(g => {
        const group = g === 0 ? ranked.slice(0, 4) : ranked.slice(4, 8);
        // 위치 복원: q0=R7∩R9 경기 공통팀, q1=R7의 나머지, q2=R9의 나머지, q3=마지막
        const m7 = sh[0].matches[g], m9 = sh[2].matches[g];
        const q0 = m7.find(t => m9.includes(t));
        const q1 = m7.find(t => t !== q0);
        const q2 = m9.find(t => t !== q0);
        const q3 = group.find(t => ![q0, q1, q2].includes(t));
        // 참조 구현: (1순위) R6휴식팀의 q2/q3 배제 (2순위) 전반 연속휴식팀의 q1/q2 배제
        let bestScore = Infinity;
        permsOf(group).forEach(o => {
          const boundary = (S.has(o[2]) ? 0 : 1) + (S.has(o[3]) ? 0 : 1); // S=R6출전팀
          const stacking = (S.has(o[1]) ? 1 : 0) + (S.has(o[2]) ? 1 : 0);
          bestScore = Math.min(bestScore, boundary * 10 + stacking);
        });
        const chosenScore = ((S.has(q2) ? 0 : 1) + (S.has(q3) ? 0 : 1)) * 10 + ((S.has(q1) ? 1 : 0) + (S.has(q2) ? 1 : 0));
        expect(chosenScore).toBe(bestScore);
      });
    });
  });
});

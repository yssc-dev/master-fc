// 4팀 2코트 — 4×라운드로빈 12라운드
// 팀번호: 0,1,2,3 (시트의 1~4번 팀에 순서대로 매핑)
export function generate4Team2Court() {
  return [
    { matches: [[0,1], [2,3]] },  // R1
    { matches: [[0,2], [1,3]] },  // R2
    { matches: [[0,3], [1,2]] },  // R3
    { matches: [[0,1], [2,3]] },  // R4
    { matches: [[0,2], [1,3]] },  // R5
    { matches: [[0,3], [1,2]] },  // R6
    { matches: [[2,3], [0,1]] },  // R7
    { matches: [[1,3], [0,2]] },  // R8
    { matches: [[1,2], [0,3]] },  // R9
    { matches: [[2,3], [0,1]] },  // R10
    { matches: [[1,3], [0,2]] },  // R11
    { matches: [[1,2], [0,3]] },  // R12
  ];
}

// 5팀 2코트 — 더블 라운드로빈 10라운드 (매 라운드 1팀 휴식)
// 팀번호: 0,1,2,3,4 (시트의 1~5번 팀에 순서대로 매핑)
export function generate5Team2Court() {
  return [
    { matches: [[0,1], [2,3]] },  // R1  (팀4 휴식)
    { matches: [[0,2], [1,4]] },  // R2  (팀3 휴식)
    { matches: [[0,3], [2,4]] },  // R3  (팀1 휴식)
    { matches: [[0,4], [1,3]] },  // R4  (팀2 휴식)
    { matches: [[1,2], [3,4]] },  // R5  (팀0 휴식)
    { matches: [[2,3], [0,1]] },  // R6  (팀4 휴식)
    { matches: [[1,4], [0,2]] },  // R7  (팀3 휴식)
    { matches: [[2,4], [0,3]] },  // R8  (팀1 휴식)
    { matches: [[1,3], [0,4]] },  // R9  (팀2 휴식)
    { matches: [[3,4], [1,2]] },  // R10 (팀0 휴식)
  ];
}

// 6팀 2코트 — 그룹 스플릿 12라운드
// 전반 6R: 1~3팀(A조) vs 4~6팀(B조) 동시 진행
// 후반 6R: 전반 순위 기준 재편성 (상위3 vs 하위3)
// 전반 스케줄만 반환. 후반은 confirmRound에서 순위 기반으로 생성
export function generate6Team2Court() {
  const firstHalf = [
    { matches: [[0,1], [3,4]] },  // R1
    { matches: [[1,2], [4,5]] },  // R2
    { matches: [[2,0], [5,3]] },  // R3
    { matches: [[0,1], [3,4]] },  // R4
    { matches: [[1,2], [4,5]] },  // R5
    { matches: [[2,0], [5,3]] },  // R6
  ];
  return { firstHalf, needsMidSplit: true };
}

// 전반 고정 스케줄에서 해당 라운드 휴식팀을 도출 — fixture 테이블이 바뀌면 자동 추종
function restersOf(round) {
  const playing = new Set(round.matches.flat());
  return new Set([0, 1, 2, 3, 4, 5].filter(i => !playing.has(i)));
}
const FIRST_HALF_6T = generate6Team2Court().firstHalf;
const RESTED_AT_R5 = restersOf(FIRST_HALF_6T[4]);
const RESTED_AT_R6 = restersOf(FIRST_HALF_6T[5]);

// 순위순 3팀 [x0,x1,x2]을 회전시켜 후반 첫 라운드(R7) 휴식 자리(마지막 자리)를 조정:
// (hard) R6 휴식팀은 배제 — 연속 휴식 금지
// (soft) 가능하면 R5·R6 모두 뛴 팀을 우선 배치
function rotateForR7Rest(group) {
  let fallback = null;
  for (let rot = 0; rot < group.length; rot++) {
    const rotated = [...group.slice(rot), ...group.slice(0, rot)];
    if (RESTED_AT_R6.has(rotated[2])) continue;
    if (!RESTED_AT_R5.has(rotated[2])) return rotated;
    if (!fallback) fallback = rotated;
  }
  // R6 휴식팀은 2팀뿐이라 3회전 중 최소 1회는 hard 조건을 통과 → fallback 항상 존재
  return fallback;
}

// 6팀 후반 스케줄 생성 (순위 기반 재매핑)
// rankedIndices = [1위팀idx, 2위팀idx, ..., 6위팀idx]
export function generate6TeamSecondHalf(rankedIndices) {
  const top = rotateForR7Rest(rankedIndices.slice(0, 3));
  const bottom = rotateForR7Rest(rankedIndices.slice(3, 6));
  const r = [...top, ...bottom]; // r[0..2]=상위리그(회전됨), r[3..5]=하위리그(회전됨)
  return [
    { matches: [[r[0],r[1]], [r[3],r[4]]] },  // R7
    { matches: [[r[1],r[2]], [r[4],r[5]]] },  // R8
    { matches: [[r[2],r[0]], [r[5],r[3]]] },  // R9
    { matches: [[r[0],r[1]], [r[3],r[4]]] },  // R10
    { matches: [[r[1],r[2]], [r[4],r[5]]] },  // R11
    { matches: [[r[2],r[0]], [r[5],r[3]]] },  // R12
  ];
}

// 7팀 2코트 — 풀 싱글 라운드로빈 11라운드 (R11은 1경기)
// 팀당 6경기 균등, 모든 페어 1회. 연속휴식은 R10→R11 1팀뿐(전수 탐색상 수학적 최소, 0회는 불가능)
export function generate7Team2Court() {
  return [
    { matches: [[0,1], [2,3]] },  // R1  (휴식: 4,5,6)
    { matches: [[0,4], [5,6]] },  // R2  (휴식: 1,2,3)
    { matches: [[0,2], [1,3]] },  // R3  (휴식: 4,5,6)
    { matches: [[1,5], [4,6]] },  // R4  (휴식: 0,2,3)
    { matches: [[0,3], [2,4]] },  // R5  (휴식: 1,5,6)
    { matches: [[1,6], [2,5]] },  // R6  (휴식: 0,3,4)
    { matches: [[0,5], [3,4]] },  // R7  (휴식: 1,2,6)
    { matches: [[1,4], [2,6]] },  // R8  (휴식: 0,3,5)
    { matches: [[0,6], [3,5]] },  // R9  (휴식: 1,2,4)
    { matches: [[1,2], [4,5]] },  // R10 (휴식: 0,3,6)
    { matches: [[3,6]] },         // R11 (1경기, 휴식: 0,1,2,4,5)
  ];
}

// 8팀 2코트 — 그룹 스플릿 12라운드 (6팀 방식의 4팀 조 확장)
// 전반 6R: 1~4팀(A조)·5~8팀(B조) 코트별 조내 싱글RR 동시 진행
// 후반 6R: 전반 순위 기준 재편성(상위4/하위4). 전반 스케줄만 반환, 후반은 confirmRound에서 생성
// 조내 경기 순서는 연속휴식 최소 배열(팀당 최대 1회, 조당 2회 — 4팀 1코트 RR에서 0회는 불가능)
export function generate8Team2Court() {
  const firstHalf = [
    { matches: [[0,1], [4,5]] },  // R1
    { matches: [[2,3], [6,7]] },  // R2
    { matches: [[0,2], [4,6]] },  // R3
    { matches: [[1,3], [5,7]] },  // R4
    { matches: [[0,3], [4,7]] },  // R5
    { matches: [[1,2], [5,6]] },  // R6
  ];
  return { firstHalf, needsMidSplit: true };
}

// 전반 고정 스케줄에서 도출 — fixture 테이블이 바뀌면 자동 추종
const FIRST_HALF_8T = generate8Team2Court().firstHalf;
// R6 출전팀. R6 휴식팀이 R7에도 쉬면 연속휴식이 되므로 후반 첫 라운드 휴식자리에서 배제 대상
const R6_PLAYING_8T = new Set(FIRST_HALF_8T[5].matches.flat());
// 전반에 이미 연속휴식을 겪은 팀 — 후반 내부 연속휴식 자리에 다시 배치하지 않는다
const FH_DOUBLE_RESTED_8T = (() => {
  const out = new Set();
  for (let t = 0; t < 8; t++) {
    let run = 0;
    FIRST_HALF_8T.forEach(round => {
      if (round.matches.flat().includes(t)) run = 0;
      else if (++run >= 2) out.add(t);
    });
  }
  return out;
})();

const PERMS4 = (() => {
  const out = [];
  const rec = (rest, acc) => rest.length === 0
    ? out.push(acc)
    : rest.forEach((x, i) => rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  rec([0, 1, 2, 3], []);
  return out;
})();

// 순위순 4팀을 후반 패턴 위치 [q0,q1,q2,q3]에 배치.
// 패턴상 R7 휴식 = q2,q3 / 내부 연속휴식 = q1(R8·R9), q2(R10·R11)
// R7 출전 우선순위 규칙: R6 휴식팀 > R5 휴식팀 > R5·R6 연속 출전팀(후순위=휴식).
// 8팀 전반 fixture는 R5 휴식(1,2,5,6)과 R6 휴식(0,3,4,7)이 정확히 보완 관계라
// R5·R6 연속 출전팀이 존재하지 않음 → "R6 출전팀을 R7 휴식으로" = "R5 휴식팀을 R7 휴식으로"와 동치.
// (1순위) R6 휴식팀을 q2,q3에서 배제 — R6→R7 연속휴식 방지, 그룹 구성상 불가피하면 최소화
// (2순위) 전반 연속휴식 팀을 q1,q2에서 배제 — 한 팀에 연속휴식 2회 누적 방지
// (동점) 순위 순서 유지 (PERMS4가 사전순이라 첫 최소 스코어 = 순위순에 가장 가까운 배치)
function orderGroupForSecondHalf(group) {
  let best = null, bestScore = Infinity;
  for (const p of PERMS4) {
    const o = [group[p[0]], group[p[1]], group[p[2]], group[p[3]]];
    const boundary = (R6_PLAYING_8T.has(o[2]) ? 0 : 1) + (R6_PLAYING_8T.has(o[3]) ? 0 : 1);
    const stacking = (FH_DOUBLE_RESTED_8T.has(o[1]) ? 1 : 0) + (FH_DOUBLE_RESTED_8T.has(o[2]) ? 1 : 0);
    const score = boundary * 10 + stacking;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

// 8팀 후반 스케줄 생성 (순위 기반 재매핑)
// rankedIndices = [1위팀idx, ..., 8위팀idx] → 상위4 = A코트, 하위4 = B코트
export function generate8TeamSecondHalf(rankedIndices) {
  const top = orderGroupForSecondHalf(rankedIndices.slice(0, 4));
  const bot = orderGroupForSecondHalf(rankedIndices.slice(4, 8));
  const pattern = [[0,1], [2,3], [0,2], [1,3], [0,3], [1,2]]; // 전반과 동일한 연속휴식 최소 배열
  return pattern.map(([x, y]) => ({ matches: [[top[x], top[y]], [bot[x], bot[y]]] }));
}

// N팀 1코트 — 라운드로빈 × 회전수
export function generateRoundRobin(teamIndices) {
  const n = teamIndices.length;
  if (n < 2) return [];
  const t = [...teamIndices];
  if (n % 2 !== 0) t.push(-1);
  const rounds = [];
  for (let r = 0; r < t.length - 1; r++) {
    const round = [];
    for (let i = 0; i < t.length / 2; i++) {
      const h = t[i], a = t[t.length - 1 - i];
      if (h !== -1 && a !== -1) round.push([h, a]);
    }
    rounds.push(round);
    const last = t.pop();
    t.splice(1, 0, last);
  }
  return rounds;
}

export function generate1Court(teamCount, rotations) {
  const rr = generateRoundRobin(Array.from({ length: teamCount }, (_, i) => i));
  const s = [];
  for (let rot = 0; rot < rotations; rot++) rr.forEach(r => r.forEach(m => s.push({ matches: [m] })));
  return s;
}

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

// 6팀 후반 스케줄 생성 (순위 기반 재매핑)
// rankedIndices = [1위팀idx, 2위팀idx, ..., 6위팀idx]
export function generate6TeamSecondHalf(rankedIndices) {
  const r = rankedIndices; // r[0]=1위, r[1]=2위, ... r[5]=6위
  return [
    { matches: [[r[0],r[1]], [r[3],r[4]]] },  // R7
    { matches: [[r[1],r[2]], [r[4],r[5]]] },  // R8
    { matches: [[r[2],r[0]], [r[5],r[3]]] },  // R9
    { matches: [[r[0],r[1]], [r[3],r[4]]] },  // R10
    { matches: [[r[1],r[2]], [r[4],r[5]]] },  // R11
    { matches: [[r[2],r[0]], [r[5],r[3]]] },  // R12
  ];
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

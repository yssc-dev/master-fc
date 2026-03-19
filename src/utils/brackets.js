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

export function generate4Team2Court() {
  const rr = generateRoundRobin([0, 1, 2, 3]);
  const s = [];
  for (let rot = 0; rot < 4; rot++) rr.forEach(r => s.push({ matches: r }));
  return s;
}

export function generate5Team2Court() {
  const rr = generateRoundRobin([0, 1, 2, 3, 4]);
  const s = [];
  for (let rot = 0; rot < 2; rot++) rr.forEach(r => s.push({ matches: r }));
  return s;
}

export function generate6Team2Court() {
  const rrA = generateRoundRobin([0, 1, 2]);
  const rrB = generateRoundRobin([3, 4, 5]);
  const firstHalf = [];
  for (let rot = 0; rot < 2; rot++) {
    for (let i = 0; i < rrA.length; i++) {
      firstHalf.push({ matches: [...rrA[i], ...rrB[i]], phase: "first" });
    }
  }
  return { firstHalf, needsMidSplit: true };
}

export function generate1Court(teamCount, rotations) {
  const rr = generateRoundRobin(Array.from({ length: teamCount }, (_, i) => i));
  const s = [];
  for (let rot = 0; rot < rotations; rot++) rr.forEach(r => r.forEach(m => s.push({ matches: [m] })));
  return s;
}

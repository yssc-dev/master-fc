// P3: 선수별 라운드 G+A 회귀선 기울기.
// 활동(ga≥1) 라운드만 표본으로 사용. 활동하지 않은 라운드는 표본 제외(풋살 출전 미확정 보정).

const ROUND_RX = /^R(\d+)_/;

function parseRoundIdx(matchId) {
  if (typeof matchId !== 'string') return null;
  const m = matchId.match(ROUND_RX);
  return m ? Number(m[1]) : null;
}

function linearSlope(points) {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0, sumY = 0;
  for (const p of points) { sumX += p.round_idx; sumY += p.ga; }
  const mx = sumX / n, my = sumY / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.round_idx - mx) * (p.ga - my);
    den += (p.round_idx - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function calcRoundSlope({ eventLogs, threshold = 10 }) {
  // (player, date, round_idx) → ga (goal=1 점수자, assist=1 어시제공자, owngoal 무시)
  const tally = {};   // tally[player][`${date}|${round_idx}`] = ga
  const dateOf = {};  // dateOf[player][`${date}|${round_idx}`] = date

  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;          // owngoal은 제외
    const ridx = parseRoundIdx(e.match_id);
    if (ridx == null) continue;
    const date = e.date || '';
    const key = `${date}|${ridx}`;

    const scorer = e.player;
    if (scorer) {
      if (!tally[scorer]) { tally[scorer] = {}; dateOf[scorer] = {}; }
      tally[scorer][key] = (tally[scorer][key] || 0) + 1;
      dateOf[scorer][key] = date;
    }
    const assist = e.related_player;
    if (assist) {
      if (!tally[assist]) { tally[assist] = {}; dateOf[assist] = {}; }
      tally[assist][key] = (tally[assist][key] || 0) + 1;
      dateOf[assist][key] = date;
    }
  }

  const perPlayer = {};
  for (const player of Object.keys(tally)) {
    const points = Object.entries(tally[player]).map(([key, ga]) => {
      const round_idx = Number(key.split('|')[1]);
      return { date: dateOf[player][key], round_idx, ga };
    });
    points.sort((a, b) => (a.date.localeCompare(b.date)) || (a.round_idx - b.round_idx));

    const sumByRound = {}, cntByRound = {};
    for (const p of points) {
      sumByRound[p.round_idx] = (sumByRound[p.round_idx] || 0) + p.ga;
      cntByRound[p.round_idx] = (cntByRound[p.round_idx] || 0) + 1;
    }
    const meanByRound = {};
    for (const r of Object.keys(sumByRound)) meanByRound[r] = sumByRound[r] / cntByRound[r];

    perPlayer[player] = {
      points,
      sampleCount: points.length,
      slope: linearSlope(points),
      meanByRound,
    };
  }

  const lateBloomers = [];
  const earlyBirds = [];
  for (const player of Object.keys(perPlayer)) {
    const { slope, sampleCount } = perPlayer[player];
    if (sampleCount < threshold || slope == null) continue;
    if (slope > 0) lateBloomers.push({ player, slope, sampleCount });
    else if (slope < 0) earlyBirds.push({ player, slope, sampleCount });
  }
  lateBloomers.sort((a, b) => b.slope - a.slope || a.player.localeCompare(b.player, 'ko'));
  earlyBirds.sort((a, b) => a.slope - b.slope || a.player.localeCompare(b.player, 'ko'));

  return { perPlayer, ranking: { lateBloomers, earlyBirds } };
}

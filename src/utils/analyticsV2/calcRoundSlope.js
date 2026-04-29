// P3: 선수별 라운드 G+A 회귀선 기울기.
// 활동(ga≥1) 라운드만 표본으로 사용. 활동하지 않은 라운드는 표본 제외(풋살 출전 미확정 보정).
//
// round_idx 출처:
// 1순위) matchLogs(로그_매치)에 (date, match_id) 조인해서 round_idx 컬럼 직접 사용 (정규화된 진실 소스)
// 2순위) match_id 문자열에서 `R{n}_C{n}` 패턴 fallback (legacy 데이터 + matchLogs 미제공 호환)

const ROUND_RX = /^R(\d+)_/;

function parseRoundIdxFromString(matchId) {
  if (typeof matchId !== 'string') return null;
  const m = matchId.match(ROUND_RX);
  return m ? Number(m[1]) : null;
}

function buildRoundIdxLookup(matchLogs) {
  const lookup = new Map();
  for (const m of matchLogs || []) {
    const date = m.date || '';
    const mid = m.match_id || '';
    const ridx = Number(m.round_idx);
    if (!Number.isFinite(ridx)) continue;
    lookup.set(`${date}|${mid}`, ridx);
  }
  return lookup;
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

export function calcRoundSlope({ eventLogs, matchLogs, threshold = 10 }) {
  const lookup = buildRoundIdxLookup(matchLogs);
  // (player, date, round_idx) → ga (goal=1 점수자, assist=1 어시제공자, owngoal 무시)
  const tally = {};   // tally[player][`${date}|${round_idx}`] = ga

  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;          // owngoal은 제외
    const date = e.date || '';
    const mid = e.match_id || '';
    const ridx = lookup.get(`${date}|${mid}`) ?? parseRoundIdxFromString(mid);
    if (ridx == null) continue;
    const key = `${date}|${ridx}`;

    const scorer = e.player;
    if (scorer) {
      if (!tally[scorer]) tally[scorer] = {};
      tally[scorer][key] = (tally[scorer][key] || 0) + 1;
    }
    const assist = e.related_player;
    if (assist) {
      if (!tally[assist]) tally[assist] = {};
      tally[assist][key] = (tally[assist][key] || 0) + 1;
    }
  }

  const perPlayer = {};
  for (const player of Object.keys(tally)) {
    const points = Object.entries(tally[player]).map(([key, ga]) => {
      const [date, roundStr] = key.split('|');
      return { date, round_idx: Number(roundStr), ga };
    });
    points.sort((a, b) => (a.date.localeCompare(b.date)) || (a.round_idx - b.round_idx));

    const sumByRound = {}, cntByRound = {};
    for (const p of points) {
      sumByRound[p.round_idx] = (sumByRound[p.round_idx] || 0) + p.ga;
      cntByRound[p.round_idx] = (cntByRound[p.round_idx] || 0) + 1;
    }
    const meanByRound = {};
    for (const r of Object.keys(sumByRound)) meanByRound[Number(r)] = sumByRound[r] / cntByRound[r];

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

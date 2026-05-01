// P3: 선수별 라운드 G+A 회귀선 기울기 — "초반 강자 vs 후반 폭격기" 성향 지표.
//
// 정의:
//   각 (date, round_idx) 매치마다 — 그 라운드에 출전한(매치 로스터에 포함된) 선수들에게
//   ga = 골 + 어시 (그 라운드의 합) 를 부여. 출전했지만 0 G+A인 라운드도 ga=0 표본으로 포함.
//   round_idx vs ga 선형회귀 기울기로 라운드 진행에 따른 추세를 측정.
//   기울기 > 0 → 후반 폭격기, < 0 → 초반 강자.
//
// 출전 판별 (풋살 라운드별 정확한 5인 명단 부재 보정):
//   matchLogs.our_members_json / opponent_members_json 의 팀 로스터를 baseline으로 사용.
//   "그 라운드에 그 팀이 뛰었으니 골 기회가 있었음"으로 간주.
//
// round_idx 출처:
//   1순위) matchLogs(date, match_id) join → round_idx 컬럼
//   2순위) match_id 정규식 폴백 ([RPF]{n}_C{m}) — schedule/push/free 모두 지원

const ROUND_RX = /^[RPF](\d+)_/;

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
    const raw = m.round_idx;
    if (raw === null || raw === undefined || raw === '') continue;
    const ridx = Number(raw);
    if (!Number.isFinite(ridx)) continue;
    lookup.set(`${date}|${mid}`, ridx);
  }
  return lookup;
}

function safeJSONArray(s) {
  if (Array.isArray(s)) return s;
  if (typeof s !== 'string' || !s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
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

function resolveRoundIdx(lookup, date, matchId) {
  const v = lookup.get(`${date}|${matchId}`);
  if (v !== undefined) return v;
  return parseRoundIdxFromString(matchId);
}

export function calcRoundSlope({ eventLogs, matchLogs, threshold = 10 }) {
  const lookup = buildRoundIdxLookup(matchLogs);

  // 1단계: 출전 baseline 구축. tally[player][`${date}|${round_idx}`] = 0 (출전했지만 미스코어)
  const tally = {};
  for (const m of matchLogs || []) {
    const date = m.date || '';
    const mid = m.match_id || '';
    const ridx = resolveRoundIdx(lookup, date, mid);
    if (ridx == null) continue;
    const ours = safeJSONArray(m.our_members_json);
    const opps = safeJSONArray(m.opponent_members_json);
    const key = `${date}|${ridx}`;
    for (const p of ours) {
      if (!p) continue;
      if (!tally[p]) tally[p] = {};
      if (tally[p][key] === undefined) tally[p][key] = 0;
    }
    for (const p of opps) {
      if (!p) continue;
      if (!tally[p]) tally[p] = {};
      if (tally[p][key] === undefined) tally[p][key] = 0;
    }
  }

  // 2단계: 골/어시 이벤트로 ga 가중치 누적 (owngoal 제외)
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const date = e.date || '';
    const mid = e.match_id || '';
    const ridx = resolveRoundIdx(lookup, date, mid);
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

    const activeCount = points.reduce((s, p) => s + (p.ga > 0 ? 1 : 0), 0);

    perPlayer[player] = {
      points,
      sampleCount: points.length,    // 출전 라운드 수
      activeCount,                   // ga≥1 라운드 수 (참고용)
      slope: linearSlope(points),
      meanByRound,
    };
  }

  const lateBloomers = [];
  const earlyBirds = [];
  for (const player of Object.keys(perPlayer)) {
    const { slope, sampleCount, activeCount } = perPlayer[player];
    // 표본 부족 (출전 라운드 < threshold) 또는 G+A 활동 자체가 없으면 추세 의미 없음
    if (sampleCount < threshold || slope == null || activeCount < 2) continue;
    if (slope > 0) lateBloomers.push({ player, slope, sampleCount });
    else if (slope < 0) earlyBirds.push({ player, slope, sampleCount });
  }
  lateBloomers.sort((a, b) => b.slope - a.slope || a.player.localeCompare(b.player, 'ko'));
  earlyBirds.sort((a, b) => a.slope - b.slope || a.player.localeCompare(b.player, 'ko'));

  return { perPlayer, ranking: { lateBloomers, earlyBirds } };
}

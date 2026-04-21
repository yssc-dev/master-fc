// match_id 포맷 정규화 + 표준 match_id 생성
// 풋살 표준: R{round_idx}_C{court_id} (court 0-indexed)
// 축구 표준: String(match_idx) (1부터 시작)

export function normalizeMatchId(raw, sport) {
  if (raw === null || raw === undefined || raw === '') return raw;
  const s = String(raw).trim();

  if (/^R\d+_C\d+$/.test(s)) return s;

  const m1 = s.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m1) return `R${m1[1]}_C${parseInt(m1[2], 10) - 1}`;

  const m2 = s.match(/^(\d+)경기$/);
  const n = m2 ? m2[1] : (/^\d+$/.test(s) ? s : null);
  if (n !== null) {
    return sport === '풋살' ? `R${n}_C0` : n;
  }

  return s;
}

export function buildStandardMatchId({ sport, round_idx, court_id, match_idx }) {
  if (sport === '풋살') return `R${round_idx}_C${court_id ?? 0}`;
  return String(match_idx);
}

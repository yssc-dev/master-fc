#!/usr/bin/env node
// 풀 검증: 마스터FC 포인트 로그 / 선수별집계기록 로그 ↔ 로그_이벤트 / 로그_선수경기 / 로그_매치
// 모든 지표 (games, field_games, goals, assists, owngoals, conceded, cleansheets,
// keeper_games, crova, goguma, 역주행, rank_score) 일치 여부 검증.
// 단순 else-if 기대치가 아닌 "진짜 truth" 기대치도 같이 산출.

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEAM = '마스터FC';
const SPORT = '풋살';
const POINT_SHEET = '마스터FC 포인트 로그';
const PLAYER_SHEET = '마스터FC 선수별집계기록 로그';

async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
const norm = (s) => String(s ?? '').trim();
const num = (v) => Number(v) || 0;

// 원본 match_id → 신규 match_id 정규화 (apps-script와 동일 규칙)
function normMatchId(raw) {
  const s = norm(raw);
  if (!s) return s;
  if (/^R\d+_C\d+$/.test(s)) return s;
  let m = s.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m) return `R${m[1]}_C${parseInt(m[2], 10) - 1}`;
  m = s.match(/^(\d+)라운드\s+([AB])구장$/);
  if (m) return `R${m[1]}_C${m[2] === 'A' ? 0 : 1}`;
  m = s.match(/^(\d+)경기$/);
  if (m) return `R${m[1]}_C0`;
  if (/^\d+$/.test(s)) return `R${s}_C0`;
  return s;
}

(async () => {
  console.log(`[verifyAll] ${TEAM} / ${SPORT} (${new Date().toISOString()})\n`);

  const [pointRes, playerRes, eventsRes, pgRes, mtRes] = await Promise.all([
    call({ action: 'getPointLog', team: TEAM, pointLogSheet: POINT_SHEET }),
    call({ action: 'getPlayerLog', team: TEAM, playerLogSheet: PLAYER_SHEET }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
    call({ action: 'getRawPlayerGames', team: '', sport: '' }),
    call({ action: 'getRawMatches', team: '', sport: '' }),
  ]);

  const points = pointRes.events || [];                                                 // 원본 포인트로그
  const players = playerRes.players || [];                                              // 원본 선수별집계기록로그
  const events = (eventsRes.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);
  const pg = (pgRes.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);
  const matches = (mtRes.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);

  console.log(`소스 행 수:`);
  console.log(`  원본 ${POINT_SHEET}: ${points.length}`);
  console.log(`  원본 ${PLAYER_SHEET}: ${players.length}`);
  console.log(`  로그_이벤트: ${events.length}`);
  console.log(`  로그_선수경기: ${pg.length}`);
  console.log(`  로그_매치: ${matches.length}`);

  // ════════════════════════════════════════════════════════════
  // 섹션 1: 포인트로그 → 로그_이벤트 (이벤트 카운트 검증)
  // ════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`섹션 1: ${POINT_SHEET} → 로그_이벤트`);
  console.log(`${'═'.repeat(70)}`);

  // 진짜 기대치 (각 컬럼 독립): 한 행에 자책골+실점키퍼 둘 다 있으면 둘 다 이벤트
  let trueGoal = 0, trueOg = 0, trueConc = 0;
  let bothOgConc = 0, bothScOg = 0, bothScConc = 0;
  for (const r of points) {
    const sc = norm(r.scorer), og = norm(r.ownGoal), gk = norm(r.concedingGk);
    if (sc) trueGoal++;
    if (og) trueOg++;
    if (gk) trueConc++;
    if (og && gk) bothOgConc++;
    if (sc && og) bothScOg++;
    if (sc && gk) bothScConc++;
  }
  // 신규 실제
  const cnt = events.reduce((m, e) => { m[e.event_type] = (m[e.event_type] || 0) + 1; return m; }, {});

  console.log(`\n  [TRUE 기대치 (각 컬럼 독립 변환)]`);
  console.log(`    goal=${trueGoal}  owngoal=${trueOg}  concede=${trueConc}  합계=${trueGoal + trueOg + trueConc}`);
  console.log(`    동시 행: scorer+ownGoal=${bothScOg}  scorer+concedingGk=${bothScConc}  ownGoal+concedingGk=${bothOgConc}`);
  console.log(`  [신규 로그_이벤트 실제]`);
  console.log(`    goal=${cnt.goal || 0}  owngoal=${cnt.owngoal || 0}  concede=${cnt.concede || 0}  합계=${events.length}`);
  console.log(`  [차이 (실제 - TRUE)]`);
  console.log(`    Δgoal=${(cnt.goal || 0) - trueGoal}  Δowngoal=${(cnt.owngoal || 0) - trueOg}  Δconcede=${(cnt.concede || 0) - trueConc}`);

  // 어시(related_player) 카운트도 별도 비교
  const trueAssists = points.filter(r => norm(r.scorer) && norm(r.assist)).length;
  const newAssists = events.filter(e => e.event_type === 'goal' && norm(e.related_player)).length;
  console.log(`\n  어시 카운트:`);
  console.log(`    원본(scorer+assist 둘 다 채워진 행) = ${trueAssists}`);
  console.log(`    신규(goal.related_player 채워진 행) = ${newAssists}`);
  console.log(`    Δ=${newAssists - trueAssists}`);

  // ────────────────────────────────────────────────────────────
  // 1-A: 행 단위 정확 매칭 — 원본 row → 기대 이벤트 multiset vs 신규
  // ────────────────────────────────────────────────────────────
  console.log(`\n  ── 1-A. 행 단위 multiset 매칭 (날짜+match_id+이벤트형+player+related) ──`);
  const expMS = new Map(), newMS = new Map();
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const r of points) {
    const d = r.date, mid = normMatchId(r.matchId);
    const sc = norm(r.scorer), as = norm(r.assist), og = norm(r.ownGoal), gk = norm(r.concedingGk);
    if (sc) inc(expMS, `${d}|${mid}|goal|${sc}|${as}`);
    if (og) inc(expMS, `${d}|${mid}|owngoal|${og}|`);
    if (gk) inc(expMS, `${d}|${mid}|concede|${gk}|`);
  }
  for (const e of events) {
    inc(newMS, `${e.date}|${norm(e.match_id)}|${e.event_type}|${norm(e.player)}|${norm(e.related_player)}`);
  }
  let missingFromNew = [], extraInNew = [];
  for (const [k, v] of expMS) {
    const got = newMS.get(k) || 0;
    if (got < v) missingFromNew.push({ k, exp: v, got });
  }
  for (const [k, v] of newMS) {
    const exp = expMS.get(k) || 0;
    if (v > exp) extraInNew.push({ k, exp, got: v });
  }
  console.log(`    원본 ↛ 신규 (마이그레이션 누락): ${missingFromNew.length}건`);
  console.log(`    신규 ↛ 원본 (추가됨/덮어씀): ${extraInNew.length}건`);
  if (missingFromNew.length) {
    console.log(`\n    [원본에만 있고 신규에 없음] (15)`);
    missingFromNew.slice(0, 15).forEach(x => console.log(`      ${x.k}  exp=${x.exp} got=${x.got}`));
    if (missingFromNew.length > 15) console.log(`      ... (+${missingFromNew.length - 15})`);
  }
  if (extraInNew.length) {
    console.log(`\n    [신규에만 있고 원본에 없음] (15)`);
    extraInNew.slice(0, 15).forEach(x => console.log(`      ${x.k}  exp=${x.exp} got=${x.got}`));
    if (extraInNew.length > 15) console.log(`      ... (+${extraInNew.length - 15})`);
  }

  // ════════════════════════════════════════════════════════════
  // 섹션 2: 선수별집계기록로그 → 로그_선수경기 (per (date,player) 모든 필드)
  // ════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`섹션 2: ${PLAYER_SHEET} → 로그_선수경기`);
  console.log(`${'═'.repeat(70)}`);

  const FIELDS = ['goals', 'assists', 'conceded', 'cleansheets', 'keeper_games', 'crova', 'goguma', '역주행', 'rank_score'];
  const FIELD_MAP_ORIG = {
    goals: 'goals', assists: 'assists', conceded: 'conceded',
    cleansheets: 'cleanSheets', keeper_games: 'keeperGames',
    crova: 'crova', goguma: 'goguma', '역주행': 'ownGoals', rank_score: 'rankScore',
  };
  const orig = new Map(), neue = new Map();
  for (const r of players) {
    const k = `${r.date}|${norm(r.name)}`;
    if (!orig.has(k)) orig.set(k, { rows: 0 });
    const o = orig.get(k);
    o.rows++;
    for (const f of FIELDS) o[f] = (o[f] || 0) + num(r[FIELD_MAP_ORIG[f]]);
  }
  for (const r of pg) {
    const k = `${r.date}|${norm(r.player)}`;
    if (!neue.has(k)) neue.set(k, { rows: 0 });
    const n = neue.get(k);
    n.rows++;
    for (const f of FIELDS) n[f] = (n[f] || 0) + num(r[f]);
  }
  // 합계 일치
  console.log(`\n  ── 2-A. 전체 합계 비교 (원본 vs 신규) ──`);
  for (const f of FIELDS) {
    const o = [...orig.values()].reduce((a, b) => a + (b[f] || 0), 0);
    const n = [...neue.values()].reduce((a, b) => a + (b[f] || 0), 0);
    const flag = o === n ? '✓' : '✗';
    console.log(`    ${flag} ${f.padEnd(15)} 원본=${String(o).padStart(5)}  신규=${String(n).padStart(5)}  Δ=${String(n - o).padStart(5)}`);
  }

  // 행 단위 차이
  console.log(`\n  ── 2-B. (date,player) 단위 차이 ──`);
  let missInNew = 0, missInOrig = 0, diffCount = 0;
  const diffs = [];
  const keys = new Set([...orig.keys(), ...neue.keys()]);
  for (const k of keys) {
    const o = orig.get(k), n = neue.get(k);
    if (!n) { missInNew++; diffs.push({ kind: 'MISS_NEW', k, val: o }); continue; }
    if (!o) { missInOrig++; diffs.push({ kind: 'MISS_ORIG', k, val: n }); continue; }
    const d = {};
    let any = false;
    for (const f of FIELDS) if ((o[f] || 0) !== (n[f] || 0)) { d[f] = `${o[f] || 0}→${n[f] || 0}`; any = true; }
    if (any) { diffCount++; diffs.push({ kind: 'DIFF', k, d }); }
  }
  console.log(`    원본만 있음 (마이그 누락): ${missInNew}`);
  console.log(`    신규만 있음 (사후 추가): ${missInOrig}`);
  console.log(`    값 불일치: ${diffCount}`);
  diffs.filter(x => x.kind === 'DIFF').slice(0, 20).forEach(x => console.log(`      DIFF ${x.k}  ${JSON.stringify(x.d)}`));
  diffs.filter(x => x.kind === 'MISS_NEW').slice(0, 10).forEach(x => console.log(`      MISS_NEW ${x.k}  ${JSON.stringify(x.val)}`));
  diffs.filter(x => x.kind === 'MISS_ORIG').slice(0, 10).forEach(x => console.log(`      MISS_ORIG ${x.k}  ${JSON.stringify(x.val)}`));

  // ════════════════════════════════════════════════════════════
  // 섹션 3: 로그_이벤트 vs 로그_선수경기 일관성
  // ════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`섹션 3: 로그_이벤트 ↔ 로그_선수경기 일관성 (자가검증)`);
  console.log(`${'═'.repeat(70)}`);

  // (date,player) → from events
  const evAgg = new Map();
  const ensure = (k) => { if (!evAgg.has(k)) evAgg.set(k, { goals: 0, assists: 0, owngoals: 0, conceded: 0 }); return evAgg.get(k); };
  for (const e of events) {
    const d = e.date;
    if (e.event_type === 'goal') {
      if (e.player) ensure(`${d}|${e.player}`).goals++;
      if (e.related_player) ensure(`${d}|${e.related_player}`).assists++;
    } else if (e.event_type === 'owngoal') {
      if (e.player) ensure(`${d}|${e.player}`).owngoals++;
    } else if (e.event_type === 'concede') {
      if (e.player) ensure(`${d}|${e.player}`).conceded++;
    }
  }
  // pg와 비교 (단, 풋살 conceded는 일반 실점이 이벤트로그에 없으니 그것만 정보용)
  const SUB_FIELDS = ['goals', 'assists'];
  let inc1 = 0, inc2 = 0;
  for (const [k, ev] of evAgg) {
    const p = neue.get(k);
    if (!p) { inc1++; continue; }
    for (const f of SUB_FIELDS) {
      if ((p[f] || 0) !== (ev[f] || 0)) inc2++;
    }
  }
  console.log(`  로그_이벤트의 (date,player)가 로그_선수경기에 없음: ${inc1}`);
  console.log(`  goals/assists 불일치 건: ${inc2}`);
  // 샘플
  let shown = 0;
  for (const [k, ev] of evAgg) {
    const p = neue.get(k);
    if (!p) continue;
    if (p.goals !== ev.goals || p.assists !== ev.assists) {
      if (shown < 15) console.log(`    ${k}  pg(g=${p.goals} a=${p.assists}) vs ev(g=${ev.goals} a=${ev.assists})`);
      shown++;
    }
  }

  // ════════════════════════════════════════════════════════════
  // 섹션 4: 로그_매치 신뢰도 + 백필 영향
  // ════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`섹션 4: 로그_매치 신뢰도 + 백필 (games/field_games)`);
  console.log(`${'═'.repeat(70)}`);

  const dateStat = new Map();
  for (const m of matches) {
    if (!dateStat.has(m.date)) dateStat.set(m.date, { teamName: 0, away: 0, home: 0, gks: 0, rows: 0 });
    const s = dateStat.get(m.date);
    s.rows++;
    if (m.our_team_name) s.teamName++;
    try { s.away += JSON.parse(m.opponent_members_json || '[]').length; } catch {}
    try { s.home += JSON.parse(m.our_members_json || '[]').length; } catch {}
    if (m.our_gk || m.opponent_gk) s.gks++;
  }
  const reliable = new Set();
  for (const [d, s] of dateStat) if (s.teamName > 0 && s.away > 0) reliable.add(d);
  console.log(`  날짜별 신뢰도:`);
  console.log(`  date       | rows | teamName | gks | home | away | reliable`);
  for (const d of [...dateStat.keys()].sort()) {
    const s = dateStat.get(d);
    console.log(`  ${d} | ${String(s.rows).padStart(3)}  |  ${String(s.teamName).padStart(3)}     | ${String(s.gks).padStart(3)} | ${String(s.home).padStart(4)} | ${String(s.away).padStart(4)} | ${reliable.has(d) ? '✓' : '✗'}`);
  }

  // pg 중 games=0인 행과 reliable 날짜 교집합
  const zeroPgReliable = pg.filter(r => num(r.games) === 0 && num(r.field_games) === 0 && reliable.has(r.date));
  console.log(`\n  reliable 날짜 중 games=0,field_games=0 행 (백필 대상): ${zeroPgReliable.length}`);
  // pg 중 games>0이 이미 있는 행
  const filledPg = pg.filter(r => num(r.games) > 0 || num(r.field_games) > 0);
  console.log(`  pg 중 games>0 또는 field_games>0 행 (이미 채워짐): ${filledPg.length}`);
})();

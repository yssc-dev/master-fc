#!/usr/bin/env node
// 마스터FC 포인트 로그 ↔ 로그_이벤트 / 마스터FC 선수별집계기록 로그 ↔ 로그_선수경기 헤드투헤드 검증.
// 누락/불일치/덮어쓰기 흔적을 잡아냄.

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

const norm = (s) => String(s || '').trim();

(async () => {
  console.log(`\n[verifyImport] ${TEAM} / ${SPORT}\n`);

  // ── 1. 포인트 로그 ↔ 로그_이벤트 ─────────────────────────
  console.log(`=== 1. ${POINT_SHEET} ↔ 로그_이벤트 ===`);
  const [pointRes, eventsRes] = await Promise.all([
    call({ action: 'getPointLog', team: TEAM, pointLogSheet: POINT_SHEET }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
  ]);
  const pointEvents = pointRes.events || [];
  const rawEvents = (eventsRes.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);
  console.log(`  원본 포인트 로그 행: ${pointEvents.length}`);
  console.log(`  로그_이벤트 (마스터FC/풋살): ${rawEvents.length}`);

  // 원본의 기대 이벤트 수 계산 (else-if 체인 그대로 적용)
  let expGoals = 0, expOwn = 0, expConc = 0, expBoth = 0;
  for (const r of pointEvents) {
    const sc = norm(r.scorer), og = norm(r.ownGoal), gk = norm(r.concedingGk);
    if (sc) expGoals++;
    else if (og) expOwn++;
    else if (gk) expConc++;
    if (og && gk) expBoth++; // else-if라서 둘 다 있으면 concede 드롭됨
  }
  // 신규의 실제 이벤트 수
  const counts = rawEvents.reduce((m, e) => { m[e.event_type] = (m[e.event_type] || 0) + 1; return m; }, {});
  console.log(`\n  [원본 기준 기대치 (else-if 체인 적용)]`);
  console.log(`    goal=${expGoals} owngoal=${expOwn} concede=${expConc}  합계=${expGoals + expOwn + expConc}`);
  console.log(`    ⚠ 자책골+실점키퍼 동시 행: ${expBoth} (concede 드롭됨)`);
  console.log(`  [신규 로그_이벤트 실제]`);
  console.log(`    goal=${counts.goal || 0} owngoal=${counts.owngoal || 0} concede=${counts.concede || 0}  합계=${rawEvents.length}`);
  console.log(`  diff: goal=${(counts.goal || 0) - expGoals} owngoal=${(counts.owngoal || 0) - expOwn} concede=${(counts.concede || 0) - expConc}`);

  // 날짜별 비교
  const byDateOrig = {}, byDateNew = {};
  for (const r of pointEvents) {
    const d = r.date;
    if (!byDateOrig[d]) byDateOrig[d] = { g: 0, o: 0, c: 0 };
    if (norm(r.scorer)) byDateOrig[d].g++;
    else if (norm(r.ownGoal)) byDateOrig[d].o++;
    else if (norm(r.concedingGk)) byDateOrig[d].c++;
  }
  for (const r of rawEvents) {
    const d = r.date;
    if (!byDateNew[d]) byDateNew[d] = { g: 0, o: 0, c: 0 };
    if (r.event_type === 'goal') byDateNew[d].g++;
    else if (r.event_type === 'owngoal') byDateNew[d].o++;
    else if (r.event_type === 'concede') byDateNew[d].c++;
  }
  const allDates = [...new Set([...Object.keys(byDateOrig), ...Object.keys(byDateNew)])].sort();
  console.log(`\n  날짜별 차이 (원본→신규):`);
  console.log(`  date       | g   o   c   | g   o   c   | Δg  Δo  Δc`);
  let mismatchedDates = 0;
  for (const d of allDates) {
    const o = byDateOrig[d] || { g: 0, o: 0, c: 0 };
    const n = byDateNew[d] || { g: 0, o: 0, c: 0 };
    const dg = n.g - o.g, do_ = n.o - o.o, dc = n.c - o.c;
    if (dg || do_ || dc) {
      mismatchedDates++;
      console.log(`  ${d} | ${String(o.g).padStart(3)} ${String(o.o).padStart(3)} ${String(o.c).padStart(3)} | ${String(n.g).padStart(3)} ${String(n.o).padStart(3)} ${String(n.c).padStart(3)} | ${String(dg).padStart(3)} ${String(do_).padStart(3)} ${String(dc).padStart(3)}`);
    }
  }
  if (mismatchedDates === 0) console.log(`  ✓ 모든 날짜 일치`);

  // ── 2. 선수별집계기록 ↔ 로그_선수경기 ─────────────────────────
  console.log(`\n\n=== 2. ${PLAYER_SHEET} ↔ 로그_선수경기 ===`);
  const [playerRes, pgRes] = await Promise.all([
    call({ action: 'getPlayerLog', team: TEAM, playerLogSheet: PLAYER_SHEET }),
    call({ action: 'getRawPlayerGames', team: '', sport: '' }),
  ]);
  const origPlayers = playerRes.players || [];
  const rawPg = (pgRes.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);
  console.log(`  원본 선수별집계기록 행: ${origPlayers.length}`);
  console.log(`  로그_선수경기 (마스터FC/풋살): ${rawPg.length}`);

  // 원본 데이터 구조 확인
  if (origPlayers[0]) console.log(`  원본 첫 행 keys: ${Object.keys(origPlayers[0]).join(',')}`);

  // (date, player)로 합산 비교
  const orig = {}, neue = {};
  for (const r of origPlayers) {
    const k = `${r.date}|${r.name || r.player || ''}`;
    if (!orig[k]) orig[k] = { goals: 0, assists: 0, conceded: 0, cleansheets: 0, keeper_games: 0, crova: 0, goguma: 0, 역주행: 0, rank_score: 0, rows: 0 };
    orig[k].rows++;
    orig[k].goals += Number(r.goals) || 0;
    orig[k].assists += Number(r.assists) || 0;
    orig[k].conceded += Number(r.conceded) || 0;
    orig[k].cleansheets += Number(r.cleanSheets ?? r.cleansheets) || 0;
    orig[k].keeper_games += Number(r.keeperGames ?? r.keeper_games) || 0;
    orig[k].crova += Number(r.crova) || 0;
    orig[k].goguma += Number(r.goguma) || 0;
    orig[k]['역주행'] += Number(r.ownGoals ?? r['역주행']) || 0;
    orig[k].rank_score += Number(r.rankScore ?? r.rank_score) || 0;
  }
  for (const r of rawPg) {
    const k = `${r.date}|${r.player}`;
    if (!neue[k]) neue[k] = { goals: 0, assists: 0, conceded: 0, cleansheets: 0, keeper_games: 0, crova: 0, goguma: 0, 역주행: 0, rank_score: 0, rows: 0 };
    neue[k].rows++;
    neue[k].goals += Number(r.goals) || 0;
    neue[k].assists += Number(r.assists) || 0;
    neue[k].conceded += Number(r.conceded) || 0;
    neue[k].cleansheets += Number(r.cleansheets) || 0;
    neue[k].keeper_games += Number(r.keeper_games) || 0;
    neue[k].crova += Number(r.crova) || 0;
    neue[k].goguma += Number(r.goguma) || 0;
    neue[k]['역주행'] += Number(r['역주행']) || 0;
    neue[k].rank_score += Number(r.rank_score) || 0;
  }

  const allKeys = [...new Set([...Object.keys(orig), ...Object.keys(neue)])].sort();
  let mismatchCount = 0;
  let missingInNew = 0;
  let missingInOrig = 0;
  const FIELDS = ['goals', 'assists', 'conceded', 'cleansheets', 'keeper_games', 'crova', 'goguma', '역주행', 'rank_score'];
  const samples = [];

  for (const k of allKeys) {
    const o = orig[k], n = neue[k];
    if (!n) { missingInNew++; samples.push({ kind: 'MISS_IN_NEW', key: k, orig: o }); continue; }
    if (!o) { missingInOrig++; samples.push({ kind: 'MISS_IN_ORIG', key: k, neue: n }); continue; }
    const diff = {};
    let any = false;
    for (const f of FIELDS) {
      if ((o[f] || 0) !== (n[f] || 0)) { diff[f] = `${o[f]}→${n[f]}`; any = true; }
    }
    if (any) { mismatchCount++; samples.push({ kind: 'DIFF', key: k, diff, origRows: o.rows, newRows: n.rows }); }
  }

  console.log(`\n  비교 결과:`);
  console.log(`    원본에만 있음 (마이그레이션 누락): ${missingInNew}`);
  console.log(`    신규에만 있음 (사용자가 직접 입력?): ${missingInOrig}`);
  console.log(`    값 불일치: ${mismatchCount}`);

  if (missingInNew > 0) {
    console.log(`\n  ⚠ MISS_IN_NEW 샘플 (10개):`);
    samples.filter(s => s.kind === 'MISS_IN_NEW').slice(0, 10).forEach(s => {
      const o = s.orig;
      console.log(`    ${s.key} | g=${o.goals} a=${o.assists} c=${o.conceded} cs=${o.cleansheets} kg=${o.keeper_games} 역주행=${o['역주행']} cr=${o.crova} go=${o.goguma} rs=${o.rank_score}`);
    });
  }
  if (missingInOrig > 0) {
    console.log(`\n  MISS_IN_ORIG 샘플 (10개):`);
    samples.filter(s => s.kind === 'MISS_IN_ORIG').slice(0, 10).forEach(s => {
      const n = s.neue;
      console.log(`    ${s.key} | g=${n.goals} a=${n.assists} c=${n.conceded} cs=${n.cleansheets} kg=${n.keeper_games} 역주행=${n['역주행']} cr=${n.crova} go=${n.goguma} rs=${n.rank_score}`);
    });
  }
  if (mismatchCount > 0) {
    console.log(`\n  ⚠ DIFF 샘플 (15개):`);
    samples.filter(s => s.kind === 'DIFF').slice(0, 15).forEach(s => {
      console.log(`    ${s.key} (origRows=${s.origRows} newRows=${s.newRows}) ${JSON.stringify(s.diff)}`);
    });
  }

  // ── 3. (체크) 자책골+실점키퍼 동시 행에서 concede 누락된 케이스 직접 보기 ─────────────────────────
  console.log(`\n\n=== 3. else-if 체인으로 concede 드롭된 행 (자책골+실점키퍼 동시) ===`);
  const dropped = pointEvents.filter(r => norm(r.ownGoal) && norm(r.concedingGk) && !norm(r.scorer));
  console.log(`  총 ${dropped.length}건 (concede 이벤트가 신규 로그_이벤트에 없음)`);
  dropped.slice(0, 10).forEach(r => console.log(`    ${r.date} ${r.matchId} 자책골=${r.ownGoal} 실점키퍼=${r.concedingGk}`));
})();

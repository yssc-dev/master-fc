#!/usr/bin/env node
// 시트27 (1/15로 라벨된 78 rows)을 1/8 events vs 1/15 events 카운트와 매칭하여 분리.
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/splitJan15.mjs

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) { console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요'); process.exit(1); }

async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}

const D8 = '2026-01-08', D15 = '2026-01-15';

(async () => {
  const [pl, ev] = await Promise.all([
    call({ action: 'getPlayerLog', team: '마스터FC', playerLogSheet: '마스터FC 선수별집계기록 로그' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
  ]);
  const sheetRows = (pl.players || []).filter(r => r.date === D15);
  console.log(`원본 1/15 rows: ${sheetRows.length}`);
  if (sheetRows.length === 0) { console.error('원본 1/15 행 없음. 디버그:', pl.debug); return; }

  const evRows = (ev.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살' && (r.date === D8 || r.date === D15));

  // events stats per (date, player)
  const evStats = {};
  const ensure = (d, p) => {
    const k = `${d}|${p}`;
    if (!evStats[k]) evStats[k] = { goals: 0, assists: 0, conceded: 0, owngoals: 0 };
    return evStats[k];
  };
  for (const e of evRows) {
    if (e.event_type === 'goal' && e.player) ensure(e.date, e.player).goals++;
    if (e.event_type === 'goal' && e.related_player) ensure(e.date, e.related_player).assists++;
    if (e.event_type === 'concede' && e.player) ensure(e.date, e.player).conceded++;
    if (e.event_type === 'owngoal' && e.player) ensure(e.date, e.player).owngoals++;
  }

  // 시트27 rows by player
  const byPlayer = {};
  for (const r of sheetRows) {
    if (!byPlayer[r.name]) byPlayer[r.name] = [];
    byPlayer[r.name].push(r);
  }

  const ogCount = (row) => Math.abs(Number(row.ownGoals) || 0) / 2; // 역주행 -> owngoal 카운트
  const distance = (row, ev) => {
    const dg = Math.abs((row.goals || 0) - ev.goals);
    const da = Math.abs((row.assists || 0) - ev.assists);
    const dc = Math.abs((row.conceded || 0) - ev.conceded);
    const dow = Math.abs(ogCount(row) - ev.owngoals);
    return dg + da + dc + dow;
  };

  const assigned = { [D8]: [], [D15]: [] };
  const ambiguous = [];

  for (const [name, rows] of Object.entries(byPlayer)) {
    const e8 = evStats[`${D8}|${name}`] || { goals:0, assists:0, conceded:0, owngoals:0 };
    const e15 = evStats[`${D15}|${name}`] || { goals:0, assists:0, conceded:0, owngoals:0 };

    if (rows.length === 1) {
      const s8 = distance(rows[0], e8);
      const s15 = distance(rows[0], e15);
      if (s8 < s15) assigned[D8].push({ name, row: rows[0], dist: s8, ev: e8 });
      else if (s15 < s8) assigned[D15].push({ name, row: rows[0], dist: s15, ev: e15 });
      else {
        // 동점 → events 모두 0이면 둘 다 가능성. 1/8에 배정 (선수 없는 가설)
        ambiguous.push({ name, rows, reason: 'tie', s8, s15, e8, e15 });
      }
    } else if (rows.length === 2) {
      const m1 = distance(rows[0], e8) + distance(rows[1], e15);  // r0=1/8, r1=1/15
      const m2 = distance(rows[0], e15) + distance(rows[1], e8);  // r0=1/15, r1=1/8
      if (m1 < m2) {
        assigned[D8].push({ name, row: rows[0], dist: distance(rows[0], e8), ev: e8 });
        assigned[D15].push({ name, row: rows[1], dist: distance(rows[1], e15), ev: e15 });
      } else if (m2 < m1) {
        assigned[D15].push({ name, row: rows[0], dist: distance(rows[0], e15), ev: e15 });
        assigned[D8].push({ name, row: rows[1], dist: distance(rows[1], e8), ev: e8 });
      } else {
        ambiguous.push({ name, rows, reason: 'tie-pair', m1, m2, e8, e15 });
      }
    } else {
      ambiguous.push({ name, rows, reason: `${rows.length}-rows`, e8, e15 });
    }
  }

  console.log(`\n=== 매칭 결과 ===`);
  console.log(`  ${D8} 배정: ${assigned[D8].length}`);
  console.log(`  ${D15} 배정: ${assigned[D15].length}`);
  console.log(`  ambiguous: ${ambiguous.length}`);

  // 정확도 검증: 거리=0 (완벽 매치) 비율
  const perfect = (arr) => arr.filter(x => x.dist === 0).length;
  console.log(`\n=== 매칭 품질 ===`);
  console.log(`  ${D8} 완벽 매치 (dist=0): ${perfect(assigned[D8])} / ${assigned[D8].length}`);
  console.log(`  ${D15} 완벽 매치 (dist=0): ${perfect(assigned[D15])} / ${assigned[D15].length}`);

  // dist > 0 인 행 출력 (불완벽 매칭)
  const imperfect = [...assigned[D8].filter(x => x.dist > 0).map(x => ({ ...x, date: D8 })),
                    ...assigned[D15].filter(x => x.dist > 0).map(x => ({ ...x, date: D15 }))];
  if (imperfect.length > 0) {
    console.log(`\n=== 불완벽 매칭 (events와 차이 있음) ===`);
    for (const x of imperfect) {
      const r = x.row;
      console.log(`  ${x.date} ${x.name}  pl(g=${r.goals} a=${r.assists} c=${r.conceded} og=${ogCount(r)}) vs ev(g=${x.ev.goals} a=${x.ev.assists} c=${x.ev.conceded} og=${x.ev.owngoals})  dist=${x.dist}`);
    }
  }

  // ambiguous 출력
  if (ambiguous.length > 0) {
    console.log(`\n=== Ambiguous ===`);
    for (const x of ambiguous) {
      console.log(`  ${x.name} (${x.reason}): rows=${x.rows.length}, e8=${JSON.stringify(x.e8)}, e15=${JSON.stringify(x.e15)}`);
      for (const r of x.rows) {
        console.log(`    pl(g=${r.goals} a=${r.assists} c=${r.conceded} og=${ogCount(r)} kg=${r.keeperGames} cs=${r.cleanSheets} cr=${r.crova} go=${r.goguma} rs=${r.rankScore})`);
      }
    }
  }

  // 합계 검증: 배정된 1/8 행들의 (g,a,c) 합이 events 1/8 합과 일치하는지
  const sumPl = (arr) => {
    let g=0,a=0,c=0,og=0;
    for (const x of arr) { g+=x.row.goals||0; a+=x.row.assists||0; c+=x.row.conceded||0; og+=ogCount(x.row); }
    return { g, a, c, og };
  };
  const sumEv = (date) => {
    let g=0,a=0,c=0,og=0;
    for (const k of Object.keys(evStats)) {
      if (!k.startsWith(date+'|')) continue;
      const e = evStats[k];
      g+=e.goals; a+=e.assists; c+=e.conceded; og+=e.owngoals;
    }
    return { g, a, c, og };
  };
  console.log(`\n=== 합계 검증 ===`);
  for (const d of [D8, D15]) {
    const p = sumPl(assigned[d]);
    const e = sumEv(d);
    console.log(`  ${d}  pl(g=${p.g} a=${p.a} c=${p.c} og=${p.og}) vs ev(g=${e.g} a=${e.a} c=${e.c} og=${e.og})  Δg=${p.g-e.g} Δa=${p.a-e.a} Δc=${p.c-e.c} Δog=${p.og-e.og}`);
  }
})();

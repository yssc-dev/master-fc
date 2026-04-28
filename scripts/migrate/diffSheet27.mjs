#!/usr/bin/env node
// 원본 마스터FC 선수별집계기록 로그 vs 시트27 합계 비교
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
const D8 = '2026-01-08', D15 = '2026-01-15';

const COLS = ['goals', 'assists', 'ownGoals', 'conceded', 'cleanSheets', 'crova', 'goguma'];

(async () => {
  const [orig, sheet27] = await Promise.all([
    call({ action: 'getPlayerLog', team: '마스터FC', playerLogSheet: '마스터FC 선수별집계기록 로그' }),
    call({ action: 'getPlayerLog', team: '마스터FC', playerLogSheet: '시트27' }),
  ]);
  const origRows = (orig.players || []).filter(r => r.date === D8 || r.date === D15);
  const newRows = (sheet27.players || []).filter(r => r.date === D8 || r.date === D15);

  const sumAll = (rows, cols) => rows.reduce((s, r) => s + cols.reduce((a, c) => a + (Number(r[c]) || 0), 0), 0);

  console.log(`\n=== 원본 마스터FC 선수별집계기록 로그 (1/8 & 1/15) ===`);
  console.log(`  rows: ${origRows.length}`);
  for (const c of COLS) {
    const t = origRows.reduce((s, r) => s + (Number(r[c]) || 0), 0);
    console.log(`  ${c}: ${t}`);
  }
  console.log(`  TOTAL (7개 합): ${sumAll(origRows, COLS)}`);

  console.log(`\n=== 시트27 (1/8 & 1/15) ===`);
  console.log(`  rows: ${newRows.length}`);
  for (const c of COLS) {
    const t = newRows.reduce((s, r) => s + (Number(r[c]) || 0), 0);
    console.log(`  ${c}: ${t}`);
  }
  console.log(`  TOTAL (7개 합): ${sumAll(newRows, COLS)}`);

  console.log(`\n=== Δ (시트27 - 원본) ===`);
  for (const c of COLS) {
    const o = origRows.reduce((s, r) => s + (Number(r[c]) || 0), 0);
    const n = newRows.reduce((s, r) => s + (Number(r[c]) || 0), 0);
    console.log(`  ${c}: ${n - o}`);
  }
  console.log(`  TOTAL Δ: ${sumAll(newRows, COLS) - sumAll(origRows, COLS)}`);
})();

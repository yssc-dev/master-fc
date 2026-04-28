#!/usr/bin/env node
// events 1/8+1/15 어시 vs 원본 78행 어시 per-player 비교 → 누락 어시 추적
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
const D8 = '2026-01-08', D15 = '2026-01-15';

(async () => {
  const [orig, ev, sheet27] = await Promise.all([
    call({ action: 'getPlayerLog', team: '마스터FC', playerLogSheet: '마스터FC 선수별집계기록 로그' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
    call({ action: 'getPlayerLog', team: '마스터FC', playerLogSheet: '시트27' }),
  ]);

  const origRows = (orig.players || []).filter(r => r.date === D8 || r.date === D15);
  const sheet27Rows = (sheet27.players || []).filter(r => r.date === D8 || r.date === D15);
  const evRows = (ev.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살' && (r.date === D8 || r.date === D15) && r.event_type === 'goal' && r.related_player);

  // events 어시 per player (1/8+1/15 합)
  const evA = {};
  for (const e of evRows) evA[e.related_player] = (evA[e.related_player] || 0) + 1;

  // 원본 어시 per player (1/8+1/15 행 합산)
  const origA = {};
  for (const r of origRows) origA[r.name] = (origA[r.name] || 0) + (Number(r.assists) || 0);

  // 시트27 어시 per player
  const newA = {};
  for (const r of sheet27Rows) newA[r.name] = (newA[r.name] || 0) + (Number(r.assists) || 0);

  const allPlayers = [...new Set([...Object.keys(evA), ...Object.keys(origA), ...Object.keys(newA)])].sort((a, b) => a.localeCompare(b, 'ko'));

  console.log(`\n선수      | events | 원본 | 시트27 | Δ(원본→event) | Δ(시트27→event)`);
  console.log(`---------|--------|------|--------|---------------|----------------`);
  let totalEv = 0, totalOrig = 0, totalNew = 0;
  for (const p of allPlayers) {
    const e = evA[p] || 0, o = origA[p] || 0, n = newA[p] || 0;
    totalEv += e; totalOrig += o; totalNew += n;
    const d1 = e - o, d2 = e - n;
    if (d1 !== 0 || d2 !== 0) {
      console.log(`  ${p.padEnd(8)} |    ${e}   |  ${o}   |   ${n}   |     ${d1 > 0 ? '+' : ''}${d1}        |     ${d2 > 0 ? '+' : ''}${d2}`);
    }
  }
  console.log(`---------|--------|------|--------|`);
  console.log(`  TOTAL    |   ${totalEv}   |  ${totalOrig}  |   ${totalNew}   |`);
})();

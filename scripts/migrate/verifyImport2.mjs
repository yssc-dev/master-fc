#!/usr/bin/env node
// 4/23 누락 1건 추적 + 자책골+실점키퍼 동시 행이 정말 concede 누락인지 검증
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
const norm = (s) => String(s || '').trim();

(async () => {
  const [pointRes, eventsRes] = await Promise.all([
    call({ action: 'getPointLog', team: '마스터FC', pointLogSheet: '마스터FC 포인트 로그' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
  ]);
  const points = (pointRes.events || []).filter(r => r.date === '2026-04-23');
  const events = (eventsRes.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살' && r.date === '2026-04-23');

  console.log(`\n=== 4/23 원본 vs 신규 (goal만) ===`);
  const origGoals = points.filter(r => norm(r.scorer));
  const newGoals = events.filter(r => r.event_type === 'goal');
  console.log(`  원본 ${origGoals.length} | 신규 ${newGoals.length}`);

  // (matchId, scorer, assist) 키로 multiset 비교
  const key = (r, src) => {
    if (src === 'orig') return `${norm(r.matchId)}|${norm(r.scorer)}|${norm(r.assist)}`;
    return `${norm(r.match_id)}|${norm(r.player)}|${norm(r.related_player)}`;
  };
  const origMS = {}, newMS = {};
  for (const r of origGoals) { const k = key(r, 'orig'); origMS[k] = (origMS[k] || 0) + 1; }
  for (const r of newGoals) { const k = key(r, 'new'); newMS[k] = (newMS[k] || 0) + 1; }

  console.log(`\n  원본에만 있는 이벤트:`);
  for (const k in origMS) {
    const diff = (origMS[k] || 0) - (newMS[k] || 0);
    if (diff > 0) console.log(`    ${k}  orig=${origMS[k]} new=${newMS[k] || 0}`);
  }
  console.log(`\n  신규에만 있는 이벤트:`);
  for (const k in newMS) {
    const diff = (newMS[k] || 0) - (origMS[k] || 0);
    if (diff > 0) console.log(`    ${k}  orig=${origMS[k] || 0} new=${newMS[k]}`);
  }

  // ── 자책골+실점키퍼 동시 행이 신규 로그_이벤트에 어떻게 들어갔는지 ─────────
  console.log(`\n\n=== 자책골+실점키퍼 동시 행 13건의 신규 로그_이벤트 흔적 ===`);
  const allPoints = pointRes.events || [];
  const allEvents = (eventsRes.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살');
  const dropped = allPoints.filter(r => norm(r.ownGoal) && norm(r.concedingGk) && !norm(r.scorer));
  for (const r of dropped) {
    const matchEvs = allEvents.filter(e => e.date === r.date && (norm(e.match_id) === norm(r.matchId) || _normMid(norm(r.matchId)) === norm(e.match_id)));
    const og = matchEvs.find(e => e.event_type === 'owngoal' && e.player === r.ownGoal);
    const cc = matchEvs.find(e => e.event_type === 'concede' && e.player === r.concedingGk);
    console.log(`  ${r.date} ${r.matchId} 자책골=${r.ownGoal} 실점키퍼=${r.concedingGk}  → owngoal:${og ? '✓' : '✗'} concede:${cc ? '✓' : '✗'}`);
  }
})();

function _normMid(raw) {
  if (!raw) return raw;
  if (/^R\d+_C\d+$/.test(raw)) return raw;
  let m = raw.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m) return 'R' + m[1] + '_C' + (parseInt(m[2], 10) - 1);
  m = raw.match(/^(\d+)경기$/);
  if (m) return 'R' + m[1] + '_C0';
  if (/^\d+$/.test(raw)) return 'R' + raw + '_C0';
  return raw;
}

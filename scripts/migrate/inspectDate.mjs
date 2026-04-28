#!/usr/bin/env node
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEAM = process.env.TEAM || '마스터FC';
const SPORT = process.env.SPORT || '풋살';
const DATE = process.env.DATE || '2026-03-19';
const PLAYER = process.env.PLAYER || '서라현';
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
(async () => {
  const [mt, ev] = await Promise.all([
    call({ action: 'getRawMatches', team: '', sport: '' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
  ]);
  const f = (r) => r.team === TEAM && r.sport === SPORT && String(r.date) === DATE;
  const matches = (mt.rows || []).filter(f);
  const events = (ev.rows || []).filter(f);
  console.log(`\n[${DATE}] matches=${matches.length} events=${events.length}`);
  console.log(`\n--- matches ---`);
  for (const m of matches) {
    let h = [], a = [];
    try { h = JSON.parse(m.our_members_json || '[]'); } catch {}
    try { a = JSON.parse(m.opponent_members_json || '[]'); } catch {}
    const inHome = h.includes(PLAYER);
    const inAway = a.includes(PLAYER);
    const isGk = m.our_gk === PLAYER || m.opponent_gk === PLAYER;
    console.log(`  ${m.match_id} | ${m.our_team_name} vs ${m.opponent_team_name} | ${m.our_score}:${m.opponent_score} | gk=${m.our_gk}/${m.opponent_gk} | home=${h.length} away=${a.length} | ${PLAYER}: home=${inHome} away=${inAway} gk=${isGk}`);
  }
  console.log(`\n--- events with ${PLAYER} ---`);
  for (const e of events) {
    if (e.player === PLAYER || e.related_player === PLAYER) {
      console.log(`  ${e.match_id} ${e.event_type} player=${e.player} related=${e.related_player}`);
    }
  }
  console.log(`\n--- events sample (first 5) ---`);
  events.slice(0, 5).forEach(e => console.log(`  ${e.match_id} ${e.event_type} player=${e.player} related=${e.related_player}`));
})();

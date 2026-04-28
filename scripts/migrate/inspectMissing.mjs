#!/usr/bin/env node
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const DATE = '2026-01-22';
const PLAYERS = ['김재운', '김진수'];
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
(async () => {
  const [mt, pg, ev] = await Promise.all([
    call({ action: 'getRawMatches', team: '', sport: '' }),
    call({ action: 'getRawPlayerGames', team: '', sport: '' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
  ]);
  const matches = (mt.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살' && r.date === DATE);
  const pgRows = (pg.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살' && r.date === DATE);
  const events = (ev.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살' && r.date === DATE);

  console.log(`\n=== ${DATE} 선수경기 전체 (${pgRows.length}명) ===`);
  pgRows.map(r => r.player).sort().forEach(p => console.log(`  ${p}`));

  for (const PLAYER of PLAYERS) {
    console.log(`\n=== ${PLAYER} 매치로그 등장 ===`);
    let appearances = 0;
    for (const m of matches) {
      let h=[], a=[];
      try { h = JSON.parse(m.our_members_json || '[]'); } catch {}
      try { a = JSON.parse(m.opponent_members_json || '[]'); } catch {}
      const inH = h.includes(PLAYER), inA = a.includes(PLAYER);
      const isGk = m.our_gk === PLAYER || m.opponent_gk === PLAYER;
      if (inH || inA || isGk) {
        appearances++;
        console.log(`  ${m.match_id} | ${m.our_team_name} vs ${m.opponent_team_name} | home=${inH} away=${inA} gk=${isGk}`);
      }
    }
    console.log(`  → 총 ${appearances} 라운드`);
    console.log(`\n=== ${PLAYER} 이벤트 ===`);
    events.filter(e => e.player === PLAYER || e.related_player === PLAYER)
      .forEach(e => console.log(`  ${e.match_id} ${e.event_type} player=${e.player} related=${e.related_player}`));
  }
})();

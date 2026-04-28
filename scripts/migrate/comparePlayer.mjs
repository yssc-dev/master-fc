#!/usr/bin/env node
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEAM = process.env.TEAM || '마스터FC';
const SPORT = process.env.SPORT || '풋살';
const PLAYER = process.env.PLAYER || '정보영';

async function call(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, authToken: AUTH_TOKEN }),
  });
  return await res.json();
}

(async () => {
  const [mt, pg] = await Promise.all([
    call({ action: 'getRawMatches', team: '', sport: '' }),
    call({ action: 'getRawPlayerGames', team: '', sport: '' }),
  ]);
  const f = (r) => String(r.team) === TEAM && String(r.sport) === SPORT;

  // 로그_매치 기준: PLAYER가 our_members_json or opponent_members_json에 들어간 (date, match_id) 카운트
  const seen = new Set();
  const datesByMatch = new Map();
  for (const m of (mt.rows || []).filter(f)) {
    const key = `${m.date}|${m.match_id}`;
    let home = [], away = [];
    try { home = JSON.parse(m.our_members_json || '[]'); } catch {}
    try { away = JSON.parse(m.opponent_members_json || '[]'); } catch {}
    if ([...home, ...away].includes(PLAYER) && !seen.has(key)) {
      seen.add(key);
      datesByMatch.set(m.date, (datesByMatch.get(m.date) || 0) + 1);
    }
  }
  const matchTotal = [...datesByMatch.values()].reduce((a,b)=>a+b,0);

  // 로그_선수경기 기준: PLAYER row 카운트
  const pgRows = (pg.rows || []).filter(f).filter(r => r.player === PLAYER);
  const datesByPg = new Map();
  for (const r of pgRows) datesByPg.set(r.date, (datesByPg.get(r.date) || 0) + 1);

  console.log(`\n[${PLAYER} / ${TEAM} / ${SPORT}]`);
  console.log(`로그_매치 기준 출전 라운드: ${matchTotal}`);
  console.log(`로그_선수경기 row 수: ${pgRows.length}`);
  console.log(`\n날짜별 비교 (matchLog rounds | playerGame rows):`);
  const allDates = new Set([...datesByMatch.keys(), ...datesByPg.keys()]);
  [...allDates].sort().forEach(d => {
    const m = datesByMatch.get(d) || 0;
    const p = datesByPg.get(d) || 0;
    const mark = m !== p ? '  <-- 차이' : '';
    console.log(`  ${d}: ${m} | ${p}${mark}`);
  });

  if (pgRows[0]) {
    console.log('\nplayerGame sample row:');
    console.log(pgRows[0]);
  }
})();

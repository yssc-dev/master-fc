#!/usr/bin/env node
// 로그_매치 vs 로그_선수경기 날짜 비교 (team=마스터FC, sport=풋살)
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/compareDates.mjs

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEAM = process.env.TEAM || '마스터FC';
const SPORT = process.env.SPORT || '풋살';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) {
  console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요');
  process.exit(1);
}

async function call(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, authToken: AUTH_TOKEN }),
  });
  return await res.json();
}

const datesOf = (rows, filter) =>
  new Set(rows.filter(filter).map(r => String(r.date || '')).filter(Boolean));

(async () => {
  const [mt, pg] = await Promise.all([
    call({ action: 'getRawMatches', team: '', sport: '' }),
    call({ action: 'getRawPlayerGames', team: '', sport: '' }),
  ]);
  const f = (r) => String(r.team) === TEAM && String(r.sport) === SPORT;
  const matchDates = datesOf(mt.rows || [], f);
  const playerGameDates = datesOf(pg.rows || [], f);

  const onlyInMatch = [...matchDates].filter(d => !playerGameDates.has(d)).sort();
  const onlyInPg = [...playerGameDates].filter(d => !matchDates.has(d)).sort();
  const both = [...matchDates].filter(d => playerGameDates.has(d)).sort();

  console.log(`\n[${TEAM} / ${SPORT}]`);
  console.log(`로그_매치 distinct dates: ${matchDates.size}`);
  console.log(`로그_선수경기 distinct dates: ${playerGameDates.size}`);
  console.log(`\n로그_매치에는 있고 로그_선수경기에는 없는 날짜 (백필 필요): ${onlyInMatch.length}`);
  onlyInMatch.forEach(d => console.log('  -', d));
  console.log(`\n로그_선수경기에만 있는 날짜: ${onlyInPg.length}`);
  onlyInPg.forEach(d => console.log('  -', d));
  console.log(`\n공통: ${both.length}`);
})();

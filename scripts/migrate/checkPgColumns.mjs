#!/usr/bin/env node
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
async function call(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, authToken: AUTH_TOKEN }),
  });
  return await res.json();
}
(async () => {
  const pg = await call({ action: 'getRawPlayerGames', team: '', sport: '' });
  const rows = (pg.rows || []).filter(r => r.team === '마스터FC' && r.sport === '풋살');
  const count = (k) => rows.filter(r => Number(r[k]) > 0 || (typeof r[k] === 'string' && r[k] !== '' && r[k] !== '0')).length;
  console.log(`총 ${rows.length} rows`);
  for (const k of ['games','field_games','keeper_games','goals','assists','owngoals','conceded','cleansheets','crova','goguma','역주행','rank_score']) {
    console.log(`  ${k}: non-zero ${count(k)}`);
  }
})();

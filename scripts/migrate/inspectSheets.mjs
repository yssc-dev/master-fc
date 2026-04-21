#!/usr/bin/env node
// 진단용: 로그_이벤트 + 로그_선수경기 현재 상태 조회
// 실행: APPS_SCRIPT_URL="..." node scripts/migrate/inspectSheets.mjs

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL) {
  console.error('환경변수 APPS_SCRIPT_URL 필요');
  process.exit(1);
}
if (!AUTH_TOKEN) {
  console.error('환경변수 AUTH_TOKEN 필요 (형식: "팀이름:이름:번호4자리")');
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

function summarize(label, resp) {
  console.log(`\n=== ${label} ===`);
  const rows = resp?.rows || [];
  console.log('success:', resp?.success, 'total:', rows.length);
  const teams = new Map();
  const sports = new Map();
  for (const r of rows) {
    const t = String(r.team ?? '');
    const s = String(r.sport ?? '');
    teams.set(t, (teams.get(t) || 0) + 1);
    sports.set(s, (sports.get(s) || 0) + 1);
  }
  console.log('teams (count):', [...teams.entries()].map(([k,v]) => `[${JSON.stringify(k)}:${v}]`).join(' '));
  console.log('sports (count):', [...sports.entries()].map(([k,v]) => `[${JSON.stringify(k)}:${v}]`).join(' '));
  if (rows[0]) console.log('first row keys:', Object.keys(rows[0]).join(','));
  if (rows[0]) console.log('first row:', rows[0]);
}

(async () => {
  const ev = await call({ action: 'getRawEvents', team: '', sport: '' });
  summarize('로그_이벤트', ev);
  const pg = await call({ action: 'getRawPlayerGames', team: '', sport: '' });
  summarize('로그_선수경기', pg);
  const mt = await call({ action: 'getRawMatches', team: '', sport: '' });
  summarize('로그_매치', mt);
})();

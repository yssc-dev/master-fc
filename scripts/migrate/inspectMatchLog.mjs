#!/usr/bin/env node
// 로그_매치 분석: our_team_name / opponent_team_name / 멤버 수 / score
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/inspectMatchLog.mjs --team 마스터FC --sport 풋살

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) { console.error('APPS_SCRIPT_URL, AUTH_TOKEN 필요'); process.exit(1); }

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i+1] && !process.argv[i+1].startsWith('--') ? process.argv[++i] : true;
}

async function call(body) {
  const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: {'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({...body, authToken: AUTH_TOKEN}) });
  return await res.json();
}

const targetDates = ['2026-01-08','2026-01-15','2026-01-22','2026-01-29','2026-02-05','2026-02-12','2026-02-19','2026-02-26','2026-03-05','2026-03-12','2026-03-19','2026-04-16'];

(async () => {
  const mt = await call({ action: 'getRawMatches', team: args.team || '', sport: args.sport || '' });
  const rows = (mt.rows || []).filter(r => targetDates.includes(r.date));
  console.log(`로그_매치 rows on target dates: ${rows.length}`);

  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  for (const date of [...byDate.keys()].sort()) {
    const list = byDate.get(date);
    const teamNames = new Set();
    let emptyHome = 0, emptyAway = 0, hasScore = 0;
    const sample = [];
    for (const r of list) {
      if (r.our_team_name) teamNames.add(r.our_team_name);
      if (r.opponent_team_name) teamNames.add(r.opponent_team_name);
      const home = JSON.parse(r.our_members_json || '[]');
      const away = JSON.parse(r.opponent_members_json || '[]');
      if (home.length === 0) emptyHome++;
      if (away.length === 0) emptyAway++;
      if ((r.our_score||0) + (r.opponent_score||0) > 0) hasScore++;
      if (sample.length < 2) sample.push({ match_id: r.match_id, our: r.our_team_name, opp: r.opponent_team_name, score: `${r.our_score}:${r.opponent_score}`, home: home.length, away: away.length });
    }
    console.log(`\n[${date}] ${list.length} rows | empty home=${emptyHome} away=${emptyAway} | hasScore=${hasScore}`);
    console.log(`  teams: ${[...teamNames].join(', ')}`);
    console.log(`  sample:`, sample);
  }
})();

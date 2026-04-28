#!/usr/bin/env node
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEAM = process.env.TEAM || '마스터FC';
const SPORT = process.env.SPORT || '풋살';
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}
(async () => {
  const mt = await call({ action: 'getRawMatches', team: '', sport: '' });
  const rows = (mt.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { rows: 0, hasTeamName: 0, hasGk: 0, awayMembersTotal: 0, homeMembersTotal: 0 });
    const e = byDate.get(r.date);
    e.rows++;
    if (r.our_team_name) e.hasTeamName++;
    if (r.our_gk || r.opponent_gk) e.hasGk++;
    try { e.awayMembersTotal += JSON.parse(r.opponent_members_json || '[]').length; } catch {}
    try { e.homeMembersTotal += JSON.parse(r.our_members_json || '[]').length; } catch {}
  }
  console.log(`date | rows | teamName | gk | home_members | away_members | reliable`);
  console.log(`-`.repeat(80));
  const sorted = [...byDate.keys()].sort();
  for (const d of sorted) {
    const e = byDate.get(d);
    const reliable = (e.hasTeamName > 0 || e.hasGk > 0) && e.awayMembersTotal > 0;
    console.log(`${d} | ${String(e.rows).padStart(3)} | ${String(e.hasTeamName).padStart(3)} | ${String(e.hasGk).padStart(3)} | ${String(e.homeMembersTotal).padStart(4)} | ${String(e.awayMembersTotal).padStart(4)} | ${reliable ? '✓' : '✗'}`);
  }
})();

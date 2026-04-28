#!/usr/bin/env node
// dry-run 결과와 기존 로그_선수경기를 비교 → 실제 어떤 (date,player,field)가 바뀌는지 출력
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEAM = '마스터FC', SPORT = '풋살';
async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}

(async () => {
  const [mt, ev, pg] = await Promise.all([
    call({ action: 'getRawMatches', team: '', sport: '' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
    call({ action: 'getRawPlayerGames', team: '', sport: '' }),
  ]);

  // 신뢰 가능 날짜
  const allMatches = (mt.rows || []).filter(r => r.team === TEAM && r.sport === SPORT);
  const dateStat = new Map();
  for (const m of allMatches) {
    if (!dateStat.has(m.date)) dateStat.set(m.date, { teamName: 0, away: 0 });
    const s = dateStat.get(m.date);
    if (m.our_team_name) s.teamName++;
    try { s.away += JSON.parse(m.opponent_members_json || '[]').length; } catch {}
  }
  const reliable = new Set([...dateStat].filter(([d, s]) => s.teamName > 0 && s.away > 0).map(([d]) => d));

  // 기존 (date,player) — 합산
  const existing = new Map();
  for (const r of (pg.rows || []).filter(r => r.team === TEAM && r.sport === SPORT && reliable.has(r.date))) {
    const k = `${r.date}|${r.player}`;
    if (!existing.has(k)) existing.set(k, { games: 0, field_games: 0, keeper_games: 0, goals: 0, assists: 0, conceded: 0, cleansheets: 0, owngoals: 0, crova: 0, goguma: 0, '역주행': 0, rank_score: 0, rowCount: 0 });
    const e = existing.get(k);
    e.rowCount++;
    for (const f of ['games','field_games','keeper_games','goals','assists','conceded','cleansheets','owngoals','crova','goguma','역주행','rank_score']) e[f] += Number(r[f]) || 0;
  }

  // 신규 계산 (matchLog 기반 rounds)
  const matches = allMatches.filter(m => reliable.has(m.date));
  const events = (ev.rows || []).filter(r => r.team === TEAM && r.sport === SPORT && reliable.has(r.date));

  const roundsByKey = new Map();
  for (const m of matches) {
    const key = `${m.date}|${m.match_id}`;
    if (!roundsByKey.has(key)) roundsByKey.set(key, { date: m.date, members: new Set(), gkConceded: new Map() });
    const r = roundsByKey.get(key);
    let h=[], a=[];
    try { h = JSON.parse(m.our_members_json || '[]'); } catch {}
    try { a = JSON.parse(m.opponent_members_json || '[]'); } catch {}
    h.forEach(n => n && r.members.add(n));
    a.forEach(n => n && r.members.add(n));
    if (m.our_gk) r.gkConceded.set(m.our_gk, Number(m.opponent_score) || 0);
    if (m.opponent_gk) r.gkConceded.set(m.opponent_gk, Number(m.our_score) || 0);
  }
  for (const e of events) {
    const key = `${e.date}|${e.match_id}`;
    if (!roundsByKey.has(key)) continue;
    const r = roundsByKey.get(key);
    if (e.player) r.members.add(e.player);
    if (e.related_player) r.members.add(e.related_player);
  }
  const agg = new Map();
  for (const r of roundsByKey.values()) {
    for (const name of r.members) {
      const k = `${r.date}|${name}`;
      if (!agg.has(k)) agg.set(k, { rounds: 0 });
      agg.get(k).rounds++;
    }
  }

  const allKeys = new Set([...existing.keys(), ...agg.keys()]);
  const changes = []; // {date, player, kind, field, before, after}

  for (const k of allKeys) {
    const [date, player] = k.split('|');
    const e = existing.get(k);
    const a = agg.get(k);

    if (a && !e) {
      // 신규 행 (이벤트 로그로 부분 채움)
      changes.push({ date, player, kind: 'NEW', field: 'games', before: '-', after: a.rounds });
      continue;
    }
    if (e && !a) {
      // matchLog rounds 없음 → games=0, field_games=keeper만큼 음수 방지(0)
      if (e.games > 0) changes.push({ date, player, kind: 'CHG', field: 'games', before: e.games, after: 0 });
      if (e.field_games !== Math.max(0, 0 - e.keeper_games)) changes.push({ date, player, kind: 'CHG', field: 'field_games', before: e.field_games, after: Math.max(0, 0 - e.keeper_games) });
      continue;
    }
    // both exist
    const newGames = a.rounds;
    const newField = Math.max(0, a.rounds - e.keeper_games);
    if (e.games !== newGames) changes.push({ date, player, kind: 'CHG', field: 'games', before: e.games, after: newGames });
    if (e.field_games !== newField) changes.push({ date, player, kind: 'CHG', field: 'field_games', before: e.field_games, after: newField });
    // 기타 필드는 보존이라 비교 X (rowCount>1이었으면 합산되니 알려줌)
    if (e.rowCount > 1) {
      changes.push({ date, player, kind: 'MERGE', field: `${e.rowCount}rows→1`, before: '', after: `keeper=${e.keeper_games} goals=${e.goals} conceded=${e.conceded}` });
    }
  }

  // 요약
  const byKind = changes.reduce((m, c) => { m[c.kind] = (m[c.kind] || 0) + 1; return m; }, {});
  console.log(`\n총 변경 건: ${changes.length}`);
  console.log(`  NEW (matchLog에 있고 기존 pg엔 없는 행): ${byKind.NEW || 0}`);
  console.log(`  CHG (games/field_games 갱신): ${byKind.CHG || 0}`);
  console.log(`  MERGE (같은 date+player에 여러 행 → 합산): ${byKind.MERGE || 0}`);

  console.log(`\n--- 날짜별 NEW 분포 ---`);
  const newByDate = {};
  changes.filter(c => c.kind === 'NEW').forEach(c => { newByDate[c.date] = (newByDate[c.date] || 0) + 1; });
  for (const d of Object.keys(newByDate).sort()) console.log(`  ${d}: +${newByDate[d]}명`);

  console.log(`\n--- MERGE (중복 행 합산) ---`);
  changes.filter(c => c.kind === 'MERGE').forEach(c => console.log(`  ${c.date} ${c.player}: ${c.field} (${c.after})`));

  console.log(`\n--- CHG 샘플 (games 또는 field_games 변경) 30개 ---`);
  changes.filter(c => c.kind === 'CHG').slice(0, 30).forEach(c => console.log(`  ${c.date} ${c.player} ${c.field}: ${c.before} → ${c.after}`));

  console.log(`\n--- NEW 샘플 (matchLog에 있는데 pg에 없던 (date,player)) 20개 ---`);
  changes.filter(c => c.kind === 'NEW').slice(0, 20).forEach(c => console.log(`  ${c.date} ${c.player}: rounds=${c.after}`));
})();

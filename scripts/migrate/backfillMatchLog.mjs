#!/usr/bin/env node
// Migration: 로그_이벤트 + 로그_선수경기 → 로그_매치 재구성 (legacy phase)
// Firebase stateJSON이 있는 날짜는 정확한 데이터로 덮어쓰기 (firebase phase)
//
// 실행:
//   APPS_SCRIPT_URL="..." node scripts/migrate/backfillMatchLog.mjs --team masterfc --sport 풋살 --dry-run
//   APPS_SCRIPT_URL="..." node scripts/migrate/backfillMatchLog.mjs --team masterfc --sport 풋살 --apply

import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
if (!args.team || !args.sport) {
  console.error('Usage: --team <team> --sport <풋살|축구> [--phase legacy|firebase|all] [--dry-run|--apply]');
  process.exit(1);
}
const PHASE = args.phase || 'all';
const DRY_RUN = !args.apply;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
if (!APPS_SCRIPT_URL) {
  console.error('환경변수 APPS_SCRIPT_URL 필요 (Apps Script 웹앱 URL)');
  process.exit(1);
}

async function main() {
  console.log(`[migrate] team=${args.team} sport=${args.sport} phase=${PHASE} dry=${DRY_RUN}`);

  if (!DRY_RUN) {
    console.log('[backup] 로그_이벤트 백업 시작');
    const b1 = await callAppsScript({ action: 'backupSheet', sheetName: '로그_이벤트' });
    console.log('[backup]', b1);
    if (!b1.success) throw new Error('백업 실패: 로그_이벤트');
    const b2 = await callAppsScript({ action: 'backupSheet', sheetName: '로그_선수경기' });
    console.log('[backup]', b2);
    if (!b2.success) throw new Error('백업 실패: 로그_선수경기');

    await callAppsScript({ action: 'ensureEventLogHasGameId' });
    await callAppsScript({ action: 'migrateEventTypes' });
    await callAppsScript({ action: 'migrateMatchIds' });
  }

  if (PHASE === 'legacy' || PHASE === 'all') {
    await runLegacyPhase();
  }
  if (PHASE === 'firebase' || PHASE === 'all') {
    await runFirebasePhase();
  }
  console.log('[migrate] 완료');
}

async function runLegacyPhase() {
  console.log('\n=== PHASE: legacy (로그_이벤트 + 로그_선수경기 → 로그_매치) ===');
  const evRes = await callAppsScript({ action: 'getRawEvents', team: args.team, sport: args.sport });
  const pgRes = await callAppsScript({ action: 'getRawPlayerGames', team: args.team, sport: args.sport });
  const events = evRes.rows || [];
  const playerGames = pgRes.rows || [];
  console.log(`  events=${events.length} playerGames=${playerGames.length}`);

  const roundKey = e => `${e.date}|${e.match_id}|${e.our_team}|${e.opponent}`;
  const rounds = new Map();
  for (const e of events) {
    const k = roundKey(e);
    if (!rounds.has(k)) rounds.set(k, { date: e.date, match_id: e.match_id, our_team: e.our_team, opponent: e.opponent, events: [] });
    rounds.get(k).events.push(e);
  }
  console.log(`  고유 라운드: ${rounds.size}`);

  const membersByDateTeam = new Map();
  for (const p of playerGames) {
    const k = `${p.date}|${p.session_team}`;
    if (!membersByDateTeam.has(k)) membersByDateTeam.set(k, new Set());
    membersByDateTeam.get(k).add(p.player);
  }

  const matchRows = [];
  let unrecognizedMid = 0;
  for (const [, r] of rounds) {
    const mid = String(r.match_id || '');
    const roundIdx = args.sport === '풋살' ? parseInt((mid.match(/^R(\d+)_C/) || [])[1], 10) : null;
    const courtId = args.sport === '풋살' ? parseInt((mid.match(/_C(\d+)$/) || [])[1], 10) : null;
    if (args.sport === '풋살' && (isNaN(roundIdx) || isNaN(courtId))) { unrecognizedMid++; continue; }
    const home = Array.from(membersByDateTeam.get(`${r.date}|${r.our_team}`) || []);
    const away = Array.from(membersByDateTeam.get(`${r.date}|${r.opponent}`) || []);
    const ourScore = r.events.filter(e => e.event_type === 'goal').length;
    const oppOwnGoal = r.events.filter(e => e.event_type === 'owngoal').length;
    const concede = r.events.filter(e => e.event_type === 'concede');
    const gk = concede.length > 0 ? concede[0].player : '';
    matchRows.push({
      team: args.team, sport: args.sport, mode: '기본', tournament_id: '',
      date: r.date,
      game_id: `legacy_${r.date}_${args.team}`,
      match_idx: 0,
      round_idx: roundIdx ?? '', court_id: courtId ?? '',
      match_id: mid,
      our_team_name: r.our_team, opponent_team_name: r.opponent,
      our_members_json: JSON.stringify(home),
      opponent_members_json: JSON.stringify(away),
      our_score: ourScore, opponent_score: concede.length + oppOwnGoal,
      our_gk: gk, opponent_gk: '',
      formation: '', our_defenders_json: '[]',
      is_extra: false,
      input_time: new Date().toISOString(),
    });
  }
  console.log(`  생성 rows=${matchRows.length} 미인식 match_id=${unrecognizedMid}`);

  if (DRY_RUN) {
    console.log('  [DRY-RUN] 샘플 5개:', matchRows.slice(0, 5));
    return;
  }
  const BATCH = 200;
  for (let i = 0; i < matchRows.length; i += BATCH) {
    const slice = matchRows.slice(i, i + BATCH);
    const res = await callAppsScript({ action: 'writeRawMatches', data: { rows: slice } });
    console.log(`  batch ${i}-${i + slice.length}: count=${res.count} skipped=${res.skipped}`);
  }
  console.log('  ℹ  legacy_* game_id를 로그_이벤트에 주입하려면 별도 UPDATE 엔드포인트 필요 (후속)');
}

async function runFirebasePhase() {
  console.log('\n=== PHASE: firebase (최근 3일치 정확 덮어쓰기) ===');
  console.log('  ⚠ Firebase 읽기는 브라우저 SDK 의존 — 별도 관리 UI(Task 17)에서 실행 권장');
  console.log('  현재 스크립트에서는 Firebase 파트 스킵');
}

async function callAppsScript(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);
  return await res.json();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out['dry-run'] = true;
    else if (a === '--apply') out.apply = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = v;
    }
  }
  return out;
}

main().catch(err => { console.error(err); process.exit(1); });

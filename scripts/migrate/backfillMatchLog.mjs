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
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL) {
  console.error('환경변수 APPS_SCRIPT_URL 필요 (Apps Script 웹앱 URL)');
  process.exit(1);
}
if (!AUTH_TOKEN) {
  console.error('환경변수 AUTH_TOKEN 필요 (형식: "팀이름:이름:번호4자리")');
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
  const dateFrom = args['date-from'] || null;
  const dateTo = args['date-to'] || null;
  if (dateFrom || dateTo) console.log(`  날짜 필터: ${dateFrom || '*'} ~ ${dateTo || '*'}`);
  console.log('  → getRawEvents 호출...');
  const t1 = Date.now();
  const evRes = await callAppsScript({ action: 'getRawEvents', team: args.team, sport: args.sport });
  console.log(`  ← getRawEvents 응답 ${Date.now()-t1}ms rows=${(evRes.rows||[]).length}`);
  console.log('  → getRawPlayerGames 호출...');
  const t2 = Date.now();
  const pgRes = await callAppsScript({ action: 'getRawPlayerGames', team: args.team, sport: args.sport });
  console.log(`  ← getRawPlayerGames 응답 ${Date.now()-t2}ms rows=${(pgRes.rows||[]).length}`);
  const inRange = (d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  const events = (evRes.rows || []).filter(e => inRange(e.date));
  const playerGames = (pgRes.rows || []).filter(p => inRange(p.date));
  console.log(`  events=${events.length} playerGames=${playerGames.length}`);

  const roundKey = e => `${e.date}|${e.match_id}|${e.our_team}|${e.opponent}`;
  const rounds = new Map();
  for (const e of events) {
    const k = roundKey(e);
    if (!rounds.has(k)) rounds.set(k, { date: e.date, match_id: e.match_id, our_team: e.our_team, opponent: e.opponent, events: [] });
    rounds.get(k).events.push(e);
  }
  console.log(`  고유 라운드: ${rounds.size}`);

  // 1차: 로그_선수경기의 session_team으로 그룹핑 (정상 데이터)
  const membersByDateTeam = new Map();
  for (const p of playerGames) {
    if (!p.session_team) continue;
    const k = `${p.date}|${p.session_team}`;
    if (!membersByDateTeam.has(k)) membersByDateTeam.set(k, new Set());
    membersByDateTeam.get(k).add(p.player);
  }
  // 2차: 로그_이벤트의 그날 모든 라운드를 모아서 팀별 멤버 풀 생성 (session_team 누락 시 폴백)
  const eventsPoolByDateTeam = new Map();
  const addToPool = (date, team, name) => {
    if (!date || !team || !name) return;
    const k = `${date}|${team}`;
    if (!eventsPoolByDateTeam.has(k)) eventsPoolByDateTeam.set(k, new Set());
    eventsPoolByDateTeam.get(k).add(name);
  };
  for (const e of events) {
    if (e.event_type === 'goal') {
      addToPool(e.date, e.our_team, e.player);
      addToPool(e.date, e.our_team, e.related_player);
    } else if (e.event_type === 'owngoal') {
      addToPool(e.date, e.our_team, e.player);
    } else if (e.event_type === 'concede') {
      addToPool(e.date, e.opponent, e.player);
    }
  }

  // 3차: 그날 라운드들의 home/away player set을 union-find로 연결해 팀 클러스터 추정
  // (같은 사람이 다른 라운드에 등장하면 그 라운드들의 같은 사이드 멤버도 한 팀)
  const ufByDate = new Map(); // date -> { parent: Map, find, union }
  const ensureUf = (date) => {
    if (!ufByDate.has(date)) {
      const parent = new Map();
      const find = (x) => {
        if (!parent.has(x)) parent.set(x, x);
        let p = parent.get(x);
        if (p === x) return x;
        const r = find(p);
        parent.set(x, r);
        return r;
      };
      const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
      ufByDate.set(date, { parent, find, union });
    }
    return ufByDate.get(date);
  };
  // 라운드별 home/away 추출 (events 기반)
  const roundHomeAway = (r) => {
    const home = new Set(), away = new Set();
    for (const e of r.events) {
      if (e.event_type === 'goal') { if (e.player) home.add(e.player); if (e.related_player) home.add(e.related_player); }
      else if (e.event_type === 'owngoal') { if (e.player) home.add(e.player); }
      else if (e.event_type === 'concede') { if (e.player) away.add(e.player); }
    }
    return { home, away };
  };
  // home(골/어시/자책 기록자) 내부만 union — away(GK)는 cluster 오염 방지를 위해 union에서 제외
  for (const [, r] of rounds) {
    const uf = ensureUf(r.date);
    const { home } = roundHomeAway(r);
    const ha = [...home];
    for (let i = 1; i < ha.length; i++) uf.union(ha[0], ha[i]);
  }
  const clusterMembersByDatePlayer = new Map();
  for (const [date, uf] of ufByDate) {
    const groups = new Map();
    for (const p of uf.parent.keys()) {
      const root = uf.find(p);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(p);
    }
    for (const arr of groups.values()) {
      for (const p of arr) clusterMembersByDatePlayer.set(`${date}|${p}`, arr);
    }
  }

  const matchRows = [];
  let unrecognizedMid = 0;
  for (const [, r] of rounds) {
    const mid = String(r.match_id || '');
    const roundIdx = args.sport === '풋살' ? parseInt((mid.match(/^R(\d+)_C/) || [])[1], 10) : null;
    const courtId = args.sport === '풋살' ? parseInt((mid.match(/_C(\d+)$/) || [])[1], 10) : null;
    if (args.sport === '풋살' && (isNaN(roundIdx) || isNaN(courtId))) { unrecognizedMid++; continue; }

    let home = Array.from(membersByDateTeam.get(`${r.date}|${r.our_team}`) || []);
    let away = Array.from(membersByDateTeam.get(`${r.date}|${r.opponent}`) || []);

    // 폴백1: 그날 같은 팀명의 모든 라운드 events를 모아서 만든 풀 (our_team이 채워진 경우)
    if (home.length === 0 && r.our_team) home = Array.from(eventsPoolByDateTeam.get(`${r.date}|${r.our_team}`) || []);
    if (away.length === 0 && r.opponent) away = Array.from(eventsPoolByDateTeam.get(`${r.date}|${r.opponent}`) || []);

    // 폴백2: 그날 같은 팀명(events.our_team)의 모든 라운드 events에서 모은 풀
    // ("팀 [캡틴]" 라벨이 살아있어서 (date, our_team)로 그루핑하면 정확)
    if (home.length === 0 && r.our_team) home = Array.from(eventsPoolByDateTeam.get(`${r.date}|${r.our_team}`) || []);
    if (away.length === 0 && r.opponent) away = Array.from(eventsPoolByDateTeam.get(`${r.date}|${r.opponent}`) || []);
    // 폴백3: 그래도 비면 그 라운드 events에 등장한 사람만
    const { home: roundHome, away: roundAway } = roundHomeAway(r);
    if (home.length === 0) home = [...roundHome];
    if (away.length === 0) away = [...roundAway];

    const ourScore = r.events.filter(e => e.event_type === 'goal').length;
    const ourOwnGoal = r.events.filter(e => e.event_type === 'owngoal').length;
    const concede = r.events.filter(e => e.event_type === 'concede');
    const opponentScore = concede.length + ourOwnGoal;
    // our_gk: events엔 없음 → 그날 그 팀의 keeper_games>=1 선수 중 첫 명 (불완전, 비워두는 게 안전할 수도)
    const our_gk = '';
    const opponent_gk = concede.length > 0 ? concede[0].player : '';
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
      our_score: ourScore,
      // opponent_score: 우리가 실점한 concede 이벤트 + 우리팀 자책골
      opponent_score: opponentScore,
      our_gk, opponent_gk,
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
  const datesTouched = [...new Set(matchRows.map(r => r.date))].sort();
  console.log(`  대상 날짜 ${datesTouched.length}개: ${datesTouched.join(', ')}`);
  for (const d of datesTouched) {
    const del = await callAppsScript({ action: 'deleteRawMatchesByDate', team: args.team, sport: args.sport, date: d });
    console.log(`  delete ${d}: ${JSON.stringify(del)}`);
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
    body: JSON.stringify({ ...body, authToken: AUTH_TOKEN }),
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

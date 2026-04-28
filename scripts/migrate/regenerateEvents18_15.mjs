#!/usr/bin/env node
// 마스터FC 포인트 로그 1/8, 1/15 행을 로그_이벤트 형식으로 재집계.
// 기존 로그_이벤트의 1/8, 1/15 행을 삭제 후 새로 작성.
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/regenerateEvents18_15.mjs [--dry-run]

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) { console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');

const TEAM = '마스터FC';
const SPORT = '풋살';
const DATES = ['2026-01-08', '2026-01-15'];

async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}

(async () => {
  const pl = await call({ action: 'getPointLog', team: TEAM, pointLogSheet: '마스터FC 포인트 로그' });
  const ple = (pl.events || []).filter(e => DATES.includes(e.date));
  console.log(`마스터FC 포인트 로그 1/8+1/15 행: ${ple.length}`);

  // pointLog 행 → 로그_이벤트 형식 변환 (apps-script _readFutsalPointSchema 와 동일 규칙)
  const inputTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = [];
  for (const e of ple) {
    const matchId = String(e.matchId || '').replace(/경기$/, '');
    const matchIdEv = matchId ? `R${matchId}_C0` : '';
    const common = {
      team: TEAM, sport: SPORT, mode: '기본', tournament_id: '',
      date: e.date, match_id: matchIdEv, our_team: e.myTeam || '', opponent: e.opponent || '',
      position: '', input_time: inputTime,
    };
    if (e.scorer) {
      rows.push({ ...common, event_type: 'goal', player: e.scorer, related_player: e.assist || '' });
    }
    if (e.ownGoal) {
      rows.push({ ...common, event_type: 'owngoal', player: e.ownGoal, related_player: '' });
    }
    if (e.concedingGk) {
      const cOurTeam = e.scorer ? (e.opponent || '') : (e.myTeam || '');
      const cOpponent = e.scorer ? (e.myTeam || '') : (e.opponent || '');
      rows.push({ ...common, our_team: cOurTeam, opponent: cOpponent, event_type: 'concede', player: e.concedingGk, related_player: '' });
    }
  }

  const cnt = (d, t) => rows.filter(r => r.date === d && r.event_type === t).length;
  console.log(`\n변환 결과: ${rows.length}행`);
  for (const d of DATES) {
    console.log(`  ${d}: goal=${cnt(d,'goal')} owngoal=${cnt(d,'owngoal')} concede=${cnt(d,'concede')}`);
  }

  if (DRY) {
    console.log('\n[DRY] 샘플 5개:', rows.slice(0, 5));
    return;
  }

  // 기존 1/8, 1/15 삭제
  for (const d of DATES) {
    const del = await call({ action: 'deleteRawEventsByDate', team: TEAM, sport: SPORT, date: d });
    console.log(`  delete ${d}: ${JSON.stringify(del)}`);
  }
  // 새로 쓰기
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await call({ action: 'writeRawEvents', data: { rows: slice, skipDedupe: true } });
    console.log(`  batch ${i}-${i + slice.length}: ${JSON.stringify(res)}`);
  }
  console.log('완료.');
})();

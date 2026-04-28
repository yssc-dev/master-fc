#!/usr/bin/env node
// 모든 팀 포인트 로그 → 로그_이벤트 전체 재집계 (신 스키마: concede_gk 컬럼 통합)
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/reimportAllPointLogs.mjs [--dry-run]

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) { console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');

// 재집계 대상: { team, sport, pointSheet }
const TARGETS = [
  { team: '마스터FC', sport: '풋살', pointSheet: '마스터FC 포인트 로그' },
  // 하버FC 등 추가 팀 발견 시 여기에 추가
  // { team: '하버FC', sport: '풋살', pointSheet: '하버FC 포인트 로그' },
];

async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }),
  });
  return r.json();
}

(async () => {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.team} (${t.sport}) ← ${t.pointSheet} ===`);
    if (DRY) {
      const pl = await call({ action: 'getPointLog', team: t.team, pointLogSheet: t.pointSheet });
      console.log(`  pointLog 행 수: ${(pl.events || []).length}`);
      continue;
    }
    // apps-script 의 _reimportFutsalPointForTeam 을 호출 (action 추가 필요 — Task 8)
    const res = await call({ action: 'reimportPointLog', team: t.team, sport: t.sport, pointSheet: t.pointSheet });
    console.log(`  ${JSON.stringify(res)}`);
  }
  console.log('\n완료.');
})();

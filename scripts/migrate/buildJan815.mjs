#!/usr/bin/env node
// 1/8, 1/15 선수별집계기록 로그를 4개 이미지에서 파싱한 데이터로 재구성
// 시트27에 쓰기 (시트27은 dispose-able 백업, 원본은 마스터FC 선수별집계기록 로그)
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/buildJan815.mjs [--apply] [--sheet=시트27]

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) { console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요'); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const APPLY = !!args.apply;
const SHEET_NAME = args.sheet || '시트27';
const TEAM = '마스터FC';
const D8 = '2026-01-08';
const D15 = '2026-01-15';

async function call(b) {
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, authToken: AUTH_TOKEN }) });
  return r.json();
}

// ═══════════════════════════════════════════════════════════════════
// 1/8 데이터 (Image #6 필드 + Image #7 키퍼)
// 컬럼: g(골), a(어시), cs(클린시트), kg(키퍼경기수), c(실점)
// 1/8은 역주행/크로바/고구마/팀순위점수 = 0 (이미지에서 빈칸)
// ═══════════════════════════════════════════════════════════════════
const J8 = {
  '주건호':   { g: 4, a: 2, cs: 0, kg: 2, c: 5 },
  '조재상':   { g: 1, a: 5, cs: 0, kg: 1, c: 1 },
  '조승훈':   { g: 3, a: 1, cs: 1, kg: 2, c: 1 },  // pointLog truth (events 유령행 R5_C0 이영문→조승훈 무시)
  '최지훈':   { g: 3, a: 1, cs: 1, kg: 1, c: 0 },
  '조경준':   { g: 4, a: 0, cs: 1, kg: 1, c: 0 },
  '김성태':   { g: 3, a: 1, cs: 0, kg: 1, c: 1 },
  '양병선':   { g: 1, a: 3, cs: 0, kg: 1, c: 1 },
  '이동규':   { g: 0, a: 2, cs: 2, kg: 2, c: 0 },
  '이영문':   { g: 3, a: 0, cs: 1, kg: 2, c: 1 },
  '노필선':   { g: 3, a: 0, cs: 1, kg: 2, c: 1 },
  '우상운':   { g: 2, a: 2, cs: 0, kg: 1, c: 3 },
  '정보영':   { g: 0, a: 2, cs: 2, kg: 2, c: 0 },  // pointLog는 1만 기록했지만 1/8 3경기 조경준골 어시 누락 → 실제 2
  '채수찬':   { g: 2, a: 1, cs: 0, kg: 1, c: 2 },
  '우창호':   { g: 1, a: 1, cs: 0, kg: 1, c: 1 },
  '정동근':   { g: 2, a: 0, cs: 0, kg: 1, c: 2 },
  '김성환':   { g: 0, a: 1, cs: 1, kg: 2, c: 1 },
  '김홍익':   { g: 1, a: 1, cs: 0, kg: 2, c: 3 },
  '김장수':   { g: 0, a: 2, cs: 0, kg: 2, c: 3 },
  '박재운':   { g: 1, a: 0, cs: 0, kg: 2, c: 3 },
  '김형근':   { g: 0, a: 1, cs: 0, kg: 2, c: 3 },
  '김진수':   { g: 0, a: 0, cs: 0, kg: 0, c: 0 },
  '남인진':   { g: 0, a: 0, cs: 0, kg: 0, c: 0 },
  '신철수':   { g: 0, a: 0, cs: 0, kg: 2, c: 2 },
  '임호연':   { g: 1, a: 1, cs: 1, kg: 1, c: 0 },  // 이미지 #6에서 누락, pointLog로 보정
  '김주열':   { g: 0, a: 0, cs: 0, kg: 1, c: 1 },  // 키퍼 only
};

// ═══════════════════════════════════════════════════════════════════
// 1/15 누적 데이터 (Image #8 필드 - cumulative + UP delta)
// UP에 표시된 값이 1/15 순수 증가량
// 1/8엔 역주행/크로바/고구마 = 0이므로 cumulative = 1/15 순수값
// ═══════════════════════════════════════════════════════════════════
// 1/15 only: { g, a, cs, crova, goguma } (UP 직접 사용 + cumulative for crova/goguma)
const J15_FIELD = {
  '조재상':   { g: 4, a: 2, cs: 1, crova: 2, goguma: 0 },
  '주건호':   { g: 4, a: 0, cs: 0, crova: 0, goguma: 0 },
  '이영문':   { g: 1, a: 2, cs: 1, crova: 2, goguma: 0 },
  '노필선':   { g: 2, a: 2, cs: 1, crova: 0, goguma: 0 },
  '정동근':   { g: 2, a: 1, cs: 2, crova: 2, goguma: 0 },
  '조승훈':   { g: 1, a: 1, cs: 0, crova: 0, goguma: 0 },  // pointLog truth (events R5_C0 dup 무시)
  '조경준':   { g: 2, a: 1, cs: 0, crova: 0, goguma: 1 },
  '이동규':   { g: 1, a: 0, cs: 2, crova: 0, goguma: 0 },
  '제갈종주': { g: 1, a: 6, cs: 0, crova: 0, goguma: 0 },
  '우상운':   { g: 1, a: 1, cs: 1, crova: 0, goguma: 1 },
  '정보영':   { g: 1, a: 1, cs: 0, crova: 0, goguma: 0 },
  '채수찬':   { g: 2, a: 1, cs: 0, crova: 0, goguma: 0 },
  '최지훈':   { g: 0, a: 0, cs: 0, crova: 0, goguma: 0 },
  '김성태':   { g: 0, a: 0, cs: 1, crova: 0, goguma: 0 },
  '양병선':   { g: 1, a: 0, cs: 0, crova: 0, goguma: 0 },
  '박재운':   { g: 0, a: 1, cs: 3, crova: 0, goguma: 0 },
  '유재영':   { g: 2, a: 1, cs: 1, crova: 0, goguma: 0 },
  '차진옥':   { g: 0, a: 1, cs: 1, crova: 2, goguma: 0 },
  '우창호':   { g: 0, a: 0, cs: 1, crova: 0, goguma: 0 },
  '김성환':   { g: 0, a: 1, cs: 0, crova: 0, goguma: 0 },
  '김형근':   { g: 0, a: 0, cs: 2, crova: 0, goguma: 0 },
  '서라현':   { g: 1, a: 0, cs: 0, crova: 2, goguma: 0 },
  '김홍익':   { g: 0, a: 0, cs: 1, crova: 0, goguma: 1 },
  '김장수':   { g: 0, a: 0, cs: 0, crova: 0, goguma: 0 },
  '김진수':   { g: 2, a: 0, cs: 0, crova: 0, goguma: 0 },
  '남인진':   { g: 0, a: 0, cs: 0, crova: 2, goguma: 0 },
  '김형욱':   { g: 1, a: 0, cs: 1, crova: 0, goguma: 0 },
  '성균용':   { g: 1, a: 1, cs: 1, crova: 0, goguma: 0 },
  '김영중':   { g: 1, a: 0, cs: 0, crova: 0, goguma: 0 },
  '김종현':   { g: 0, a: 0, cs: 1, crova: 0, goguma: 0 },
  '박형조':   { g: 1, a: 0, cs: 0, crova: 0, goguma: 0 },
  '신철수':   { g: 0, a: 0, cs: 0, crova: 0, goguma: 0 },
  '신관수':   { g: 0, a: 1, cs: 0, crova: 0, goguma: 1 },
  '오희종':   { g: 0, a: 0, cs: 0, crova: 0, goguma: 0 },
  '김의선':   { g: 0, a: 0, cs: 0, crova: 0, goguma: 1 },
  // 하단 4개 (이미지 #8 별도 행)
  '임호연':   { g: 1, a: 0, cs: 0, crova: 0, goguma: 0 },
  '김주열':   { g: 1, a: 0, cs: 1, crova: 0, goguma: 1 },
  '김병기':   { g: 1, a: 0, cs: 1, crova: 0, goguma: 0 },
  '정도현':   { g: 1, a: 0, cs: 0, crova: 0, goguma: 0 },
};

// ═══════════════════════════════════════════════════════════════════
// 1/15 키퍼 (Image #9 누적) → 1/8 키퍼와 비교해서 1/15 only 도출
// ═══════════════════════════════════════════════════════════════════
const J15_KEEPER_CUM = {
  '이동규':   { kg: 4, c: 0, cs: 4 },
  '박재운':   { kg: 5, c: 3, cs: 3 },
  '노필선':   { kg: 3, c: 1, cs: 2 },
  '정보영':   { kg: 3, c: 1, cs: 2 },
  '정동근':   { kg: 3, c: 2, cs: 2 },
  '김형근':   { kg: 4, c: 3, cs: 2 },
  '이영문':   { kg: 4, c: 3, cs: 2 },
  '김종현':   { kg: 1, c: 0, cs: 1 },
  '김형욱':   { kg: 1, c: 0, cs: 1 },
  '유재영':   { kg: 1, c: 0, cs: 1 },
  '차진옥':   { kg: 1, c: 0, cs: 1 },
  '최지훈':   { kg: 1, c: 0, cs: 1 },
  '김성태':   { kg: 2, c: 1, cs: 1 },
  '김주열':   { kg: 2, c: 1, cs: 1 },
  '김병기':   { kg: 2, c: 1, cs: 1 },
  '조재상':   { kg: 2, c: 1, cs: 1 },
  '우창호':   { kg: 3, c: 2, cs: 1 },
  '조승훈':   { kg: 3, c: 2, cs: 1 },
  '김성환':   { kg: 3, c: 3, cs: 1 },
  '김홍익':   { kg: 4, c: 4, cs: 1 },
  '임호연':   { kg: 2, c: 2, cs: 1 },
  '우상운':   { kg: 2, c: 3, cs: 1 },
  '조경준':   { kg: 2, c: 3, cs: 1 },
  '주건호':   { kg: 3, c: 5, cs: 1 },
  '신철수':   { kg: 2, c: 2, cs: 0 },
  '양병선':   { kg: 2, c: 2, cs: 0 },
  '김장수':   { kg: 2, c: 3, cs: 0 },
  '채수찬':   { kg: 2, c: 3, cs: 0 },
  '김영중':   { kg: 1, c: 1, cs: 0 },
  '서라현':   { kg: 2, c: 2, cs: 0 },
  '신관수':   { kg: 1, c: 1, cs: 0 },
  '오희종':   { kg: 1, c: 1, cs: 0 },
  '제갈종주': { kg: 1, c: 1, cs: 0 },
  '정도현':   { kg: 1, c: 1, cs: 0 },
  '김진수':   { kg: 1, c: 2, cs: 0 },
  '김의선':   { kg: 2, c: 5, cs: 0 },
  '박형조':   { kg: 1, c: 3, cs: 0 },
};

// ═══════════════════════════════════════════════════════════════════
// 1/15 키퍼 only = cumulative - 1/8 키퍼
// ═══════════════════════════════════════════════════════════════════
function compute1_15Keeper(name) {
  const cum = J15_KEEPER_CUM[name];
  if (!cum) return { kg: 0, c: 0, cs: 0 };
  const j8 = J8[name] || { kg: 0, c: 0, cs: 0 };  // 1/8 cs는 J8에 있음
  // cs를 J8에서 사용 (J8 cs = 키퍼 cs와 동일)
  const j8cs = j8.cs || 0;
  return {
    kg: cum.kg - (j8.kg || 0),
    c: cum.c - (j8.c || 0),
    cs: cum.cs - j8cs,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 합치기: 1/8 행, 1/15 행 생성
// ═══════════════════════════════════════════════════════════════════
function buildRows() {
  const rows = [];
  const inputTime = new Date().toISOString();

  // 1/8 행
  for (const [name, s] of Object.entries(J8)) {
    rows.push({
      gameDate: D8,
      name,
      goals: s.g,
      assists: s.a,
      owngoals: 0,                  // 역주행 (1/8 = 0)
      conceded: s.c,
      cleanSheets: s.cs,
      crova: 0,
      goguma: 0,
      keeperGames: s.kg,
      rankScore: 0,                 // 팀순위점수 (1/8엔 없음)
      inputTime,
    });
  }

  // 1/15 선수 union (필드 + 키퍼)
  const j15Players = new Set([
    ...Object.keys(J15_FIELD),
    ...Object.keys(J15_KEEPER_CUM),
  ]);

  for (const name of j15Players) {
    const f = J15_FIELD[name] || { g: 0, a: 0, cs: 0, crova: 0, goguma: 0 };
    const k = compute1_15Keeper(name);
    rows.push({
      gameDate: D15,
      name,
      goals: f.g,
      assists: f.a,
      owngoals: 0,                  // 역주행
      conceded: k.c,
      cleanSheets: f.cs,            // 필드 이미지의 cs 사용 (키퍼 cs와 동일해야 함)
      crova: f.crova,
      goguma: -f.goguma,            // 마스터FC 컨벤션: 음수 저장
      keeperGames: k.kg,
      rankScore: 0,                 // 팀순위점수 (이미지에 없음)
      inputTime,
    });
  }

  return rows;
}

// ═══════════════════════════════════════════════════════════════════
// 검증
// ═══════════════════════════════════════════════════════════════════
function verify(rows) {
  const sum = (date, key) => rows.filter(r => r.gameDate === date).reduce((s, r) => s + (r[key] || 0), 0);

  console.log(`\n=== 검증 ===`);
  console.log(`1/8: rows=${rows.filter(r => r.gameDate === D8).length}`);
  console.log(`  goals=${sum(D8, 'goals')} assists=${sum(D8, 'assists')} conceded=${sum(D8, 'conceded')} cleanSheets=${sum(D8, 'cleanSheets')} keeperGames=${sum(D8, 'keeperGames')}`);
  console.log(`1/15: rows=${rows.filter(r => r.gameDate === D15).length}`);
  console.log(`  goals=${sum(D15, 'goals')} assists=${sum(D15, 'assists')} conceded=${sum(D15, 'conceded')} cleanSheets=${sum(D15, 'cleanSheets')} keeperGames=${sum(D15, 'keeperGames')} crova=${sum(D15, 'crova')} goguma=${sum(D15, 'goguma')}`);

  // 골 == 실점 체크
  const goal8 = sum(D8, 'goals'), conc8 = sum(D8, 'conceded');
  const goal15 = sum(D15, 'goals'), conc15 = sum(D15, 'conceded');
  console.log(`\n골 vs 실점 대칭:`);
  console.log(`  1/8: goals=${goal8} conceded=${conc8} ${goal8 === conc8 ? '✓' : '✗'}`);
  console.log(`  1/15: goals=${goal15} conceded=${conc15} ${goal15 === conc15 ? '✓' : '✗'}`);

  // 키퍼게임 합 체크 (행수 * round_per_game 정도)
  const kg8 = sum(D8, 'keeperGames');
  const kg15 = sum(D15, 'keeperGames');
  console.log(`  1/8 keeperGames=${kg8} (총 라운드 수와 일치해야 함)`);
  console.log(`  1/15 keeperGames=${kg15}`);

  // 음수 체크 (1/15 키퍼가 음수면 1/8 데이터 오류)
  const neg = rows.filter(r => r.keeperGames < 0 || r.conceded < 0 || r.cleanSheets < 0);
  if (neg.length > 0) {
    console.log(`\n⚠ 음수 값 발견:`);
    for (const r of neg) console.log(`  ${r.gameDate} ${r.name}: kg=${r.keeperGames} c=${r.conceded} cs=${r.cleanSheets}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// events 합계와 대조 (행 수가 가장 강한 신호)
// ═══════════════════════════════════════════════════════════════════
async function compareWithEvents(rows) {
  const ev = await call({ action: 'getRawEvents', team: '', sport: '' });
  const evRows = (ev.rows || []).filter(r => r.team === TEAM && r.sport === '풋살');

  for (const date of [D8, D15]) {
    const evDate = evRows.filter(r => r.date === date);
    const evG = evDate.filter(e => e.event_type === 'goal').length;
    const evA = evDate.filter(e => e.event_type === 'goal' && e.related_player).length;
    const evC = evDate.filter(e => e.event_type === 'concede').length;
    const evO = evDate.filter(e => e.event_type === 'owngoal').length;

    const plRows = rows.filter(r => r.gameDate === date);
    const plG = plRows.reduce((s, r) => s + r.goals, 0);
    const plA = plRows.reduce((s, r) => s + r.assists, 0);
    const plC = plRows.reduce((s, r) => s + r.conceded, 0);

    console.log(`\n${date} events vs new playerLog:`);
    console.log(`  goals: ev=${evG} pl=${plG} Δ=${plG - evG}`);
    console.log(`  assists: ev=${evA} pl=${plA} Δ=${plA - evA}`);
    console.log(`  conceded: ev=${evC} pl=${plC} Δ=${plC - evC}`);
    console.log(`  owngoals: ev=${evO} (playerLog는 0 가정)`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════
(async () => {
  const rows = buildRows();
  console.log(`총 행: ${rows.length} (1/8: ${rows.filter(r => r.gameDate === D8).length}, 1/15: ${rows.filter(r => r.gameDate === D15).length})`);

  verify(rows);
  await compareWithEvents(rows);

  if (!APPLY) {
    console.log(`\n[DRY RUN] --apply 추가하면 시트27에 쓰기 (sheetName=${SHEET_NAME}).`);
    console.log(`샘플 5개 (1/8):`);
    rows.filter(r => r.gameDate === D8).slice(0, 5).forEach(r => console.log(' ', JSON.stringify(r)));
    console.log(`샘플 5개 (1/15):`);
    rows.filter(r => r.gameDate === D15).slice(0, 5).forEach(r => console.log(' ', JSON.stringify(r)));
    return;
  }

  console.log(`\n시트27 (${SHEET_NAME}) 에 ${rows.length}행 쓰기 시작...`);
  console.log(`주의: 시트27은 사전에 헤더만 남기고 데이터를 비워야 함.`);
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await call({
      action: 'writePlayerLog',
      data: { team: TEAM, players: slice },
      playerLogSheet: SHEET_NAME,
    });
    console.log(`  batch ${i}-${i + slice.length}: ${JSON.stringify(res)}`);
  }
  console.log('완료.');
})();

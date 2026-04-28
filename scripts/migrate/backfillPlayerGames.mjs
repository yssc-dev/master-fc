#!/usr/bin/env node
// 로그_선수경기를 로그_매치 + 로그_이벤트 기반으로 재생성
// 1 row = 1 player × 1 date (게임). games=경기수(라운드).
// 실행: APPS_SCRIPT_URL="..." AUTH_TOKEN="..." node scripts/migrate/backfillPlayerGames.mjs [--team=마스터FC] [--sport=풋살] [--dry-run] [--date-from=YYYY-MM-DD] [--date-to=YYYY-MM-DD]

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
if (!APPS_SCRIPT_URL || !AUTH_TOKEN) {
  console.error('APPS_SCRIPT_URL / AUTH_TOKEN 필요');
  process.exit(1);
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const TEAM = args.team || '마스터FC';
const SPORT = args.sport || '풋살';
const DRY = !!args['dry-run'];
const DATE_FROM = args['date-from'];
const DATE_TO = args['date-to'];

async function call(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, authToken: AUTH_TOKEN }),
  });
  return await res.json();
}

const dateOk = (d) => (!DATE_FROM || d >= DATE_FROM) && (!DATE_TO || d <= DATE_TO);

// 팀별 원본 playerLog 시트 이름 매핑 (필요시 확장)
const PLAYER_LOG_SHEET_BY_TEAM = {
  '마스터FC': '마스터FC 선수별집계기록 로그',
};

(async () => {
  console.log(`[backfillPlayerGames] team=${TEAM} sport=${SPORT} dry=${DRY}`);
  const playerLogSheet = PLAYER_LOG_SHEET_BY_TEAM[TEAM] || '';
  const [mt, ev, pl] = await Promise.all([
    call({ action: 'getRawMatches', team: '', sport: '' }),
    call({ action: 'getRawEvents', team: '', sport: '' }),
    call({ action: 'getPlayerLog', team: TEAM, playerLogSheet }),
  ]);
  const allMatches = (mt.rows || []).filter(r => r.team === TEAM && r.sport === SPORT && dateOk(String(r.date)));
  // 날짜별 신뢰도 판정: our_team_name 있고 away_members 합이 0 초과여야 신뢰 가능
  const dateStat = new Map();
  for (const m of allMatches) {
    if (!dateStat.has(m.date)) dateStat.set(m.date, { teamName: 0, away: 0 });
    const s = dateStat.get(m.date);
    if (m.our_team_name) s.teamName++;
    try { s.away += JSON.parse(m.opponent_members_json || '[]').length; } catch {}
  }
  const reliableDates = new Set();
  for (const [d, s] of dateStat) if (s.teamName > 0 && s.away > 0) reliableDates.add(d);
  const skippedDates = [...dateStat.keys()].filter(d => !reliableDates.has(d)).sort();
  if (skippedDates.length > 0) console.log(`  skip(matchLog 부실): ${skippedDates.join(', ')}`);

  const matches = allMatches.filter(m => reliableDates.has(m.date));
  const events = (ev.rows || []).filter(r => r.team === TEAM && r.sport === SPORT && dateOk(String(r.date)) && reliableDates.has(r.date));
  // 원본 playerLog 100% 보존이 진실 소스. 신뢰 여부 무관하게 전부 사용.
  const playerLogRows = (pl.players || []).filter(r => dateOk(String(r.date)));
  // owngoals 카운트는 events에서 도출 (playerLog에는 카운트 컬럼이 없고 역주행 스코어만 있음)
  const allTeamEvents = (ev.rows || []).filter(r => r.team === TEAM && r.sport === SPORT && dateOk(String(r.date)));
  console.log(`  reliable matches=${matches.length} events=${events.length} playerLog rows=${playerLogRows.length}  all events=${allTeamEvents.length}`);

  // playerLog 행을 (date, player)로 합산. 같은 키 복수 행 가능 → sum.
  // 모든 stat 컬럼은 playerLog 그대로. (자동 룰 X)
  const existingByKey = new Map();
  for (const r of playerLogRows) {
    const k = `${r.date}|${r.name}`;
    if (!existingByKey.has(k)) {
      existingByKey.set(k, {
        session_team: '',
        keeper_games: 0, goals: 0, assists: 0, conceded: 0, cleansheets: 0,
        crova: 0, goguma: 0, '역주행': 0, rank_score: 0,
      });
    }
    const e = existingByKey.get(k);
    e.keeper_games += Number(r.keeperGames) || 0;
    e.goals += Number(r.goals) || 0;
    e.assists += Number(r.assists) || 0;
    e.conceded += Number(r.conceded) || 0;
    e.cleansheets += Number(r.cleanSheets) || 0;
    e.crova += Number(r.crova) || 0;
    e.goguma += Number(r.goguma) || 0;
    e['역주행'] += Number(r.ownGoals) || 0;
    e.rank_score += Number(r.rankScore) || 0;
  }

  // (date, match_id) → roundInfo: { ourGks: Set, oppGks: Set, members: Set, perspectiveByGk: { gk → opponentScore } }
  // 한 라운드는 matchLog에 2 perspective row가 있음. (date, match_id) 단위로 합쳐 처리.
  const roundsByKey = new Map();
  for (const m of matches) {
    const key = `${m.date}|${m.match_id}`;
    if (!roundsByKey.has(key)) roundsByKey.set(key, { date: m.date, match_id: m.match_id, members: new Set(), gkConceded: new Map() });
    const r = roundsByKey.get(key);
    let home = [], away = [];
    try { home = JSON.parse(m.our_members_json || '[]'); } catch {}
    try { away = JSON.parse(m.opponent_members_json || '[]'); } catch {}
    home.forEach(n => n && r.members.add(n));
    away.forEach(n => n && r.members.add(n));
    if (m.our_gk) r.gkConceded.set(m.our_gk, Number(m.opponent_score) || 0);
    if (m.opponent_gk) r.gkConceded.set(m.opponent_gk, Number(m.our_score) || 0);
  }
  // 로그_이벤트의 player/related_player도 해당 라운드 출전으로 인정 (로그_매치 멤버 누락 보정)
  for (const e of events) {
    const key = `${e.date}|${e.match_id}`;
    if (!roundsByKey.has(key)) continue;
    const r = roundsByKey.get(key);
    if (e.player) r.members.add(e.player);
    if (e.related_player) r.members.add(e.related_player);
  }

  // 이벤트 dedup: (date, match_id, event_type, player, related_player) 키
  // 이벤트 카운트는 reliable 여부와 무관하게 전체 사용 (이벤트 자체가 원본 진실).
  const eventSeen = new Set();
  const eventsByDatePlayer = new Map(); // `${date}|${player}` → { goals, assists, owngoals, conceded }
  const ensureEv = (date, player) => {
    const k = `${date}|${player}`;
    if (!eventsByDatePlayer.has(k)) eventsByDatePlayer.set(k, { goals: 0, assists: 0, owngoals: 0, conceded: 0 });
    return eventsByDatePlayer.get(k);
  };
  for (const e of allTeamEvents) {
    const dk = `${e.date}|${e.match_id}|${e.event_type}|${e.player || ''}|${e.related_player || ''}`;
    if (eventSeen.has(dk)) continue;
    eventSeen.add(dk);
    if (e.event_type === 'goal' && e.player) ensureEv(e.date, e.player).goals++;
    if (e.event_type === 'goal' && e.related_player) ensureEv(e.date, e.related_player).assists++;
    if (e.event_type === 'owngoal' && e.player) ensureEv(e.date, e.player).owngoals++;
    if (e.event_type === 'concede' && e.player) ensureEv(e.date, e.player).conceded++;
  }

  // (date, player) 집계
  const agg = new Map();
  const ensureAgg = (date, player) => {
    const k = `${date}|${player}`;
    if (!agg.has(k)) agg.set(k, { date, player, rounds: 0, keeperRounds: 0, cleansheets: 0 });
    return agg.get(k);
  };
  for (const r of roundsByKey.values()) {
    for (const name of r.members) {
      const a = ensureAgg(r.date, name);
      a.rounds++;
      if (r.gkConceded.has(name)) {
        a.keeperRounds++;
        if (r.gkConceded.get(name) === 0) a.cleansheets++;
      }
    }
  }

  // 정책: 원본 playerLog 100% 일치 보존. 백필이 채우는 건 games/field_games 와 owngoals 카운트.
  // 역주행(스코어) 등 모든 stat 컬럼은 playerLog 그대로. (자동 룰 X — 원본에 이미 수동 적용됨)
  // owngoals 카운트는 playerLog에 컬럼이 없으므로 events에서 도출.
  // events에만 있고 playerLog에 없는 (date,player) 행은 생성하지 않음 (playerLog가 진실).
  const inputTime = new Date().toISOString();
  const rows = [];
  for (const [k, e] of existingByKey) {
    const [date, player] = k.split('|');
    const a = agg.get(k);
    const rounds = a ? a.rounds : 0;
    const keeper = e.keeper_games;
    const evStat = eventsByDatePlayer.get(k) || { owngoals: 0 };
    rows.push({
      team: TEAM, sport: SPORT, mode: '기본', tournament_id: '',
      date,
      player,
      session_team: e.session_team,
      games: rounds,
      field_games: Math.max(0, rounds - keeper),
      keeper_games: keeper,
      goals: e.goals,
      assists: e.assists,
      owngoals: evStat.owngoals,
      conceded: e.conceded,
      cleansheets: e.cleansheets,
      crova: e.crova,
      goguma: e.goguma,
      '역주행': e['역주행'],
      rank_score: e.rank_score,
      input_time: inputTime,
    });
  }
  rows.sort((x, y) => x.date.localeCompare(y.date) || x.player.localeCompare(y.player, 'ko'));
  const datesTouched = [...new Set(rows.map(r => r.date))].sort();
  console.log(`  생성 rows=${rows.length} 날짜=${datesTouched.length}: ${datesTouched.join(', ')}`);

  if (DRY) {
    console.log('[DRY] 샘플 5개:', rows.slice(0, 5));
    return;
  }

  for (const d of datesTouched) {
    const del = await call({ action: 'deleteRawPlayerGamesByDate', team: TEAM, sport: SPORT, date: d });
    console.log(`  delete ${d}: ${JSON.stringify(del)}`);
  }
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await call({ action: 'writeRawPlayerGames', data: { rows: slice, skipDedupe: true } });
    console.log(`  batch ${i}-${i + slice.length}: ${JSON.stringify(res)}`);
  }
  console.log('완료.');
})();

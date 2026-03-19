import { SHEET_CONFIG } from '../config/constants';

function parseCSVLine(line) {
  const fields = [];
  let inQuote = false, field = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; }
    else { field += ch; }
  }
  fields.push(field.trim());
  return fields;
}

function parseNum(v) { return parseInt(v) || 0; }
function parseFloat2(v) { return parseFloat(v) || 0; }
function parseDelta(v) { if (!v || v === '-' || v === '') return 0; return parseInt(v) || 0; }

function parseCSV(text) {
  const lines = text.split('\n');
  const players = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCSVLine(line);
    const name = f[3];
    if (!name) continue;
    players.push({
      ppg: parseFloat2(f[0]),           // A: 경기당 포인트
      rank: parseNum(f[1]),             // B: 순위
      backNum: f[2] ? parseNum(f[2]) || null : null, // C: 등번호
      name,                             // D: 이름
      games: parseNum(f[4]),            // E: 경기수
      goals: parseNum(f[5]),            // F: 골
      goalsDelta: parseDelta(f[6]),     // G: 골 변동
      assists: parseNum(f[7]),          // H: 어시스트
      assistsDelta: parseDelta(f[8]),   // I: 어시 변동
      ownGoals: parseNum(f[9]),         // J: 자책골
      ownGoalsDelta: parseDelta(f[10]), // K: 자책골 변동
      crova: parseNum(f[11]),           // L: 크로바
      goguma: parseNum(f[12]),          // M: 고구마
      point: parseNum(f[13]),           // N: 포인트 합계
      cleanSheets: parseNum(f[14]),     // O: 클린시트
      cleanSheetsDelta: parseDelta(f[15]), // P: 클린시트 변동
      keeperGames: parseNum(f[16]),     // Q: 키퍼 경기수
      conceded: parseNum(f[17]),        // R: 실점
      concededDelta: parseDelta(f[18]), // S: 실점 변동
      concededRate: parseFloat2(f[19]), // T: 실점률
    });
  }
  return players;
}

export async function fetchSheetData() {
  const resp = await fetch(SHEET_CONFIG.csvUrl(SHEET_CONFIG.dashboardGid));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const players = parseCSV(text);
  if (players.length === 0) throw new Error("선수 데이터 없음");
  // 키퍼 섹션 파싱 (col 21~24, row 4+, row3=헤더 "선수명")
  const lines = text.split('\n');
  const keepers = [];
  for (let i = 4; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    const name = (f[21] || '').trim();
    if (!name || name === '선수명') continue;
    keepers.push({
      name,
      avgConceded: parseFloat2(f[22]),  // 평균 실점/경기
      totalConceded: parseNum(f[23]),   // 누적 실점
      keeperGames: parseNum(f[24]),     // 키퍼 경기수
    });
  }

  return { lastUpdated: new Date().toISOString().slice(0, 10), players, keepers, seasonCrova: {}, seasonGoguma: {} };
}

export async function fetchAttendanceData() {
  const resp = await fetch(SHEET_CONFIG.csvUrl(SHEET_CONFIG.attendanceGid));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const lines = text.split('\n');

  // CSV 구조 (참석명단 시트):
  // F열(col 5): 시드 라벨 ("1번 시드", "2번 시드"...)
  // G~L열(col 6~11): 팀별 선수 데이터 (최대 6팀)
  // 1번 시드 행: 각 팀의 첫 번째 선수 (팀장) → 이름에서 팀명 생성
  //   예) "조승훈" → "팀승훈" (성 제거, "팀" + 이름)
  // 2~8번 시드 행: 나머지 팀원
  const prebuiltTeams = [];
  const prebuiltTeamNames = [];
  const allAttendees = [];

  // Step 1: "1번 시드" 라벨이 있는 행 찾기 (F열 = col 5)
  let seedStartRow = -1;
  for (let row = 0; row < Math.min(lines.length, 10); row++) {
    const f = parseCSVLine(lines[row]);
    const label = (f[5] || '').trim().replace(/\s/g, '');
    if (label === '1번시드' || label === '1번씨드' || label === '시드1' || label === '1시드') {
      seedStartRow = row;
      break;
    }
  }

  // "1번 시드" 라벨 못 찾으면 → G~K열에 이름이 있는 첫 번째 행을 시작으로
  if (seedStartRow < 0) {
    for (let row = 0; row < Math.min(lines.length, 5); row++) {
      const f = parseCSVLine(lines[row]);
      let nameCount = 0;
      for (let col = 6; col <= 11; col++) {
        const cell = (f[col] || '').trim();
        // 한글 2~4글자 = 사람 이름일 가능성
        if (cell && /^[가-힣]{2,4}$/.test(cell)) nameCount++;
      }
      if (nameCount >= 3) { seedStartRow = row; break; }
    }
  }

  if (seedStartRow < 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  // Step 2: 팀 컬럼 감지 (col 6~11에서 1번 시드 이름이 있는 열)
  const seedRow = parseCSVLine(lines[seedStartRow]);
  const teamCols = [];
  for (let col = 6; col <= 11; col++) {
    const name = (seedRow[col] || '').trim();
    if (name && name.length >= 2) {
      teamCols.push({ col, captain: name });
    }
  }

  if (teamCols.length === 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  // Step 3: 각 팀 선수 구성 + 팀명 생성
  for (const tc of teamCols) {
    const members = [];

    // 1번 시드부터 마지막 시드까지 (seedStartRow ~ seedStartRow+7)
    for (let row = seedStartRow; row <= seedStartRow + 7; row++) {
      if (row >= lines.length) break;
      const f = parseCSVLine(lines[row]);
      const name = (f[tc.col] || '').trim();
      if (name && !members.includes(name)) {
        members.push(name);
        if (!allAttendees.includes(name)) allAttendees.push(name);
      }
    }

    if (members.length > 0) {
      prebuiltTeams.push(members);
      // 팀명: "팀 " + 이름 뒤 2글자 → "조승훈" → "팀 승훈", "제갈종주" → "팀 종주"
      const givenName = tc.captain.length >= 3 ? tc.captain.slice(-2) : tc.captain;
      prebuiltTeamNames.push('팀 ' + givenName);
    }
  }

  return {
    attendees: allAttendees,
    teamCount: prebuiltTeams.length,
    prebuiltTeams,
    prebuiltTeamNames,
  };
}

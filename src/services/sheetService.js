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
  // col 6 = 시드 라벨 ("1번 시드", "2번 시드"...)
  // col 7~11 = 팀 데이터 (G~K열 → 1팀~5팀, 최대 6팀)
  // Row 0~1: "팀승훈 조승훈" (팀명+1번시드 합쳐짐, 헤더 병합)
  // Row 2+: 2번 시드부터 선수명
  const prebuiltTeams = [];
  const prebuiltTeamNames = [];
  const allAttendees = [];

  // Row 0 또는 1에서 팀 헤더 찾기 (팀명+캡틴)
  // "팀승훈 조승훈" 형태의 셀이 있는 행을 찾음
  let headerRow = -1;
  for (let row = 0; row <= 1; row++) {
    if (row >= lines.length) break;
    const f = parseCSVLine(lines[row]);
    const cell = (f[7] || '').trim();
    if (cell && cell.startsWith('팀')) { headerRow = row; break; }
  }
  if (headerRow < 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  const headerFields = parseCSVLine(lines[headerRow]);
  const teamInfos = [];
  for (let col = 7; col <= 12; col++) {
    const cell = (headerFields[col] || '').trim();
    if (!cell) continue;
    const parts = cell.split(/\s+/);
    const teamName = parts[0] || cell;
    const captain = parts[1] || null;
    teamInfos.push({ teamName, captain, col });
  }

  // 각 팀의 선수 구성
  for (let ti = 0; ti < teamInfos.length; ti++) {
    const info = teamInfos[ti];
    const members = [];

    // 1번 시드(팀장)
    if (info.captain) {
      members.push(info.captain);
      if (!allAttendees.includes(info.captain)) allAttendees.push(info.captain);
    }

    // 2번 시드부터: headerRow+1 이후, 같은 col
    for (let row = headerRow + 1; row <= headerRow + 8; row++) {
      if (row >= lines.length) break;
      const f = parseCSVLine(lines[row]);
      const name = (f[info.col] || '').trim();
      if (name && !members.includes(name)) {
        members.push(name);
        if (!allAttendees.includes(name)) allAttendees.push(name);
      }
    }

    if (members.length > 0) {
      prebuiltTeams.push(members);
      prebuiltTeamNames.push(info.teamName);
    }
  }

  return {
    attendees: allAttendees,
    teamCount: prebuiltTeams.length,
    prebuiltTeams,
    prebuiltTeamNames,
  };
}

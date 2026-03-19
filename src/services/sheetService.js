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
  const attendees = [];
  let teamCount = null;

  // E열(index 4): 참석자 명단
  for (let i = 0; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    let name = f[4] || '';
    if (name.startsWith('참석 명단 ') || name.startsWith('참석명단 ')) {
      name = name.replace(/^참석\s*명단\s+/, '');
    }
    if (name && name !== '참석 명단' && name !== '참석명단') {
      attendees.push(name.trim());
    }
    if (f[5] && f[5].includes('N개 팀')) {
      teamCount = parseInt(f[6]) || null;
    }
  }

  // G~L열(index 6~11): 시트에서 이미 편성된 팀 명단
  // F열(index 5)은 시드 라벨
  // Row 0 = 팀명 헤더 (CSV에서 1번 시드와 합쳐짐: "팀승훈" 형태)
  // Row 1+ = 2번 시드부터 선수
  // 1번 시드(팀장)는 CSV에서 누락되므로 팀명에서 추론하여 참석자 목록과 매칭
  const teamNameRow = lines.length > 0 ? parseCSVLine(lines[0]) : [];
  const prebuiltTeams = [];
  const prebuiltTeamNames = [];

  for (let col = 6; col <= 11; col++) {
    const rawTeamName = (teamNameRow[col] || '').trim();
    if (!rawTeamName) continue;
    prebuiltTeamNames.push(rawTeamName);

    const members = [];

    // 1번 시드(팀장) 복원: 팀명에서 "팀" 제거한 접미사로 참석자 매칭
    // 예: "팀승훈" → "승훈" → 참석자 중 "승훈"으로 끝나는 사람 = "조승훈"
    const suffix = rawTeamName.replace(/^팀\s*/, '');
    if (suffix) {
      const captain = attendees.find(a => a.endsWith(suffix));
      if (captain) members.push(captain);
    }

    // 2번 시드부터 (Row 1+)
    for (let row = 1; row <= 8; row++) {
      if (row >= lines.length) break;
      const f = parseCSVLine(lines[row]);
      const name = (f[col] || '').trim();
      if (name && !members.includes(name)) members.push(name);
    }

    if (members.length > 0) prebuiltTeams.push(members);
  }

  const sheetTeamCount = prebuiltTeams.length > 0 ? prebuiltTeams.length : teamCount;

  return { attendees, teamCount: sheetTeamCount, prebuiltTeams, prebuiltTeamNames };
}

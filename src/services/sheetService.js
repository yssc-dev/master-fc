import { SHEET_CONFIG } from '../config/constants';
import { getSettings } from '../config/settings';
import AuthUtil from './authUtil';

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
  const team = AuthUtil.getStored()?.team;
  const s = getSettings(team);
  const resp = await fetch(SHEET_CONFIG.csvUrlBySheet(s.sheetId, s.dashboardSheet));
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
  const team2 = AuthUtil.getStored()?.team;
  const s2 = getSettings(team2);
  const resp = await fetch(SHEET_CONFIG.csvUrlBySheet(s2.sheetId, s2.attendanceSheet));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const lines = text.split('\n');

  // CSV 구조 (참석명단 시트):
  // 1행: 팀명 헤더 — G~K열에 "팀승훈", "팀재상" 등 (col 6~11)
  // F열(col 5): 시드 라벨 — "1번 시드", "2번 시드"...
  // 2행~: 선수 — G~K열에 1번시드~8번시드 순서
  const prebuiltTeams = [];
  const prebuiltTeamNames = [];
  const allAttendees = [];

  // Step 1: 팀명 헤더 행 찾기 — G~L열(col 6~11)에서 "팀"으로 시작하는 셀이 있는 행
  let headerRow = -1;
  for (let row = 0; row < Math.min(lines.length, 5); row++) {
    const f = parseCSVLine(lines[row]);
    for (let col = 6; col <= 11; col++) {
      const cell = (f[col] || '').trim();
      if (cell && cell.startsWith('팀')) { headerRow = row; break; }
    }
    if (headerRow >= 0) break;
  }

  // Step 2: "1번 시드" 라벨 행 찾기 (F열 = col 5)
  let seedStartRow = -1;
  for (let row = 0; row < Math.min(lines.length, 10); row++) {
    const f = parseCSVLine(lines[row]);
    const label = (f[5] || '').trim().replace(/\s/g, '');
    if (label.includes('1번') && label.includes('시드')) {
      seedStartRow = row;
      break;
    }
  }

  // "1번 시드" 못 찾으면 → 팀명 헤더 바로 다음 행
  if (seedStartRow < 0 && headerRow >= 0) {
    seedStartRow = headerRow + 1;
  }

  // 둘 다 못 찾으면 → fallback: G~K열에 한글 이름 3개 이상 있는 첫 행
  if (seedStartRow < 0) {
    for (let row = 0; row < Math.min(lines.length, 5); row++) {
      const f = parseCSVLine(lines[row]);
      let nameCount = 0;
      for (let col = 6; col <= 11; col++) {
        const cell = (f[col] || '').trim();
        if (cell && /^[가-힣]{2,4}$/.test(cell)) nameCount++;
      }
      if (nameCount >= 3) { seedStartRow = row; break; }
    }
  }

  if (seedStartRow < 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  // Step 3: 팀 컬럼 + 팀명 파싱
  // ★ gviz CSV 특성: 시트 1행(팀명)과 2행(1번시드)이 "팀승훈 조승훈" 형태로 합쳐질 수 있음
  const teamCols = [];
  const firstDataFields = parseCSVLine(lines[seedStartRow]);

  for (let col = 6; col <= 11; col++) {
    const raw = (firstDataFields[col] || '').trim();
    if (!raw || raw.length < 2) continue;

    let teamName = '';
    let captain = '';

    if (raw.startsWith('팀')) {
      // "팀승훈 조승훈" → 팀명과 캡틴이 합쳐진 경우
      const parts = raw.split(/\s+/);
      teamName = parts[0];  // "팀승훈"
      captain = parts[1] || '';  // "조승훈"
    } else {
      // 팀명 없이 선수명만 있는 경우 → 이름에서 팀명 생성
      captain = raw;
      const gn = raw.length >= 3 ? raw.slice(-2) : raw;
      teamName = '팀' + gn;
    }

    teamCols.push({ col, teamName, captain });
  }

  if (teamCols.length === 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  // Step 4: 각 팀 선수 구성
  for (const tc of teamCols) {
    const members = [];

    // 1번 시드(캡틴)가 있으면 먼저 추가
    if (tc.captain) {
      members.push(tc.captain);
      if (!allAttendees.includes(tc.captain)) allAttendees.push(tc.captain);
    }

    // seedStartRow+1부터 나머지 시드 읽기 (2번 시드~)
    for (let row = seedStartRow + 1; row <= seedStartRow + 7; row++) {
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
      prebuiltTeamNames.push(tc.teamName);
    }
  }

  return {
    attendees: allAttendees,
    teamCount: prebuiltTeams.length,
    prebuiltTeams,
    prebuiltTeamNames,
  };
}

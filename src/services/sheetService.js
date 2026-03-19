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

function parseCSV(text) {
  const lines = text.split('\n');
  const players = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = parseCSVLine(line);
    const name = fields[3];
    if (!name) continue;
    const rank = parseInt(fields[1]) || 0;
    const backNum = fields[2] ? parseInt(fields[2]) || null : null;
    const games = parseInt(fields[4]) || 0;
    const point = parseInt(fields[13]) || 0;
    const ppg = parseFloat(fields[0]) || 0;
    players.push({ rank, name, backNum, games, point, ppg });
  }
  return players;
}

export async function fetchSheetData() {
  const resp = await fetch(SHEET_CONFIG.csvUrl(SHEET_CONFIG.dashboardGid));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const players = parseCSV(text);
  if (players.length === 0) throw new Error("선수 데이터 없음");
  return { lastUpdated: new Date().toISOString().slice(0, 10), players, seasonCrova: {}, seasonGoguma: {} };
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

  // G2:L9 (index 6~11, 행 1~8): 시트에서 이미 편성된 팀 명단
  // G=1팀, H=2팀, I=3팀, J=4팀, K=5팀, L=6팀
  const prebuiltTeams = [];
  for (let col = 6; col <= 11; col++) {
    const members = [];
    // 행1~8 (CSV 0-indexed, 시트 row 2~9)
    for (let row = 1; row <= 8; row++) {
      if (row >= lines.length) break;
      const f = parseCSVLine(lines[row]);
      const name = (f[col] || '').trim();
      if (name) members.push(name);
    }
    if (members.length > 0) prebuiltTeams.push(members);
  }

  // 팀 수: prebuiltTeams 기준 (없으면 F열 값 사용)
  const sheetTeamCount = prebuiltTeams.length > 0 ? prebuiltTeams.length : teamCount;

  return { attendees, teamCount: sheetTeamCount, prebuiltTeams };
}

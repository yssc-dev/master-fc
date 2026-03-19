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
  return { attendees, teamCount };
}

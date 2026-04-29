// C4: GK + 같은 라운드 우리팀 필드 멤버 페어 무실점률.
// 한계: 라운드별 5인 필드 출전이 없어 "그날 같은 팀 로스터"로 근사.

function parseMembers(s) {
  try {
    const parsed = JSON.parse(s || '[]');
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}

export function calcGkChemistry({ matchLogs, threshold = 5 }) {
  const tally = {};
  for (const m of matchLogs || []) {
    const gk = m.our_gk;
    if (!gk) continue;
    const members = parseMembers(m.our_members_json);
    if (members.length === 0) continue;
    const opp = Number(m.opponent_score) || 0;
    const isClean = opp === 0;
    if (!tally[gk]) tally[gk] = {};
    for (const field of members) {
      if (field === gk) continue;
      if (!tally[gk][field]) tally[gk][field] = { rounds: 0, cleanSheets: 0 };
      tally[gk][field].rounds += 1;
      if (isClean) tally[gk][field].cleanSheets += 1;
    }
  }

  const byGk = {};
  for (const gk of Object.keys(tally)) {
    const allPairs = Object.entries(tally[gk])
      .map(([field, { rounds, cleanSheets }]) => ({
        field, rounds, cleanSheets,
        cleanRate: rounds > 0 ? cleanSheets / rounds : 0,
      }))
      .filter(p => p.rounds >= threshold);

    const pairs = [...allPairs].sort((a, b) =>
      b.cleanRate - a.cleanRate ||
      b.rounds - a.rounds ||
      a.field.localeCompare(b.field, 'ko')
    );
    const worst = [...allPairs].sort((a, b) =>
      a.cleanRate - b.cleanRate ||
      b.rounds - a.rounds ||
      a.field.localeCompare(b.field, 'ko')
    );
    byGk[gk] = { pairs, worst };
  }

  return {
    gks: Object.keys(byGk).sort((a, b) => a.localeCompare(b, 'ko')),
    byGk,
  };
}

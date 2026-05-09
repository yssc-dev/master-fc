// C4: GK + 같은 라운드 같은 팀 필드 멤버 페어 무실점률.
// 풋살 라운드 로테이션: our/opponent 모두 같은 클럽 선수라 양쪽 다 집계.
//   - our_gk + our_members_json (실점 = opponent_score == 0)
//   - opponent_gk + opponent_members_json (실점 = our_score == 0)

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
  function bump(gk, members, isClean) {
    if (!gk) return;
    if (!members || members.length === 0) return;
    if (!tally[gk]) tally[gk] = {};
    for (const field of members) {
      if (field === gk) continue;
      if (!tally[gk][field]) tally[gk][field] = { rounds: 0, cleanSheets: 0 };
      tally[gk][field].rounds += 1;
      if (isClean) tally[gk][field].cleanSheets += 1;
    }
  }
  for (const m of matchLogs || []) {
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    bump(m.our_gk, parseMembers(m.our_members_json), opp === 0);
    bump(m.opponent_gk, parseMembers(m.opponent_members_json), our === 0);
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

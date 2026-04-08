// src/utils/tournamentBrackets.js

export function generateFullLeague(teams) {
  const matches = [];
  let matchNum = 1;
  const n = teams.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({ matchNum: matchNum++, round: "", home: teams[i], away: teams[j] });
    }
  }
  const perRound = Math.floor(n / 2);
  matches.forEach((m, i) => { m.round = `${Math.floor(i / perRound) + 1}R`; });
  return matches;
}

export function generateKnockout(teams) {
  const matches = [];
  let matchNum = 1;
  const roundNames = (total) => {
    if (total <= 2) return ["결승"];
    if (total <= 4) return ["준결승", "결승"];
    if (total <= 8) return ["8강", "준결승", "결승"];
    if (total <= 16) return ["16강", "8강", "준결승", "결승"];
    return Array.from({ length: Math.ceil(Math.log2(total)) }, (_, i) => `${i + 1}R`);
  };
  const n = teams.length;
  const rounds = roundNames(n);
  const firstRoundPairs = Math.ceil(n / 2);
  for (let i = 0; i < firstRoundPairs; i++) {
    const home = teams[i * 2];
    const away = teams[i * 2 + 1] || "부전승";
    matches.push({ matchNum: matchNum++, round: rounds[0], home, away });
  }
  let prevCount = firstRoundPairs;
  for (let r = 1; r < rounds.length; r++) {
    const count = Math.ceil(prevCount / 2);
    for (let i = 0; i < count; i++) {
      matches.push({ matchNum: matchNum++, round: rounds[r], home: "", away: "" });
    }
    prevCount = count;
  }
  return matches;
}

export function generateManual(matchCount) {
  return Array.from({ length: matchCount }, (_, i) => ({
    matchNum: i + 1, round: "", home: "", away: "",
  }));
}

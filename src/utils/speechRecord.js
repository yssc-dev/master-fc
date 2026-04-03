// src/utils/speechRecord.js

/**
 * Web Speech API 지원 여부 확인
 */
export function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 음성 인식 세션을 시작한다. Promise로 결과 텍스트를 반환.
 * @returns {{ recognition, promise }}
 */
export function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SR();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const promise = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      resolve(text);
    };
    recognition.onerror = (event) => {
      reject(new Error(event.error));
    };
    recognition.onnomatch = () => {
      reject(new Error("nomatch"));
    };
    recognition.onend = () => {
      resolve(null);
    };
  });

  recognition.start();
  return { recognition, promise };
}

/**
 * 음성 텍스트를 파싱하여 골/어시/자책 정보를 추출한다.
 *
 * @param {string} text - 음성 인식 결과 텍스트
 * @param {string[]} allPlayerNames - 전체 참가 선수 이름 목록
 * @returns {{ type: "goal"|"owngoal"|null, scorer: string|null, assist: string|null, raw: string }}
 */
export function parseVoiceText(text, allPlayerNames) {
  if (!text) return { type: null, scorer: null, assist: null, raw: text };

  const normalized = text.trim().replace(/\s+/g, " ");
  const raw = normalized;

  const ownGoalIdx = findKeywordIndex(normalized, ["자책골", "자책"]);
  const goalIdx = findKeywordIndex(normalized, ["골", "goal"]);
  const assistIdx = findKeywordIndex(normalized, ["어시스트", "어시", "어싯"]);

  if (ownGoalIdx !== -1) {
    const scorer = findPlayerNear(normalized, ownGoalIdx, allPlayerNames);
    return { type: "owngoal", scorer, assist: null, raw };
  }

  let scorer = null;
  let assist = null;

  if (goalIdx !== -1) {
    scorer = findPlayerNear(normalized, goalIdx, allPlayerNames);
  }
  if (assistIdx !== -1) {
    assist = findPlayerNear(normalized, assistIdx, allPlayerNames);
  }

  if (!scorer && assist && goalIdx === -1) {
    const otherNames = findAllPlayers(normalized, allPlayerNames).filter(n => n !== assist);
    if (otherNames.length === 1) scorer = otherNames[0];
  }

  if (scorer && !assist && assistIdx === -1) {
    return { type: "goal", scorer, assist: null, raw };
  }

  if (scorer || assist) {
    return { type: "goal", scorer, assist, raw };
  }

  return { type: null, scorer: null, assist: null, raw };
}

/**
 * 선수명 fuzzy matching.
 * @param {string} query - 검색할 이름
 * @param {string[]} allPlayerNames - 전체 선수 목록
 * @returns {string[]} 매칭된 후보 배열
 */
export function fuzzyMatchPlayer(query, allPlayerNames) {
  if (!query) return [];
  const q = query.trim();

  const exact = allPlayerNames.filter(n => n === q);
  if (exact.length > 0) return exact;

  const contains = allPlayerNames.filter(n => n.includes(q));
  if (contains.length > 0) return contains;

  const partial = allPlayerNames.filter(n => q.includes(n));
  if (partial.length > 0) return partial;

  return [];
}

// ── 내부 헬퍼 ──

function findKeywordIndex(text, keywords) {
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) return idx;
  }
  return -1;
}

function findPlayerNear(text, keywordIdx, allPlayerNames) {
  const words = text.split(" ");
  let charCount = 0;
  let keywordWordIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (charCount >= keywordIdx) { keywordWordIdx = i; break; }
    charCount += words[i].length + 1;
  }

  const candidates = [];
  if (keywordWordIdx > 0) candidates.push(words[keywordWordIdx - 1]);
  if (keywordWordIdx < words.length - 1) candidates.push(words[keywordWordIdx + 1]);

  for (const word of candidates) {
    const matches = fuzzyMatchPlayer(word, allPlayerNames);
    if (matches.length === 1) return matches[0];
  }

  if (keywordWordIdx >= 2) {
    const twoWord = words[keywordWordIdx - 2] + words[keywordWordIdx - 1];
    const m = fuzzyMatchPlayer(twoWord, allPlayerNames);
    if (m.length === 1) return m[0];
  }
  if (keywordWordIdx < words.length - 2) {
    const twoWord = words[keywordWordIdx + 1] + words[keywordWordIdx + 2];
    const m = fuzzyMatchPlayer(twoWord, allPlayerNames);
    if (m.length === 1) return m[0];
  }

  return null;
}

function findAllPlayers(text, allPlayerNames) {
  const found = [];
  for (const name of allPlayerNames) {
    if (text.includes(name)) found.push(name);
  }
  return found;
}

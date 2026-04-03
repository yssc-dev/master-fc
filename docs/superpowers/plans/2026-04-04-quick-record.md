# 빠른 기록 UI (Quick Record) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 CourtRecorder를 음성 인식 + 간소화된 터치 입력으로 대체하여 골/어시/자책골 기록 속도를 개선한다.

**Architecture:** CourtRecorder.jsx를 리팩토링하여 새 UI(GK 토글 버튼, ⚽ 인라인 어시 선택, 음성 입력)를 적용. 음성 인식은 `src/utils/speechRecord.js`에 Web Speech API 래퍼 + 텍스트 파싱 로직을 분리. EventLog.jsx는 변경 없이 재사용. 호출부(ScheduleMatchView, FreeMatchView, PushMatchView)는 변경 없음 — CourtRecorder의 인터페이스(props)가 동일하게 유지됨.

**Tech Stack:** React 19, Web Speech API (SpeechRecognition / webkitSpeechRecognition)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/speechRecord.js` | Create | Web Speech API 래퍼 + 음성 텍스트 파싱 + 선수명 fuzzy matching |
| `src/components/game/CourtRecorder.jsx` | Modify | 기존 GK 드롭다운 → GK 토글 버튼, 기존 ⚽/자책 버튼 → ⚽ 탭 후 인라인 어시 선택, 음성 입력 버튼 추가 |

---

### Task 1: 음성 인식 유틸리티 — `src/utils/speechRecord.js`

**Files:**
- Create: `src/utils/speechRecord.js`

- [ ] **Step 1: speechRecord.js 작성**

```js
// src/utils/speechRecord.js

/**
 * Web Speech API 지원 여부 확인
 */
export function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 음성 인식 세션을 시작한다. Promise로 결과 텍스트를 반환.
 * 버튼을 떼면 stop()을 호출해서 종료.
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
      // 결과 없이 종료된 경우
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
 * @returns {{ type: "goal"|"owngoal", scorer: string|null, assist: string|null, raw: string }}
 */
export function parseVoiceText(text, allPlayerNames) {
  if (!text) return { type: null, scorer: null, assist: null, raw: text };

  const normalized = text.trim().replace(/\s+/g, " ");
  const raw = normalized;

  // 키워드 위치 찾기
  const ownGoalIdx = findKeywordIndex(normalized, ["자책골", "자책"]);
  const goalIdx = findKeywordIndex(normalized, ["골", "goal"]);
  const assistIdx = findKeywordIndex(normalized, ["어시스트", "어시", "어싯"]);

  // 자책골인 경우
  if (ownGoalIdx !== -1) {
    const scorer = findPlayerNear(normalized, ownGoalIdx, allPlayerNames);
    return { type: "owngoal", scorer, assist: null, raw };
  }

  // 일반 골
  let scorer = null;
  let assist = null;

  if (goalIdx !== -1) {
    scorer = findPlayerNear(normalized, goalIdx, allPlayerNames);
  }
  if (assistIdx !== -1) {
    assist = findPlayerNear(normalized, assistIdx, allPlayerNames);
  }

  // 골 키워드 없이 이름만 2개 + 어시 키워드만 있는 경우
  // "채수찬 어시 조재상" → 골 키워드 없으면 어시 아닌 쪽이 골
  if (!scorer && assist && goalIdx === -1) {
    const otherNames = findAllPlayers(normalized, allPlayerNames).filter(n => n !== assist);
    if (otherNames.length === 1) scorer = otherNames[0];
  }

  // 어시 키워드 없이 골만 있으면 단독골
  if (scorer && !assist && assistIdx === -1) {
    return { type: "goal", scorer, assist: null, raw };
  }

  if (scorer || assist) {
    return { type: "goal", scorer, assist, raw };
  }

  return { type: null, scorer: null, assist: null, raw };
}

/**
 * 선수명 fuzzy matching. 정확한 매칭 우선, 부분 매칭 후보 반환.
 *
 * @param {string} query - 검색할 이름
 * @param {string[]} allPlayerNames - 전체 선수 목록
 * @returns {string[]} 매칭된 후보 배열 (정확 매칭이면 1개, 모호하면 여러개)
 */
export function fuzzyMatchPlayer(query, allPlayerNames) {
  if (!query) return [];
  const q = query.trim();

  // 1. 정확 매칭
  const exact = allPlayerNames.filter(n => n === q);
  if (exact.length > 0) return exact;

  // 2. 포함 매칭 (이름에 query가 포함)
  const contains = allPlayerNames.filter(n => n.includes(q));
  if (contains.length > 0) return contains;

  // 3. query가 이름에 포함 (부분 이름으로 검색)
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
  // 키워드 앞뒤의 단어에서 선수명 매칭
  const words = text.split(" ");
  let charCount = 0;
  let keywordWordIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (charCount >= keywordIdx) { keywordWordIdx = i; break; }
    charCount += words[i].length + 1;
  }

  // 키워드 앞 단어, 뒤 단어 순서로 확인
  const candidates = [];
  if (keywordWordIdx > 0) candidates.push(words[keywordWordIdx - 1]);
  if (keywordWordIdx < words.length - 1) candidates.push(words[keywordWordIdx + 1]);

  for (const word of candidates) {
    const matches = fuzzyMatchPlayer(word, allPlayerNames);
    if (matches.length === 1) return matches[0];
  }

  // 앞뒤 2단어까지 합쳐서 시도 (성+이름이 분리된 경우)
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
```

- [ ] **Step 2: 커밋**

```bash
git add src/utils/speechRecord.js
git commit -m "feat: 음성 인식 유틸리티 (Web Speech API + 텍스트 파싱)"
```

---

### Task 2: CourtRecorder UI 리팩토링

**Files:**
- Modify: `src/components/game/CourtRecorder.jsx`

이 태스크에서 CourtRecorder.jsx를 수정하여:
1. GK 드롭다운 → GK 토글 버튼으로 변경
2. ⚽ 버튼 탭 후 인라인 어시 선택지 전개
3. 음성 입력 🎤 버튼 추가

- [ ] **Step 1: CourtRecorder.jsx 전면 리팩토링**

기존 CourtRecorder.jsx를 완전히 재작성한다. EventLog, 용병(MercPicker), 이벤트 기록 로직은 유지하되, UI 구조를 변경:

```jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { isSpeechSupported, startListening, parseVoiceText, fuzzyMatchPlayer } from '../../utils/speechRecord';
import EventLog from './EventLog';

function MercPicker({ side, candidates, opposingPlayers, teamName, onAdd, onClose, C, s }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.orange }}>{teamName}에 선수 추가</div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: C.gray }}>추가 가능한 선수가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {candidates.map(p => {
            const isOpposing = opposingPlayers.includes(p);
            return (
              <button key={p} onClick={() => onAdd(p, side)}
                style={{ ...s.btnSm(C.grayDarker, isOpposing ? C.orange : C.white), padding: "6px 10px", border: isOpposing ? `1px dashed ${C.orange}` : "none" }}>
                {isOpposing && <span style={{ fontSize: 8, marginRight: 3 }}>상대</span>}{p}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={onClose} style={{ ...s.btnSm(C.grayDark), marginTop: 8 }}>닫기</button>
    </div>
  );
}

export default function CourtRecorder({ matchInfo, homePlayers: initHomePlayers, awayPlayers: initAwayPlayers, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinish, onMatchInfoUpdate, onGkChange, styles: s, courtLabel, attendees, readOnly }) {
  const { C } = useTheme();
  const [pendingGoalPlayer, setPendingGoalPlayer] = useState(null); // { player, isHome }
  const [homeGk, setHomeGk] = useState(matchInfo.homeGk || null);
  const [awayGk, setAwayGk] = useState(matchInfo.awayGk || null);
  const [mercs, setMercs] = useState([]);
  const [showMercPicker, setShowMercPicker] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState(null); // { text, parsed, ambiguous }
  const [speechRef, setSpeechRef] = useState(null);

  const { homeIdx, awayIdx, matchId, homeTeam, awayTeam, homeColor, awayColor } = matchInfo;

  const homeMercs = mercs.filter(m => m.side === "home").map(m => m.player);
  const awayMercs = mercs.filter(m => m.side === "away").map(m => m.player);
  const homePlayers = [...initHomePlayers.filter(p => !awayMercs.includes(p)), ...homeMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  const awayPlayers = [...initAwayPlayers.filter(p => !homeMercs.includes(p)), ...awayMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  const allPlayerNames = [...homePlayers, ...awayPlayers];

  const getMercCandidates = (side) => {
    const myPlayers = side === "home" ? homePlayers : awayPlayers;
    return (attendees || []).filter(p => !myPlayers.includes(p));
  };

  const matchEvents = allEvents.filter(e => e.matchId === matchId);
  const homeScore = calcMatchScore(allEvents, matchId, homeTeam);
  const awayScore = calcMatchScore(allEvents, matchId, awayTeam);

  const readOnlyAlert = () => alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요.");

  const checkGk = () => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return false; }
    return true;
  };

  const isPlayerHome = (player) => homePlayers.includes(player);

  // ── GK 토글 ──
  const toggleGk = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    const currentGk = isHome ? homeGk : awayGk;
    const newGk = currentGk === player ? null : player;
    if (isHome) { setHomeGk(newGk); } else { setAwayGk(newGk); }
    if (onGkChange) onGkChange(isHome ? homeIdx : awayIdx, newGk);
  };

  // ── 골 기록 ──
  const handleGoalTap = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!checkGk()) return;
    setPendingGoalPlayer({ player, isHome });
  };

  const handleAssistSelect = (assistPlayer) => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: gp.player, assist: assistPlayer,
      team: gp.isHome ? homeTeam : awayTeam, scoringTeam: gp.isHome ? homeTeam : awayTeam,
      concedingTeam: gp.isHome ? awayTeam : homeTeam, concedingGk: gp.isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
    setPendingGoalPlayer(null);
  };

  const handleNoAssist = () => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: gp.player, assist: null,
      team: gp.isHome ? homeTeam : awayTeam, scoringTeam: gp.isHome ? homeTeam : awayTeam,
      concedingTeam: gp.isHome ? awayTeam : homeTeam, concedingGk: gp.isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
    setPendingGoalPlayer(null);
  };

  const handleOwnGoalFromInline = () => {
    if (!pendingGoalPlayer) return;
    const gp = pendingGoalPlayer;
    const ownTeam = gp.isHome ? homeTeam : awayTeam;
    const scoringTeam = gp.isHome ? awayTeam : homeTeam;
    const ownGk = gp.isHome ? homeGk : awayGk;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player: gp.player,
      team: ownTeam, scoringTeam, concedingTeam: ownTeam,
      concedingGk: ownGk, concedingGkLoss: 2, assist: null, homeTeam, awayTeam,
    });
    setPendingGoalPlayer(null);
  };

  // ── 음성 기록 ──
  const recordGoalEvent = (scorer, assist) => {
    const isHome = isPlayerHome(scorer);
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: scorer, assist: assist || null,
      team: isHome ? homeTeam : awayTeam, scoringTeam: isHome ? homeTeam : awayTeam,
      concedingTeam: isHome ? awayTeam : homeTeam, concedingGk: isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
  };

  const recordOwnGoalEvent = (player) => {
    const isHome = isPlayerHome(player);
    const ownTeam = isHome ? homeTeam : awayTeam;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player,
      team: ownTeam, scoringTeam: isHome ? awayTeam : homeTeam, concedingTeam: ownTeam,
      concedingGk: isHome ? homeGk : awayGk, concedingGkLoss: 2, assist: null, homeTeam, awayTeam,
    });
  };

  const handleVoiceStart = () => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!checkGk()) return;
    if (!isSpeechSupported()) { alert("이 브라우저에서는 음성 인식이 지원되지 않습니다."); return; }
    setVoiceResult(null);
    setIsListening(true);
    const { recognition, promise } = startListening();
    setSpeechRef(recognition);
    promise.then(text => {
      setIsListening(false);
      setSpeechRef(null);
      if (!text) return;
      const parsed = parseVoiceText(text, allPlayerNames);
      if (!parsed.type) {
        setVoiceResult({ text, error: "인식 실패: 골/어시/자책을 구분할 수 없습니다" });
        return;
      }
      // 선수명 검증
      let scorer = parsed.scorer;
      let assist = parsed.assist;
      let ambiguous = null;
      if (scorer) {
        const candidates = fuzzyMatchPlayer(scorer, allPlayerNames);
        if (candidates.length === 0) { setVoiceResult({ text, error: `"${scorer}" 선수를 찾을 수 없습니다` }); return; }
        if (candidates.length > 1) { ambiguous = { field: "scorer", candidates, parsed, text }; setVoiceResult({ text, ambiguous }); return; }
        scorer = candidates[0];
      }
      if (assist) {
        const candidates = fuzzyMatchPlayer(assist, allPlayerNames);
        if (candidates.length === 0) { setVoiceResult({ text, error: `"${assist}" 선수를 찾을 수 없습니다` }); return; }
        if (candidates.length > 1) { ambiguous = { field: "assist", candidates, parsed: { ...parsed, scorer }, text }; setVoiceResult({ text, ambiguous }); return; }
        assist = candidates[0];
      }
      if (!scorer) { setVoiceResult({ text, error: "골 선수를 인식할 수 없습니다" }); return; }
      // 기록
      if (parsed.type === "owngoal") { recordOwnGoalEvent(scorer); }
      else { recordGoalEvent(scorer, assist); }
      setVoiceResult({ text, success: true, scorer, assist, type: parsed.type });
    }).catch(err => {
      setIsListening(false);
      setSpeechRef(null);
      if (err.message !== "aborted") setVoiceResult({ text: "", error: "음성 인식 오류: " + err.message });
    });
  };

  const handleVoiceEnd = () => {
    if (speechRef) { try { speechRef.stop(); } catch (e) { /* ignore */ } }
  };

  const handleAmbiguousSelect = (player) => {
    if (!voiceResult?.ambiguous) return;
    const { field, parsed } = voiceResult.ambiguous;
    let scorer = parsed.scorer;
    let assist = parsed.assist;
    if (field === "scorer") scorer = player;
    else assist = player;
    // scorer가 아직 fuzzy 상태일 수 있으므로 재검증
    if (typeof scorer === "string" && !allPlayerNames.includes(scorer)) {
      const m = fuzzyMatchPlayer(scorer, allPlayerNames);
      scorer = m.length === 1 ? m[0] : null;
    }
    if (scorer) {
      if (parsed.type === "owngoal") recordOwnGoalEvent(scorer);
      else recordGoalEvent(scorer, assist);
    }
    setVoiceResult(null);
  };

  const addMerc = (player, side) => { setMercs(prev => [...prev, { player, side }]); setShowMercPicker(null); };
  const removeMerc = (player) => { setMercs(prev => prev.filter(m => m.player !== player)); };

  const renderPlayerRow = (player, isHome, mercsArr) => {
    const isMerc = mercsArr.includes(player);
    const isGk = (isHome ? homeGk : awayGk) === player;
    const color = isHome ? homeColor : awayColor;
    const isPendingGoal = pendingGoalPlayer?.player === player;
    const isPendingAssistMode = pendingGoalPlayer && !isPendingGoal && pendingGoalPlayer.isHome === isHome;

    return (
      <div key={player} style={{ marginBottom: 3 }}>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {/* GK 토글 */}
          <button onClick={() => toggleGk(player, isHome)}
            style={{
              border: "none", borderRadius: 6, padding: "6px 6px", fontSize: 10, fontWeight: 700,
              cursor: "pointer", minWidth: 32, flexShrink: 0,
              background: isGk ? (C.yellow + "33") : C.grayDarker,
              color: isGk ? C.yellow : C.grayLight,
            }}>
            GK
          </button>

          {/* 선수 이름 */}
          <div style={{
            ...s.matchBtn(color), flex: 1, marginBottom: 0, minWidth: 0,
            opacity: pendingGoalPlayer && !isPendingGoal && !isPendingAssistMode ? 0.3 : 1,
          }}>
            {isMerc && <span style={{ fontSize: 8, color: C.orange, marginRight: 2 }}>용</span>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player}</span>
          </div>

          {/* ⚽ 골 버튼 */}
          {!pendingGoalPlayer && (
            <button onClick={() => handleGoalTap(player, isHome)}
              style={{
                border: "none", borderRadius: 6, padding: "6px 8px", fontSize: 12,
                fontWeight: 700, cursor: "pointer", background: `${C.green}30`, color: C.green,
                flexShrink: 0,
              }}>⚽</button>
          )}

          {isMerc && (
            <button onClick={() => removeMerc(player)}
              style={{ ...s.btnSm(C.redDim), padding: "2px 4px", fontSize: 8, minWidth: 16, flexShrink: 0 }}>X</button>
          )}
        </div>

        {/* 인라인 어시 선택 (이 선수가 골 누른 상태) */}
        {isPendingGoal && (
          <div style={{
            display: "flex", gap: 3, flexWrap: "wrap", padding: "6px 4px",
            background: `${C.accent}15`, borderRadius: 8, marginTop: 3,
          }}>
            <span style={{ fontSize: 10, color: C.gray, width: "100%", marginBottom: 2 }}>어시:</span>
            {(isHome ? homePlayers : awayPlayers).filter(p => p !== player).map(p => (
              <button key={p} onClick={() => handleAssistSelect(p)}
                style={{
                  border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11,
                  fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white,
                }}>
                {p}
              </button>
            ))}
            <button onClick={handleNoAssist}
              style={{
                border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11,
                fontWeight: 600, cursor: "pointer", background: C.grayDark, color: C.gray,
              }}>
              어시없음
            </button>
            <button onClick={handleOwnGoalFromInline}
              style={{
                border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11,
                fontWeight: 600, cursor: "pointer", background: `${C.red}30`, color: C.red,
              }}>
              자책골
            </button>
            <button onClick={() => setPendingGoalPlayer(null)}
              style={{
                border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11,
                fontWeight: 600, cursor: "pointer", background: `${C.red}20`, color: C.red,
              }}>
              취소
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ ...s.card, border: `1px solid ${C.grayDark}` }}>
      {courtLabel && <div style={{ fontSize: 11, color: C.gray, marginBottom: 6, textAlign: "center" }}>{courtLabel}</div>}

      {/* 스코어보드 */}
      <div style={s.scoreboard}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: homeColor?.bg, marginBottom: 4 }}>{homeTeam}</div>
          <div style={{ color: homeScore > awayScore ? C.green : C.white }}>{homeScore}</div>
        </div>
        <div style={{ fontSize: 18, color: C.gray }}>:</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: awayColor?.bg, marginBottom: 4 }}>{awayTeam}</div>
          <div style={{ color: awayScore > homeScore ? C.green : C.white }}>{awayScore}</div>
        </div>
      </div>

      {/* 선수 목록 */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.gray, textAlign: "center", marginBottom: 4 }}>{homeTeam}</div>
          {homePlayers.map(p => renderPlayerRow(p, true, homeMercs))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.gray, textAlign: "center", marginBottom: 4 }}>{awayTeam}</div>
          {awayPlayers.map(p => renderPlayerRow(p, false, awayMercs))}
        </div>
      </div>

      {/* 선수추가 */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={() => setShowMercPicker("home")} style={{ ...s.btnSm(C.grayDark, C.orange), flex: 1, fontSize: 11 }}>+ 선수추가</button>
        <button onClick={() => setShowMercPicker("away")} style={{ ...s.btnSm(C.grayDark, C.orange), flex: 1, fontSize: 11 }}>+ 선수추가</button>
      </div>

      {showMercPicker && (
        <MercPicker side={showMercPicker} candidates={getMercCandidates(showMercPicker)}
          opposingPlayers={showMercPicker === "home" ? awayPlayers : homePlayers}
          teamName={showMercPicker === "home" ? homeTeam : awayTeam}
          onAdd={addMerc} onClose={() => setShowMercPicker(null)} C={C} s={s} />
      )}

      {/* 음성 입력 */}
      {!readOnly && isSpeechSupported() && (
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <button
            onTouchStart={handleVoiceStart} onTouchEnd={handleVoiceEnd}
            onMouseDown={handleVoiceStart} onMouseUp={handleVoiceEnd}
            style={{
              border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", width: "100%",
              background: isListening ? `${C.red}30` : `${C.accent}20`,
              color: isListening ? C.red : C.accent,
              transition: "all 0.15s",
            }}>
            {isListening ? "🎤 듣는 중..." : "🎤 꾹 눌러서 말하기"}
          </button>
        </div>
      )}

      {/* 음성 결과 피드백 */}
      {voiceResult && (
        <div style={{ marginTop: 6, padding: 8, borderRadius: 8, fontSize: 12,
          background: voiceResult.error ? `${C.red}15` : voiceResult.ambiguous ? `${C.orange}15` : `${C.green}15`,
          color: voiceResult.error ? C.red : voiceResult.ambiguous ? C.orange : C.green,
        }}>
          {voiceResult.error && <div>{voiceResult.error}</div>}
          {voiceResult.success && (
            <div>
              {voiceResult.type === "owngoal" ? "🔴" : "⚽"} {voiceResult.scorer}
              {voiceResult.type === "goal" && voiceResult.assist ? ` ← ${voiceResult.assist}(어시)` : ""}
              {voiceResult.type === "goal" && !voiceResult.assist ? " (단독골)" : ""}
              {voiceResult.type === "owngoal" ? " (자책골)" : ""}
            </div>
          )}
          {voiceResult.ambiguous && (
            <div>
              <div style={{ marginBottom: 4 }}>"{voiceResult.text}" — 선수를 선택하세요:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {voiceResult.ambiguous.candidates.map(p => (
                  <button key={p} onClick={() => handleAmbiguousSelect(p)}
                    style={{ ...s.btnSm(C.grayDarker, C.white), padding: "4px 10px", fontSize: 12 }}>{p}</button>
                ))}
                <button onClick={() => setVoiceResult(null)}
                  style={{ ...s.btnSm(C.redDim, C.white), padding: "4px 10px", fontSize: 12 }}>취소</button>
              </div>
            </div>
          )}
          {voiceResult.text && !voiceResult.ambiguous && (
            <div style={{ fontSize: 10, color: C.grayLight, marginTop: 2 }}>인식: "{voiceResult.text}"</div>
          )}
        </div>
      )}

      {/* 이벤트 로그 */}
      <EventLog
        matchEvents={matchEvents} allEvents={allEvents} matchId={matchId}
        homePlayers={homePlayers} awayPlayers={awayPlayers}
        homeTeam={homeTeam} awayTeam={awayTeam}
        homeGk={homeGk} awayGk={awayGk}
        homeColor={homeColor} awayColor={awayColor}
        onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} styles={s} readOnly={readOnly}
      />
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/game/CourtRecorder.jsx
git commit -m "feat: CourtRecorder 리팩토링 — GK 토글, 인라인 어시, 음성 입력"
```

---

### Task 3: 빌드 검증

**Files:** (변경 없음)

- [ ] **Step 1: 빌드 성공 확인**

```bash
cd /Users/rh/Desktop/python_dev/footsal_webapp && npm run build
```

Expected: 에러 없이 빌드 완료. 호출부(ScheduleMatchView, FreeMatchView, PushMatchView)는 CourtRecorder의 props 인터페이스가 동일하므로 변경 불필요.

- [ ] **Step 2: 문제 있으면 수정 후 커밋**

```bash
git add -A
git commit -m "fix: 빌드 오류 수정"
```

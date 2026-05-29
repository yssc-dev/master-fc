import { useMemo, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { TEAM_COLORS } from '../../config/constants';
import Modal from '../common/Modal';
import {
  generateBalancedSegment,
  countCurrentMatchesPerTeam,
  estimateMatchMinutes,
} from '../../utils/balancedSchedule';

const SUPPORTED_TEAM_COUNTS = [4, 5];

export default function BalancedScheduleModal({
  teamCount,
  teamNames,
  teamColorIndices,
  completedMatches,
  allEvents,
  courtCount: initialCourtCount,
  hasLiveMatch,
  onConfirm,
  onClose,
}) {
  const { C } = useTheme();

  // Derived flag — used to guard hooks and early return below
  const isSupported = SUPPORTED_TEAM_COUNTS.includes(teamCount);

  // All hooks MUST come before any conditional return (Rules of Hooks)
  const [courtCount, setCourtCount] = useState(initialCourtCount || 2);
  const [cycles, setCycles] = useState(1);
  const defaultMinutes = useMemo(
    () => estimateMatchMinutes(completedMatches, allEvents),
    [completedMatches, allEvents],
  );
  const [minutes, setMinutes] = useState(defaultMinutes);
  // 더블 클릭/연타 방지 — 한 번 생성 누르면 잠금
  const [submitted, setSubmitted] = useState(false);

  const currentCounts = useMemo(
    () => countCurrentMatchesPerTeam(completedMatches, teamCount),
    [completedMatches, teamCount],
  );

  const preview = useMemo(
    () => isSupported ? generateBalancedSegment({ teamCount, courtCount, cycles }) : [],
    [isSupported, teamCount, courtCount, cycles],
  );

  // 4·5팀 외엔 비활성화 안내만 표시
  if (!isSupported) {
    return (
      <Modal onClose={onClose} title="대진표 자동설정">
        <div style={{ padding: 20, textAlign: "center", color: C.gray, fontSize: 13, lineHeight: 1.6 }}>
          {teamCount === 3 && "3팀은 1코트 진행이라 자동설정 대상이 아닙니다."}
          {teamCount === 6 && "6팀은 그룹스플릿 모드를 사용해주세요."}
          {teamCount >= 7 && "본 기능은 4·5팀에서 지원합니다."}
        </div>
      </Modal>
    );
  }

  const totalMatches = preview.reduce((sum, r) => sum + r.matches.length, 0);
  const matchesPerTeam = teamCount > 0 ? (totalMatches * 2) / teamCount : 0;
  const totalMinutes = preview.length * Math.max(1, Number(minutes) || 0);
  const isImbalanced = Math.max(...currentCounts) - Math.min(...currentCounts) >= 1;

  const handleConfirm = () => {
    if (submitted) return; // 더블 클릭/연타 방지
    if (hasLiveMatch) {
      alert("라이브 매치를 먼저 확정하거나 취소한 뒤 자동설정을 진행해주세요.");
      return;
    }
    setSubmitted(true);
    onConfirm({ newRounds: preview, newCourtCount: courtCount });
  };

  const pill = (teamIdx) => {
    const ci = teamColorIndices?.[teamIdx];
    const tc = ci != null ? TEAM_COLORS[ci] : null;
    return {
      display: "inline-block", padding: "2px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700,
      background: tc ? `${tc.bg}55` : C.cardLight,
      color: C.white,
      border: tc ? `1px solid ${tc.bg}88` : "none",
      whiteSpace: "nowrap",
    };
  };

  const segBtn = (active) => ({
    background: active ? C.accent : C.cardLight,
    color: active ? C.bg : C.white,
    border: 0, borderRadius: 8, padding: "8px 12px",
    fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1,
  });

  return (
    <Modal onClose={onClose} title="대진표 자동설정">
      {/* 입력 영역 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>코트 수</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2].map(n => (
              <button key={n} onClick={() => setCourtCount(n)} style={segBtn(courtCount === n)}>
                {n}코트
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>몇 번씩 대전</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setCycles(n)} style={segBtn(cycles === n)}>
                {n}번씩
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>
            매치당 시간 (분) · 자동 추정 {defaultMinutes}분
          </div>
          <input
            type="number"
            min={1}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${C.grayDarker}`, background: C.cardLight,
              color: C.white, fontSize: 14,
            }}
          />
        </div>

        {isImbalanced && (
          <div style={{ fontSize: 11, color: C.orange, background: `${C.orange}11`, padding: "8px 10px", borderRadius: 8 }}>
            ⚠ 현재 팀 간 매치 수 차이가 {Math.max(...currentCounts) - Math.min(...currentCounts)}매치 있습니다.
            이 자동 스케줄은 추가 보정 없이 라운드로빈을 더하므로 최종 누적이 동일하지 않을 수 있습니다.
          </div>
        )}

        {/* 미리보기 요약 */}
        <div style={{ background: C.cardLight, borderRadius: 8, padding: 10, fontSize: 12, color: C.white, lineHeight: 1.8 }}>
          <div><span style={{ color: C.gray }}>총 매치:</span> <b>{totalMatches}</b></div>
          <div><span style={{ color: C.gray }}>각 팀 추가:</span> <b>+{matchesPerTeam}경기</b></div>
          <div><span style={{ color: C.gray }}>라운드 수:</span> <b>{preview.length}R × {courtCount}코트</b></div>
          <div><span style={{ color: C.gray }}>예상 소요:</span> <b>약 {totalMinutes}분</b></div>
        </div>

        {/* 매치업 리스트 */}
        <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.grayDarker}`, borderRadius: 8, padding: 8 }}>
          {preview.map((round, ri) => {
            const playingTeams = new Set(round.matches.flatMap(([h, a]) => [h, a]));
            const restingTeams = Array.from({ length: teamCount }, (_, i) => i).filter(i => !playingTeams.has(i));
            return (
              <div key={ri} style={{ marginBottom: 6, fontSize: 11, color: C.white }}>
                <span style={{ color: C.accent, fontWeight: 700, marginRight: 6 }}>R{ri + 1}</span>
                {round.matches.map(([h, a], mi) => (
                  <span key={mi} style={{ marginRight: 6 }}>
                    <span style={pill(h)}>{teamNames[h]}</span>
                    <span style={{ margin: "0 4px", color: C.gray }}>vs</span>
                    <span style={pill(a)}>{teamNames[a]}</span>
                  </span>
                ))}
                {restingTeams.length > 0 && (
                  <span style={{ color: C.gray, marginLeft: 4 }}>
                    · 휴식: {restingTeams.map(i => teamNames[i]).join(", ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, background: C.grayDark, color: C.white, border: 0, borderRadius: 8,
            padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>취소</button>
          <button onClick={handleConfirm}
            disabled={submitted}
            style={{
              flex: 2, background: submitted ? C.grayDarker : C.accent, color: submitted ? C.gray : C.bg,
              border: 0, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 800,
              cursor: submitted ? "not-allowed" : "pointer", opacity: submitted ? 0.6 : 1,
            }}>{submitted ? "생성 중..." : "생성"}</button>
        </div>
      </div>
    </Modal>
  );
}

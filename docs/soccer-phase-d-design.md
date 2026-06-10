# Phase D 설계 — 축구 셸 정렬 (MatchHeader · RoundNav · ConfirmBar) + viewState 단순화

작성: 2026-06-10. 대상: 축구 모드. **제약: 풋살(App.jsx 등) 무손상.**

## 목표
풋살과 구조적으로 일관된 경기 진행 셸을 축구에 도입한다.
1. 공유 **MatchHeader** (HIG sticky 헤더: 홈 버튼 + 타이틀/서브타이틀 + sync 배지) — 축구가 채택(현 `s.header` 중앙정렬 대체). C단계에서 미룬 헤더 통일 완료.
2. 공유 **RoundNav** (◀ 제N경기 / 총M ▶ + 진행중/종료됨 상태칩) — 축구가 경기 간 이동에 사용.
3. 공유 **ConfirmBar** (하단 바: 종료확정 / 확정취소) — 축구의 종료·다시열기를 하단 바로 일원화.
4. `SoccerMatchView`의 viewState(5상태)+viewingMatchIdx+동기화 useEffect 4개를 **selectedIdx 단일 축**으로 단순화.

풋살은 자체 인라인 헤더/네비/바를 유지(공유 컴포넌트는 풋살 룩을 복제). 풋살 채택은 Phase F(선택).

## 공유 컴포넌트 API (신규, src/components/game/)

### MatchHeader
```
<MatchHeader title subtitle onHome syncStatus />
```
풋살 App.jsx:1271-1300의 sticky 헤더 마크업을 그대로 이식. CSS변수만 사용.

### RoundNav
```
<RoundNav label="제3경기" total={5} index={2}
  onPrev onNext canPrev canNext statusText="진행중" statusTone="orange" />
```
ScheduleMatchView:63-108의 ◀▶ + 라운드표시 + 상태칩 패턴 이식.

### ConfirmBar
```
<ConfirmBar>{children}</ConfirmBar>   // s.bottomBar 래퍼
```
또는 액션 배열 prop. 풋살 App.jsx:1519-1533 패턴.

## 축구 모델 매핑 (⚠️ 기각 — 아래 selectedIdx 모델은 과설계로 채택 안 함. 기록용)

현재(선형 화면): selectOpponent → formation → playing → matchFinished(+ viewingMatchIdx 과거보기) → editRoster.

목표(선택 인덱스 축): `selectedIdx`가 제1..M경기 + "새 경기" 슬롯(M+1)을 가리키고, RoundNav 화살표로 이동. 선택된 슬롯에 따라 본문:
- **새 경기 슬롯**: OpponentSelector → (상대 선택 후) FormationSetup → 생성 시 playing.
- **playing 경기**: FormationRecorder(편집). ConfirmBar = "제N경기 종료 확정".
- **finished 경기**: 읽기전용 요약/레코더. ConfirmBar = "제N경기 종료됨 · [확정취소]"(→ reopen→playing→편집). 풋살의 확정=잠금 / 확정취소=편집과 동일 멘탈모델.
- **휴식 경기**: 요약만, 확정취소 숨김.

`matchFormation`은 선택된 경기 객체(soccerMatches[selectedIdx])에서 derive → 별도 슬롯 동기화 제거(Phase E의 SSOT와 연결).

## viewState 단순화 (⚠️ 기각 — 과설계/고위험. 채택 안 함. 기록용)
- 제거: viewState 5상태, viewingMatchIdx, 4개 sync useEffect 중 일부.
- 도입: `selectedIdx`(로컬 네비, 탭별), 본문 모드는 `soccerMatches[selectedIdx]?.status`에서 파생.
- 멀티탭: "현재 진행 경기"는 currentMatchIdx + status로 이미 동기화됨. selectedIdx는 탭별 보기 상태라 비동기(로컬)로 충분. editRoster는 별도 토글 유지.

## 서브 페이징 (개정 — 적대적 플랜리뷰 후 축소)
> 리뷰 결론: viewState→selectedIdx 전면 재작성과 "M+1 새 경기 슬롯"은 요청 범위 밖 과설계.
> **공유 컴포넌트 채택만 하고, 기존 viewState/플로우는 보존**한다.

- **D1**: MatchHeader 추출 + 축구 채택. 저위험·고립. (C에서 미룬 헤더 통일)
- **D2**: RoundNav 추출 + **기존 viewingMatchIdx(과거경기 읽기전용 보기)에만** 화살표 UI를 입힘. active-match 플로우/viewState는 미변경. 저~중위험.
- **D3**: ConfirmBar 추출 + 기존 handleFinishMatch/handleReopenMatch를 하단 바에 연결. **viewState 머신·matchFormation 저장구조·soccerFormation shape는 그대로 둠.** 중위험.

### 버림(이번 D 범위 제외)
- viewState 5상태 → selectedIdx 단일축 전면 재작성.
- "M+1 새 경기 슬롯" 개념(축구 ad-hoc 생성에 라운드 메타포 강제).
- matchFormation을 match객체에서 derive(FormationRecorder uncontrolled state와 충돌).
- soccerFormation shape 변경(경기 중 배포 위험).
→ 필요 시 별도 전용 페이즈에서 가드레일(아래) 갖춰 재검토.

## 가드레일 (구현 시 필수)
- 공유 컴포넌트는 soccer-specific 라벨/톤 하드코딩 금지(Phase F 풋살 채택 대비). 라벨·톤은 prop으로.
- 휴식 경기: ConfirmBar에서 확정취소 숨김(`opponent !== "휴식"`).
- D2/D3 어느 것도 soccerFormation shape·viewState 의미를 바꾸지 않음(경기 중 배포 호환).
- 각 서브페이즈: 빌드+388테스트+적대적 리뷰 후 배포.

## 풋살-safety
- 신규 공유 컴포넌트는 축구만 import. App.jsx/CourtRecorder/ScheduleMatchView 등 풋살 파일 미변경.
- 공유 `Modal`처럼 추가 소비자만 늘림. 풋살은 Phase F까지 자체 인라인 유지.

## 위험 / 미해결 질문
1. D3는 SoccerMatchView 최대 파일 재작성 → 축구 내부 회귀 위험. 각 서브폐이즈 후 빌드+테스트+적대적 리뷰 필수.
2. "새 경기" 슬롯을 RoundNav에 M+1로 노출할지, 별도 "+ 새 경기" 버튼으로 둘지 — UX 결정 필요.
3. finished 경기를 읽기전용 레코더로 볼지(풋살식) vs 현 요약카드 유지할지.
4. 멀티탭에서 selectedIdx 비동기 시 탭마다 다른 경기를 봐도 무방한지(무방 판단, 데이터는 경기객체 단일).
5. editRoster(명단수정)는 셸 밖 별도 화면 유지.

## 비목표
- 엔진/리듀서 통합(도메인 다름, 비권장).
- 풋살 마이그레이션(Phase F 선택).

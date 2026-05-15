# footsal_webapp — Apple 디자인 적용 프롬프트 패키지

현재 앱은 **Monochrome Canvas**(흑백 + dashed + Inter) 시스템 위에 올라가 있습니다. Apple 디자인 언어(iOS/macOS HIG)로 전환하려면 몇 가지 근본적인 차이를 먼저 짚어야 합니다.

## Monochrome → Apple 차이 요약

| 항목 | 현재 (Monochrome) | 목표 (Apple) |
|---|---|---|
| 컬러 | 흑/백 + ink accent | system blue/green/red/orange + neutral grays |
| 폰트 | Inter 320–540 weight | SF Pro / Pretendard, 400–600 weight |
| 강조 | dashed 2px border | subtle solid border + elevation |
| 코너 | 50px pill / 50% circle | 8/10/14px (button 10, card 14, grouped 10) |
| 섹션 라벨 | `font-mono` UPPERCASE | 그냥 한글 normal text, secondary color |
| 아이콘 | 이모지 (⚽📋👑) | SF Symbols 스타일 SVG |
| 리스트 | 카드 나열 | **insetGrouped** 리스트 (한 카드 안에 여러 row) |
| 숫자 | tabular-nums 유지 | 그대로 유지 |

## 파일 순서 (우선순위)

| # | 프롬프트 | 효과 |
|---|---|---|
| 1 | `01_tokens_and_reset.md` | app_tokens.css 도입, 흑백 토큰 교체 |
| 2 | `02_theme_js_refactor.md` | `makeStyles` → Apple 버튼/카드/row 리팩터 |
| 3 | `03_typography_korean.md` | uppercase + mono 제거, 한글 가독성 |
| 4 | `04_emoji_to_sfsymbol.md` | 이모지 → SVG 아이콘 컴포넌트 |
| 5 | `05_grouped_lists.md` | 카드 나열 → insetGrouped 리스트 |
| 6 | `06_modal_sheet.md` | Modal → 바텀시트 / 중앙 시트 |
| 7 | `07_home_dashboard.md` | HomeScreen + TeamDashboard 재정렬 |
| 8 | `08_setup_screen.md` | App.jsx setup 페이즈 재구성 |
| 9 | `09_court_recorder.md` | CourtRecorder 스코어보드 + 선수 그리드 |
| 10 | `10_forms_inputs.md` | 입력 필드 underline → boxed, focus ring |

각각 독립 실행 가능. 1→2 순서만 지키고 나머지는 자유. 시각적 큰 차이는 1/2/3/5에서 나옴.

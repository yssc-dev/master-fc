# 04. 이모지 → SVG 아이콘 컴포넌트

**파일:** `src/components/common/icons.jsx` (신규), 여러 사용처

## 문제
⚽ 📋 👑 🌙 ☀️ ⚙️ 👥 ✅ ❌ 등 이모지가 UI 곳곳에 박혀 있음. OS별 렌더 차이가 크고, 다크 모드에서 색 대비 안 맞고, Apple 시스템 룩과 안 맞음. SF Symbols 스타일 모노크롬 SVG로 통일.

## 할 일

### 1. `src/components/common/icons.jsx` 신규 작성

```jsx
// 모든 아이콘은 currentColor 사용, 24x24 viewBox, stroke 1.6
// 사용처에서 <SoccerBallIcon width={18} /> 또는 color 속성 조절 가능

const base = (path, props = {}) => ({ width = 20, height, color = "currentColor", ...rest }) => (
  <svg
    width={width}
    height={height || width}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {path}
  </svg>
);

export const SoccerBallIcon = base(<><circle cx="12" cy="12" r="9"/><path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M6.5 6.5l3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3"/></>);
export const ListIcon      = base(<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>);
export const CrownIcon     = base(<><path d="M3 18h18l-2-11-4 4-3-7-3 7-4-4-2 11z"/></>);
export const MoonIcon      = base(<><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>);
export const SunIcon       = base(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></>);
export const SettingsIcon  = base(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>);
export const UsersIcon     = base(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>);
export const CheckIcon     = base(<path d="M20 6L9 17l-5-5"/>);
export const XIcon         = base(<path d="M18 6L6 18M6 6l12 12"/>);
export const ChevronRight  = base(<path d="M9 18l6-6-6-6"/>);
export const ChevronLeft   = base(<path d="M15 18l-9-6 9-6"/>);
export const ChevronDown   = base(<path d="M6 9l6 6 6-6"/>);
export const PlusIcon      = base(<path d="M12 5v14M5 12h14"/>);
export const MicIcon       = base(<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 19v3"/></>);
export const TrophyIcon    = base(<><path d="M8 21h8M12 17v4M17 3H7v4a5 5 0 0 0 10 0V3zM17 5h2a3 3 0 0 1 0 6h-2M7 5H5a3 3 0 0 0 0 6h2"/></>);
export const CalendarIcon  = base(<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>);
export const HomeIcon      = base(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-6a2 2 0 0 0-4 0v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>);
export const BackIcon      = base(<path d="M19 12H5M12 19l-7-7 7-7"/>);
export const FlagIcon      = base(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V3"/></>);
```

### 2. 사용처 교체

| 이모지 | 컴포넌트 | 파일 |
|---|---|---|
| ⚽ | `<SoccerBallIcon />` | App.jsx, SoccerApp.jsx, HomeScreen |
| 📋 | `<ListIcon />` | App.jsx (시트 연동 버튼) |
| 👑 | `<CrownIcon />` | App.jsx (팀장 표시) |
| 🌙 / ☀️ | `<MoonIcon />` / `<SunIcon />` | HomeScreen, TeamDashboard |
| ⚙️ | `<SettingsIcon />` | App.jsx (경기 설정) |
| 👥 | `<UsersIcon />` | App.jsx (참석자) |
| ✓ / ✕ | `<CheckIcon />` / `<XIcon />` | 여러 곳 |
| OPP (dashed) | 작은 텍스트 배지 그대로 (OK) | CourtRecorder |

### 3. 사용 스타일

헤더 제목 같은 경우 다음 형태로:
```jsx
<div style={s.title}>
  <SoccerBallIcon width={18} />
  <span>{teamContext?.team} 경기기록</span>
</div>
```

이를 위해 `theme.js`의 `title` 스타일에 `display: 'inline-flex'; alignItems: 'center'; gap: 8` 추가. 아이콘만 가로 `flex: none`으로.

### 4. 이모지 완전 제거 규칙

- 헤더/버튼 라벨에서 이모지 접두사 전부 제거 (라벨 텍스트만 남김 + 별도 아이콘 컴포넌트)
- 채팅/알림 같은 코멘트성 텍스트에 쓰인 이모지만 유지 가능 (거의 없음)

## 검증

- [ ] `grep -r "⚽\|📋\|👑\|🌙\|☀️\|⚙️\|👥\|✅" src/` → 0건
- [ ] 각 화면의 아이콘이 모노크롬 SVG로 표시되고 `currentColor`를 따름 (다크 모드 자동 대응)
- [ ] 아이콘 크기가 16–20px 범위에서 텍스트와 baseline 정렬됨
- [ ] lint 통과

# 10. 입력 필드 Apple 스타일 + 폼 정리

**파일:** 입력 필드 사용하는 모든 곳 — `App.jsx`, `TeamDashboard.jsx`, `SettingsScreen.jsx`, `LoginScreen.jsx`, `ScheduleModal.jsx` 등

## 문제
현재 `s.input`이 `border-bottom: 1.5px solid C.white` 언더라인 스타일 (Monochrome 컨셉). Apple iOS/macOS 폼은 둥근 박스 + subtle 배경 + focus ring. 02 프롬프트에서 이미 `s.input`을 박스 스타일로 교체했지만, focus 상태와 여러 사용처 패턴 정리가 필요.

## 할 일

### 1. theme.js `input` focus 상태

02에서 교체한 `input` 스타일은 기본 상태. React 인라인 스타일로 focus 상태를 다루기 어려우므로 `global.css`에 클래스 추가:

```css
.app-input,
input.app-input,
textarea.app-input {
  background: var(--app-bg-row-hover);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 11px 12px;
  color: var(--app-text-primary);
  font-size: 16px;
  font-weight: 400;
  letter-spacing: -0.01em;
  outline: none;
  width: 100%;
  font-family: inherit;
  transition: border-color 0.12s, background 0.12s;
}
.app-input:focus {
  border-color: var(--app-blue);
  background: var(--app-bg-row);
  box-shadow: 0 0 0 3px rgba(0,122,255,0.12);
}
.app-input::placeholder { color: var(--app-text-placeholder); }

.app-input-search {
  /* 검색 input 변형 */
  padding-left: 36px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238E8E93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 12px center;
}
```

### 2. 사용처 교체

기존 `<input style={s.input} ... />`를 `<input className="app-input" ... />`로 바꾸거나 둘 다 지정:

```jsx
<input className="app-input" style={{ flex: 1 }} placeholder="새 선수 이름" ... />
```

`s.input` 인라인 스타일은 남겨도 되지만 CSS 클래스가 focus 상태까지 커버하므로 `className`만 써도 충분.

### 3. 주요 사용처별 정리

#### LoginScreen.jsx
이름/휴대폰 입력란을 Apple 로그인 폼 스타일로:
- label을 input 좌측 padding: 16 대신 input 위 작은 secondary 텍스트
- 또는 floating label 없이 placeholder만 사용 (Apple Sign-In 스타일)

```jsx
<div style={{ marginBottom: 12 }}>
  <label style={{ display: "block", fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 6, paddingLeft: 4 }}>
    이름
  </label>
  <input className="app-input" value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" />
</div>
```

또는 iOS 세팅식으로 **grouped row에 인라인 input**:

```jsx
<div className="app-grouped">
  <div className="app-row">
    <span className="app-row-title" style={{ flex: "0 0 90px" }}>이름</span>
    <input className="app-input" value={name} onChange={...}
      style={{ flex: 1, background: "transparent", border: 0, padding: 0 }}
      placeholder="홍길동" />
  </div>
  <div className="app-row">
    <span className="app-row-title" style={{ flex: "0 0 90px" }}>뒷자리 4</span>
    <input className="app-input" value={phone4} onChange={...}
      style={{ flex: 1, background: "transparent", border: 0, padding: 0 }}
      type="tel" inputMode="numeric" maxLength={4} placeholder="1234" />
  </div>
</div>
```

이게 Apple-native 느낌. 추천.

#### TeamDashboard 선수 검색 (있다면)
검색 input은 `app-input-search` 클래스 추가:
```jsx
<input className="app-input app-input-search" placeholder="선수 검색" ... />
```

#### 팀명 인라인 편집 (App.jsx teamBuild phase)
기존 `<input autoFocus style={{...s.input, width: 100, padding: "4px 8px", fontSize: 14, fontWeight: 700 }} ... />`:
```jsx
<input autoFocus className="app-input"
  style={{ width: 120, padding: "4px 8px", fontSize: 14, fontWeight: 600, textAlign: "left" }}
  ... />
```

### 4. 폼 버튼 정렬

form-submit 버튼들:
- Primary (주요 행동): `s.btnFull()` - `var(--app-blue)`
- Destructive: `s.btn('var(--app-red)', '#fff')`
- Secondary: `s.btn('var(--app-bg-row-hover)', C.white)`

각 form은 하단에 primary를 오른쪽, secondary(취소)를 왼쪽:

```jsx
<div style={{ display: "flex", gap: 8, marginTop: 16 }}>
  <button onClick={onCancel}
    style={s.btn("var(--app-bg-row-hover)", C.white)}>취소</button>
  <div style={{ flex: 1 }} />
  <button onClick={onSubmit}
    style={s.btn("var(--app-blue)", "#fff")}>확인</button>
</div>
```

### 5. 숫자 입력

스코어 보정, 점수 조정 등 숫자 입력은 iOS 스타일 stepper나 기본 inputmode:
```jsx
<input className="app-input" type="number" inputMode="numeric" pattern="[0-9]*" ... />
```

## 검증
- [ ] 모든 input이 박스 스타일 + focus 시 파란 테두리 + 연한 할로
- [ ] 다크 모드에서 placeholder가 적절히 연해짐
- [ ] LoginScreen이 grouped 인라인 input row 스타일
- [ ] 검색 input에 자동 돋보기 아이콘
- [ ] 폼 하단 버튼이 취소/확인 계층 + 여백
- [ ] lint 통과

// Master FC — Screens. Five core flows rebuilt on the Figma-inspired
// monochrome chrome. Color lives ONLY inside match data (team dots,
// event markers). Every button = pill; every icon button = circle;
// focus = dashed 2px; type = variable-weight Inter with unusual stops.
//
// Screens exported: LoginScreen, HomeScreen, RecordScreen, EventLogPanel,
// StatsScreen, MeScreen, GoalModal.

// Mock data ───────────────────────────────────────────────────
const MFC_TEAMS = [
  { name: '마스터FC',   color: '#5b2bff', sports: ['풋살'],       role: '관리자', current: true  },
  { name: '연남조기회', color: '#14ae5c', sports: ['축구'],       role: '멤버' },
  { name: '토요푸키',   color: '#f97316', sports: ['풋살', '축구'], role: '멤버' },
];

const MFC_PLAYERS_HOME = ['김민재', '손흥민', '이강인', '황희찬', '조규성'];
const MFC_PLAYERS_AWAY = ['정승원', '박용우', '설영우', '이재성', '황의조'];

const MFC_EVENTS_SEED = [
  { id: 1, type: 'goal',    player: '이강인', assist: '손흥민', team: '연두팀', color: '#84cc16', min: "12'" },
  { id: 2, type: 'goal',    player: '정승원', assist: null,    team: '검정팀', color: '#1e293b', min: "18'" },
  { id: 3, type: 'goal',    player: '손흥민', assist: '김민재', team: '연두팀', color: '#84cc16', min: "24'" },
  { id: 4, type: 'owngoal', player: '박용우', assist: null,    team: '연두팀', color: '#84cc16', concedingGk: '황의조', min: "31'" },
];

const MFC_PLAYER_STATS = [
  { name: '손흥민', goals: 14, assists: 8,  mvp: 3, rate: 2.1, wins: 11, plays: 15 },
  { name: '이강인', goals: 11, assists: 9,  mvp: 2, rate: 1.9, wins: 10, plays: 15 },
  { name: '김민재', goals: 2,  assists: 1,  mvp: 4, rate: 1.7, wins: 12, plays: 15 },
  { name: '황희찬', goals: 9,  assists: 4,  mvp: 1, rate: 1.4, wins: 8,  plays: 14 },
  { name: '조규성', goals: 7,  assists: 3,  mvp: 0, rate: 1.1, wins: 7,  plays: 14 },
  { name: '정승원', goals: 5,  assists: 6,  mvp: 2, rate: 1.0, wins: 8,  plays: 15 },
  { name: '설영우', goals: 1,  assists: 5,  mvp: 1, rate: 0.8, wins: 7,  plays: 14 },
];

// ─────────────────────────────────────────────────────────────
// LoginScreen — monochrome reimagining of the Master FC login.
// Hero wordmark · two inputs · dashed focus · black pill CTA.
// ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [name, setName] = React.useState('');
  const [phone4, setPhone4] = React.useState('');
  const [err, setErr] = React.useState('');

  const submit = () => {
    if (!name.trim()) { setErr('이름을 입력하세요'); return; }
    if (!/^\d{4}$/.test(phone4)) { setErr('휴대폰 뒷자리 4자리를 입력하세요'); return; }
    setErr('');
    onLogin && onLogin({ name: name.trim(), phone4 });
  };

  const inputStyle = {
    width: '100%', background: 'transparent',
    border: 'none', borderBottom: '1.5px solid #000',
    borderRadius: 0, padding: '12px 2px',
    fontFamily: 'inherit', fontSize: 18, fontWeight: 340, letterSpacing: -0.22,
    outline: 'none', color: '#000',
    transition: 'border-color .15s',
  };

  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column' }}>
      <StatusBar />
      <div style={{ flex: 1, padding: '32px 28px 28px', display: 'flex', flexDirection: 'column' }}>
        {/* Hero wordmark */}
        <div style={{ paddingTop: 24, marginBottom: 60 }}>
          <div className="t-mono" style={{ fontSize: 11, opacity: 0.5, marginBottom: 10 }}>MASTER FC — V2</div>
          <div style={{
            fontSize: 54, fontWeight: 400, lineHeight: 0.95, letterSpacing: -2.2,
          }}>
            Record<br />
            every<br />
            <span style={{ fontStyle: 'italic', fontWeight: 450 }}>match.</span>
          </div>
          <div className="t-body" style={{ marginTop: 14, opacity: 0.6, maxWidth: 260 }}>
            골·어시·실점을 정확히. 팀의 모든 기록은 여기서.
          </div>
        </div>

        {/* Form */}
        <div style={{ marginBottom: 20 }}>
          <div className="t-mono" style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>이름</div>
          <input style={inputStyle} placeholder="홍길동" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div className="t-mono" style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>휴대폰 뒷자리 · 4</div>
          <input style={inputStyle} inputMode="numeric" maxLength={4} placeholder="1234"
            value={phone4}
            onChange={e => setPhone4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        {err && (
          <div className="t-small" style={{ color: 'var(--data-red)', marginBottom: 10 }}>{err}</div>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn btn-solid" onClick={submit}
          style={{ width: '100%', padding: '16px 24px', fontSize: 16 }}>
          로그인
          <Icon name="arrowR" size={18} />
        </button>
        <div className="t-small" style={{ textAlign: 'center', marginTop: 14, opacity: 0.5 }}>
          관리자에게 <span style={{ textDecoration: 'underline' }}>회원인증 시트</span> 등록을 요청하세요.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HomeScreen — team picker. Each team card is a large pill with a
// color dot (the ONLY color), dashed "add team" affordance matching
// the Figma dashed-focus language.
// ─────────────────────────────────────────────────────────────
function HomeScreen({ user = { name: '김민재' }, onSelectTeam, onTab }) {
  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column', background: '#fafaf8' }}>
      <StatusBar />
      <div className="phone-scroll" style={{ position: 'static', flex: 1, overflowY: 'auto' }}>
        {/* Greeting */}
        <div style={{ padding: '12px 22px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="t-mono" style={{ fontSize: 11, opacity: 0.5 }}>MASTER FC</div>
            <IconBtn icon="settings" size={36} />
          </div>
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.05 }}>
            안녕, <span style={{ fontStyle: 'italic', fontWeight: 450 }}>{user.name}</span>.
          </div>
          <div className="t-body-lg" style={{ marginTop: 6, opacity: 0.6 }}>
            어느 팀으로 들어갈까요?
          </div>
        </div>

        {/* Team cards */}
        <div style={{ padding: '0 20px' }}>
          {MFC_TEAMS.map((t, i) => (
            <button key={t.name} onClick={() => onSelectTeam && onSelectTeam(t)}
              style={{
                width: '100%', textAlign: 'left',
                background: t.current ? '#000' : '#fff',
                color: t.current ? '#fff' : '#000',
                border: t.current ? 'none' : '1px solid rgba(0,0,0,0.08)',
                borderRadius: 16, padding: '18px 20px',
                marginBottom: 10, cursor: 'pointer',
                transition: 'transform .08s, background .15s',
                display: 'block',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TeamDot color={t.color} size={14} />
                  <span className="t-h3" style={{ color: 'inherit' }}>{t.name}</span>
                </div>
                {t.current && (
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 0.8,
                    padding: '4px 8px', borderRadius: 50,
                    background: 'rgba(255,255,255,0.18)', color: '#fff',
                  }}>CURRENT</span>
                )}
              </div>
              <div style={{
                display: 'flex', gap: 8, marginTop: 14,
                opacity: t.current ? 0.7 : 0.55,
              }}>
                {t.sports.map(s => (
                  <span key={s} style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 0.6,
                    padding: '3px 10px',
                    border: `1.2px ${t.current ? 'solid' : 'dashed'} ${t.current ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}`,
                    borderRadius: 50, textTransform: 'uppercase',
                  }}>{s === '풋살' ? 'FUTSAL' : 'SOCCER'}</span>
                ))}
                <span style={{
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 0.6,
                  opacity: 0.8,
                  padding: '3px 0', textTransform: 'uppercase',
                }}>· {t.role === '관리자' ? 'ADMIN' : 'MEMBER'}</span>
              </div>
            </button>
          ))}

          {/* Add team — dashed */}
          <button style={{
            width: '100%', background: 'transparent',
            border: '1.5px dashed rgba(0,0,0,0.35)', borderRadius: 16,
            padding: '22px', cursor: 'pointer', marginBottom: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Icon name="plus" size={18} />
            <span className="t-body-em">팀 추가하기</span>
          </button>
        </div>

        {/* Recent activity teaser */}
        <div style={{ padding: '24px 0 100px' }}>
          <SectionLabel right="THIS WEEK">RECENT</SectionLabel>
          <div style={{ padding: '0 20px' }}>
            <div className="card-flat" style={{ padding: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="t-mono" style={{ fontSize: 10, opacity: 0.5 }}>TUE · 25 OCT · 19:00</span>
                <span className="t-mono" style={{ fontSize: 10, opacity: 0.5 }}>FINAL</span>
              </div>
              <MatchScore home="연두팀" away="검정팀" homeScore={3} awayScore={1}
                homeColor="#84cc16" awayColor="#1e293b" compact />
              <hr className="dashed-rule" style={{ margin: '14px 0', borderTopWidth: 1, opacity: 0.35 }} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span className="t-small" style={{ opacity: 0.6 }}>⚽ 손흥민 2 · 이강인 1</span>
                <span className="t-small" style={{ opacity: 0.6 }}>· MVP 김민재</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <TabBar active="home" onChange={onTab} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GoalModal — shown when user taps the ball button next to a player.
// Full-viewport overlay. Dashed focus on action buttons. The three
// actions (assist / no-assist / owngoal) are big pill zones.
// ─────────────────────────────────────────────────────────────
function GoalModal({ open, scorer, teammates, onSelect, onClose, onNoAssist, onOwnGoal }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', width: '100%',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '20px 22px 28px',
        maxHeight: '82%', overflowY: 'auto',
      }}>
        <div style={{ width: 44, height: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 2, margin: '0 auto 18px' }} />
        <div className="t-mono" style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>GOAL · ASSIST?</div>
        <div className="t-h1" style={{ marginBottom: 20 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 10, background: 'var(--data-green)', marginRight: 10 }} />
          {scorer?.player} 득점
        </div>

        {/* Teammate list */}
        <div className="t-mono" style={{ fontSize: 10, opacity: 0.5, marginBottom: 8 }}>ASSIST FROM</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {teammates.map(p => (
            <button key={p} onClick={() => onSelect && onSelect(p)}
              style={{
                padding: '14px 12px', borderRadius: 50,
                background: 'rgba(0,0,0,0.05)', border: 'none',
                fontSize: 15, fontWeight: 480, cursor: 'pointer',
                letterSpacing: -0.14,
                transition: 'background .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#000'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              onFocus={e => e.currentTarget.style.background = '#000'}
              onBlur={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
            >
              {p}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onNoAssist} className="btn btn-glass"
            style={{ flex: 1, padding: '14px 18px', fontSize: 14 }}>
            어시 없음
          </button>
          <button onClick={onOwnGoal}
            style={{
              flex: 1, padding: '14px 18px', borderRadius: 50,
              border: '1.5px dashed var(--data-red)',
              background: 'transparent', color: 'var(--data-red)',
              fontWeight: 540, fontSize: 14, cursor: 'pointer',
            }}>
            자책골
          </button>
        </div>
        <button onClick={onClose} className="btn btn-ghost"
          style={{ width: '100%', marginTop: 10, padding: '12px', fontSize: 14, opacity: 0.6 }}>
          취소
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RecordScreen — the heart of the app. Live match capture.
// Scoreboard on top. Two columns of player pills, each with a
// ball icon button on the right to record a goal. GK indicator
// is the mono "GK" label; active GK = solid black.
// ─────────────────────────────────────────────────────────────
function RecordScreen({ onTab }) {
  const [homeScore, setHomeScore] = React.useState(3);
  const [awayScore, setAwayScore] = React.useState(1);
  const [homeGk, setHomeGk] = React.useState('김민재');
  const [awayGk, setAwayGk] = React.useState('황의조');
  const [events, setEvents] = React.useState(MFC_EVENTS_SEED);
  const [pending, setPending] = React.useState(null); // { player, isHome }
  const [showVoiceHint, setShowVoiceHint] = React.useState(false);

  const recordGoal = (player, isHome, assist) => {
    setEvents(e => [...e, {
      id: Date.now(), type: 'goal', player, assist,
      team: isHome ? '연두팀' : '검정팀',
      color: isHome ? '#84cc16' : '#1e293b', min: `${Math.floor(e.length * 6 + 4)}'`
    }]);
    if (isHome) setHomeScore(s => s + 1); else setAwayScore(s => s + 1);
    setPending(null);
  };

  const recordOwnGoal = (player, isHome) => {
    setEvents(e => [...e, {
      id: Date.now(), type: 'owngoal', player, assist: null,
      team: isHome ? '검정팀' : '연두팀',
      color: isHome ? '#1e293b' : '#84cc16',
      concedingGk: isHome ? homeGk : awayGk,
      min: `${Math.floor(e.length * 6 + 4)}'`,
    }]);
    // scoring team is the OPPOSITE of the player's team
    if (isHome) setAwayScore(s => s + 1); else setHomeScore(s => s + 1);
    setPending(null);
  };

  const deleteEvent = (id) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    setEvents(events.filter(e => e.id !== id));
    // recompute scores naively
    if (ev.color === '#84cc16') setHomeScore(s => Math.max(0, s - 1));
    else setAwayScore(s => Math.max(0, s - 1));
  };

  const PlayerRow = ({ name, isHome, isMerc }) => {
    const isGk = (isHome ? homeGk : awayGk) === name;
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        {/* GK toggle */}
        <button onClick={() => isHome ? setHomeGk(isGk ? null : name) : setAwayGk(isGk ? null : name)}
          style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 50,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
            background: isGk ? '#000' : 'transparent',
            color: isGk ? '#fff' : 'rgba(0,0,0,0.4)',
            border: isGk ? 'none' : '1.2px dashed rgba(0,0,0,0.2)',
            cursor: 'pointer',
          }}>GK</button>

        {/* Name */}
        <div style={{
          flex: 1, minWidth: 0, padding: '9px 12px',
          background: 'rgba(0,0,0,0.04)', borderRadius: 50,
          fontSize: 14, fontWeight: 480,
          display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
        }}>
          {isMerc && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 0.5, color: 'var(--data-orange)' }}>MERC</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        </div>

        {/* Goal action */}
        <button onClick={() => {
          if (!homeGk || !awayGk) return alert('양팀 GK를 먼저 지정하세요');
          setPending({ player: name, isHome });
        }}
          style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 50,
            background: '#000', color: '#fff', border: 'none',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Icon name="ball" size={16} stroke={1.6} />
        </button>
      </div>
    );
  };

  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column' }}>
      <StatusBar />

      {/* Header */}
      <div style={{ padding: '10px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconBtn icon="chevL" />
        <div style={{ textAlign: 'center' }}>
          <div className="t-mono" style={{ fontSize: 10, opacity: 0.5 }}>COURT A · ROUND 3</div>
          <div className="t-label" style={{ fontSize: 13, marginTop: 2 }}>LIVE · 23:14</div>
        </div>
        <IconBtn icon="share" />
      </div>

      {/* Scoreboard */}
      <div style={{ padding: '8px 20px 14px' }}>
        <MatchScore home="연두팀" away="검정팀" homeScore={homeScore} awayScore={awayScore}
          homeColor="#84cc16" awayColor="#1e293b" />
      </div>
      <div style={{ padding: '0 20px 12px' }}>
        <hr className="dashed-rule" style={{ borderTopWidth: 1.5, opacity: 0.5 }} />
      </div>

      {/* Lineups */}
      <div className="phone-scroll" style={{ position: 'static', flex: 1, overflowY: 'auto', padding: '4px 20px 16px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="t-mono" style={{ fontSize: 10, opacity: 0.55, textAlign: 'center', marginBottom: 8 }}>
              연두 · HOME
            </div>
            {MFC_PLAYERS_HOME.map(p => <PlayerRow key={p} name={p} isHome />)}
            <button style={{
              width: '100%', background: 'transparent',
              border: '1.5px dashed rgba(0,0,0,0.28)',
              borderRadius: 50, padding: '9px 10px',
              fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 0.6,
              cursor: 'pointer', color: 'var(--data-orange)',
            }}>+ MERC</button>
          </div>
          <div style={{ flex: 1 }}>
            <div className="t-mono" style={{ fontSize: 10, opacity: 0.55, textAlign: 'center', marginBottom: 8 }}>
              검정 · AWAY
            </div>
            {MFC_PLAYERS_AWAY.map(p => <PlayerRow key={p} name={p} isHome={false} />)}
            <button style={{
              width: '100%', background: 'transparent',
              border: '1.5px dashed rgba(0,0,0,0.28)',
              borderRadius: 50, padding: '9px 10px',
              fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 0.6,
              cursor: 'pointer', color: 'var(--data-orange)',
            }}>+ MERC</button>
          </div>
        </div>

        {/* Voice record */}
        <button
          onMouseDown={() => setShowVoiceHint(true)}
          onMouseUp={() => setShowVoiceHint(false)}
          onTouchStart={() => setShowVoiceHint(true)}
          onTouchEnd={() => setShowVoiceHint(false)}
          style={{
            marginTop: 16, width: '100%',
            padding: '14px 20px', borderRadius: 50,
            border: showVoiceHint ? '1.5px dashed #000' : 'none',
            background: showVoiceHint ? 'transparent' : '#000',
            color: showVoiceHint ? '#000' : '#fff',
            fontWeight: 540, fontSize: 14, letterSpacing: -0.14,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <Icon name="mic" size={18} />
          {showVoiceHint ? '듣는 중 — "손흥민 골 이강인 어시"' : '꾹 눌러서 음성으로 기록'}
        </button>

        {/* Event log */}
        <div style={{ marginTop: 22 }}>
          <SectionLabel right={`${events.length} 건`} style={{ padding: 0, marginBottom: 10 }}>경기 기록 · LOG</SectionLabel>
          {events.length === 0 && (
            <div className="t-small" style={{
              textAlign: 'center', opacity: 0.45,
              padding: 24, border: '1.2px dashed rgba(0,0,0,0.18)', borderRadius: 8,
            }}>
              아직 기록이 없어요. 골 버튼을 눌러 첫 이벤트를 남기세요.
            </div>
          )}
          {events.map(e => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 12, marginBottom: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: 8,
                background: e.type === 'owngoal' ? 'var(--data-red)' : 'var(--data-green)',
                flexShrink: 0,
              }} />
              <span className="t-mono" style={{ fontSize: 10, opacity: 0.45, width: 36 }}>{e.min}</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <span style={{ fontWeight: 540 }}>{e.player}</span>
                <span style={{ opacity: 0.5, fontSize: 12, fontWeight: 340 }}>
                  {e.type === 'owngoal'
                    ? ' · 자책골'
                    : e.assist ? ` · 어시 ${e.assist}` : ' · 단독골'}
                </span>
              </div>
              <TeamDot color={e.color} size={8} />
              <button onClick={() => deleteEvent(e.id)}
                style={{
                  width: 28, height: 28, borderRadius: 50, background: 'transparent',
                  border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.4)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Finish CTA */}
        <button className="btn btn-solid" style={{
          width: '100%', marginTop: 20, padding: '16px 24px', fontSize: 15,
        }}>
          라운드 종료
          <Icon name="arrowR" size={16} />
        </button>
      </div>

      <GoalModal open={!!pending}
        scorer={pending}
        teammates={(pending?.isHome ? MFC_PLAYERS_HOME : MFC_PLAYERS_AWAY).filter(p => p !== pending?.player)}
        onClose={() => setPending(null)}
        onSelect={p => recordGoal(pending.player, pending.isHome, p)}
        onNoAssist={() => recordGoal(pending.player, pending.isHome, null)}
        onOwnGoal={() => recordOwnGoal(pending.player, pending.isHome)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StatsScreen — leaderboard + rank chart.
// Ranks use big numerals (72/54 variable weight); name column in
// t-body-em; stat column in mono.
// ─────────────────────────────────────────────────────────────
function StatsScreen({ onTab }) {
  const [tab, setTab] = React.useState('goals');
  const tabs = [
    { id: 'goals',   label: '골',     key: 'goals' },
    { id: 'assists', label: '어시',   key: 'assists' },
    { id: 'mvp',     label: 'MVP',    key: 'mvp' },
    { id: 'rate',    label: '평점',   key: 'rate' },
  ];
  const key = tabs.find(t => t.id === tab).key;
  const sorted = [...MFC_PLAYER_STATS].sort((a, b) => b[key] - a[key]);
  const max = sorted[0][key];

  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column', background: '#fafaf8' }}>
      <StatusBar />
      <div className="phone-scroll" style={{ position: 'static', flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="t-mono" style={{ fontSize: 11, opacity: 0.5 }}>RANKINGS · OCT 2026</div>
            <IconBtn icon="filter" size={36} />
          </div>
          <div style={{ marginTop: 20, fontSize: 40, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.05 }}>
            15 매치.<br />
            <span style={{ fontStyle: 'italic', fontWeight: 450 }}>한 명</span>이 앞섰어요.
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 16px 20px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map(t => (
            <Pill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </Pill>
          ))}
        </div>

        {/* Top 3 — monumental */}
        <div style={{ padding: '0 20px 24px' }}>
          {sorted.slice(0, 3).map((p, i) => (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'baseline', gap: 14,
              padding: '18px 0',
              borderBottom: '1px dashed rgba(0,0,0,0.12)',
            }}>
              <div style={{
                width: 40, textAlign: 'right',
                fontSize: 36, fontWeight: 400, letterSpacing: -1.4, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: i === 0 ? '#000' : 'rgba(0,0,0,0.35)',
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div className="t-h2" style={{ fontSize: 22 }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4, opacity: 0.5 }}>
                  <span className="t-mono" style={{ fontSize: 9 }}>{p.plays} PLAYED</span>
                  <span className="t-mono" style={{ fontSize: 9 }}>{p.wins}W</span>
                </div>
              </div>
              <div style={{
                fontSize: 32, fontWeight: 480, letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {p[key]}<span className="t-mono" style={{ fontSize: 10, opacity: 0.45, marginLeft: 4 }}>
                  {key === 'rate' ? 'P/G' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Distribution chart — dashed baseline, filled bars in black */}
        <div style={{ padding: '8px 20px 20px' }}>
          <SectionLabel style={{ padding: 0, marginBottom: 12 }}>DISTRIBUTION</SectionLabel>
          <div style={{ position: 'relative', paddingLeft: 48 }}>
            {sorted.map((p, i) => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 8, position: 'relative',
              }}>
                <span className="t-mono" style={{
                  position: 'absolute', left: -48, width: 40,
                  fontSize: 10, opacity: 0.5, textAlign: 'right',
                }}>{String(i + 1).padStart(2, '0')}</span>
                <span className="t-body-em" style={{ width: 62, fontSize: 13, flexShrink: 0 }}>{p.name}</span>
                <div style={{ flex: 1, height: 12, position: 'relative' }}>
                  <div style={{
                    height: 2, width: '100%', background: 'rgba(0,0,0,0.12)',
                    position: 'absolute', top: 5,
                    backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.22) 50%, transparent 50%)',
                    backgroundSize: '4px 2px', backgroundRepeat: 'repeat-x',
                  }} />
                  <div style={{
                    height: 12, background: '#000',
                    width: `${(p[key] / max) * 100}%`,
                    borderRadius: 2,
                  }} />
                </div>
                <span className="t-mono" style={{ fontSize: 11, width: 30, textAlign: 'right' }}>{p[key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Team standing */}
        <div style={{ padding: '12px 20px 100px' }}>
          <SectionLabel style={{ padding: 0, marginBottom: 12 }}>TEAM STANDING</SectionLabel>
          <div className="card-flat" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { t: '연두팀', c: '#84cc16', w: 8, l: 3, d: 1, pts: 25 },
              { t: '검정팀', c: '#1e293b', w: 6, l: 4, d: 2, pts: 20 },
              { t: '주황팀', c: '#f97316', w: 5, l: 5, d: 2, pts: 17 },
              { t: '하늘팀', c: '#38bdf8', w: 3, l: 6, d: 3, pts: 12 },
            ].map((r, i) => (
              <div key={r.t} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                borderBottom: i === 3 ? 'none' : '1px solid rgba(0,0,0,0.06)',
              }}>
                <span className="t-mono" style={{ width: 18, fontSize: 11, opacity: 0.5 }}>{i + 1}</span>
                <TeamDot color={r.c} size={10} />
                <span className="t-body-em" style={{ flex: 1, fontSize: 14 }}>{r.t}</span>
                <span className="t-mono" style={{ fontSize: 10, opacity: 0.55 }}>{r.w}W {r.l}L {r.d}D</span>
                <span style={{ fontWeight: 540, fontSize: 16, width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <TabBar active="stats" onChange={onTab} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MeScreen — personal player card with spark-style recent form.
// ─────────────────────────────────────────────────────────────
function MeScreen({ onTab }) {
  const form = [
    { r: 'W', score: '4-1' }, { r: 'L', score: '1-3' }, { r: 'W', score: '2-0' },
    { r: 'D', score: '2-2' }, { r: 'W', score: '3-1' }, { r: 'W', score: '5-2' },
    { r: 'L', score: '0-2' },
  ];
  return (
    <div className="phone" style={{ display: 'flex', flexDirection: 'column', background: '#fafaf8' }}>
      <StatusBar />
      <div className="phone-scroll" style={{ position: 'static', flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 22px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="t-mono" style={{ fontSize: 11, opacity: 0.5 }}>PLAYER CARD</div>
            <IconBtn icon="settings" size={36} />
          </div>
        </div>

        {/* Hero card */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{
            background: '#000', color: '#fff', borderRadius: 20,
            padding: '28px 24px 24px', position: 'relative', overflow: 'hidden',
          }}>
            {/* decorative dashed frame corner */}
            <div style={{
              position: 'absolute', top: 14, right: 14,
              width: 80, height: 80, border: '1.5px dashed rgba(255,255,255,0.35)',
              borderRadius: '50%',
            }} />
            <div className="t-mono" style={{ fontSize: 10, opacity: 0.55, letterSpacing: 0.6 }}>#09 · FORWARD</div>
            <div style={{ fontSize: 44, fontWeight: 400, letterSpacing: -1.3, lineHeight: 1, marginTop: 8 }}>
              손흥민
            </div>
            <div className="t-body" style={{ opacity: 0.65, marginTop: 6 }}>마스터FC · 2026 시즌</div>
            <hr style={{ border: 'none', borderTop: '1px dashed rgba(255,255,255,0.22)', margin: '20px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {[
                ['GOALS', 14],
                ['ASSISTS', 8],
                ['MVP', 3],
                ['RATE', '2.1'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="t-mono" style={{ fontSize: 9, opacity: 0.55 }}>{k}</div>
                  <div style={{ fontSize: 30, fontWeight: 480, letterSpacing: -0.9, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent form */}
        <div style={{ padding: '8px 20px 16px' }}>
          <SectionLabel style={{ padding: 0, marginBottom: 10 }} right="LAST 7">RECENT FORM</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {form.map((f, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center',
                padding: '14px 0',
                background: f.r === 'W' ? '#000' : '#fff',
                color: f.r === 'W' ? '#fff' : '#000',
                border: f.r === 'L' ? '1.5px dashed var(--data-red)' : '1px solid rgba(0,0,0,0.08)',
                borderRadius: 8,
              }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>{f.r}</div>
                <div className="t-mono" style={{ fontSize: 9, opacity: 0.5, marginTop: 2 }}>{f.score}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div style={{ padding: '16px 20px 100px' }}>
          <SectionLabel style={{ padding: 0, marginBottom: 10 }}>ACHIEVEMENTS</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['HAT-TRICK', '5-GAME STREAK', 'CLEAN SHEET', 'MVP WEEK', 'ASSIST KING'].map(a => (
              <span key={a} style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 0.6,
                padding: '7px 13px', borderRadius: 50,
                border: '1.2px dashed rgba(0,0,0,0.25)',
              }}>{a}</span>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <button className="btn btn-glass" style={{ width: '100%', padding: '14px', fontSize: 14 }}>
              시즌 리포트 공유하기
              <Icon name="share" size={16} />
            </button>
          </div>
        </div>
      </div>
      <TabBar active="me" onChange={onTab} />
    </div>
  );
}

Object.assign(window, {
  LoginScreen, HomeScreen, RecordScreen, StatsScreen, MeScreen, GoalModal,
});

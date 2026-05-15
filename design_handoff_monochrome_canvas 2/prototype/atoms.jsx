// Master FC — Atoms & primitives for the Figma-styled futsal app.
// Exports to window: Icon, TeamDot, Pill, IconBtn, StatusBar, TabBar,
// SectionLabel, MatchScore, PlayerChip, DashedDivider.

const MFC_FG = '#000';
const MFC_BG = '#fff';

// ─────────────────────────────────────────────────────────────
// Icon — hand-drawn 1.5px stroke line icons, monochrome.
// currentColor so they inherit from chrome.
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 20, stroke = 1.6, style = {}, ...rest }) {
  const paths = {
    menu:     <><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></>,
    close:    <><path d="M5 5l14 14"/><path d="M19 5L5 19"/></>,
    chevL:    <path d="M15 18l-6-6 6-6"/>,
    chevR:    <path d="M9 6l6 6-6 6"/>,
    chevD:    <path d="M6 9l6 6 6-6"/>,
    plus:     <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    check:    <path d="M4 12l5 5L20 6"/>,
    ball:     <><circle cx="12" cy="12" r="9"/><path d="M12 3l3 6-3 3-3-3 3-6zM3 12h6M15 12h6M6 18l3-3m6 3l-3-3"/></>,
    whistle:  <><path d="M3 14a5 5 0 109-3l7-2v-2l-7 2a5 5 0 00-9 5z"/><circle cx="8" cy="14" r="1.2" fill="currentColor" stroke="none"/></>,
    home:     <><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></>,
    list:     <><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none"/></>,
    chart:    <><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/></>,
    user:     <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.2-1.6l2-1.5-2-3.5-2.4.8a7 7 0 00-2.7-1.6L13 2h-4l-.7 2.6a7 7 0 00-2.7 1.6L3.2 5.4l-2 3.5 2 1.5A7 7 0 003 12c0 .6.1 1.1.2 1.6l-2 1.5 2 3.5 2.4-.8a7 7 0 002.7 1.6L9 22h4l.7-2.6a7 7 0 002.7-1.6l2.4.8 2-3.5-2-1.5c.1-.5.2-1 .2-1.6z"/></>,
    mic:      <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></>,
    trophy:   <><path d="M8 3h8v5a4 4 0 01-8 0V3z"/><path d="M16 5h4v2a3 3 0 01-3 3M8 5H4v2a3 3 0 003 3M9 14h6v3H9z"/><path d="M7 21h10"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    moon:     <path d="M20 15A8 8 0 119 4a6 6 0 0011 11z"/>,
    sun:      <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    share:    <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/></>,
    arrowR:   <><path d="M4 12h16"/><path d="M14 5l7 7-7 7"/></>,
    filter:   <><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/></>,
    undo:     <><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></>,
    trash:    <><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></>,
    gk:       <><path d="M12 4a4 4 0 014 4v2a4 4 0 11-8 0V8a4 4 0 014-4z"/><path d="M5 20c.5-3.5 3-6 7-6s6.5 2.5 7 6"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} {...rest}>
      {paths[name] || paths.close}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// TeamDot — the ONLY spot color in chrome. Small circular swatch.
// ─────────────────────────────────────────────────────────────
function TeamDot({ color, size = 10 }) {
  return <span className="team-dot" style={{ background: color, width: size, height: size }} />;
}

// ─────────────────────────────────────────────────────────────
// Pill — label chip with optional dot + optional active state.
// Active = black solid. Inactive = transparent with dashed border.
// ─────────────────────────────────────────────────────────────
function Pill({ children, active, dashed, color, onClick, style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 50,
    fontSize: 13, fontWeight: 480, letterSpacing: -0.1,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all .14s',
    border: 'none', lineHeight: 1,
  };
  const variant = active
    ? { background: '#000', color: '#fff' }
    : dashed
      ? { background: 'transparent', color: '#000', border: '1.5px dashed rgba(0,0,0,.55)' }
      : { background: 'rgba(0,0,0,0.06)', color: '#000' };
  return (
    <button onClick={onClick} style={{ ...base, ...variant, ...style }}>
      {color && <TeamDot color={color} size={8} />}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// IconBtn — circular 40×40 monochrome button.
// ─────────────────────────────────────────────────────────────
function IconBtn({ icon, onClick, variant = 'ghost', size = 40, style = {}, title }) {
  const bg = variant === 'solid' ? '#000' : variant === 'glass' ? 'rgba(0,0,0,.06)' : 'transparent';
  const color = variant === 'solid' ? '#fff' : '#000';
  return (
    <button onClick={onClick} title={title}
      style={{
        width: size, height: size, borderRadius: '50%', border: 'none',
        background: bg, color, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .14s', ...style,
      }}
      onMouseEnter={e => { if (variant === 'ghost') e.currentTarget.style.background = 'rgba(0,0,0,.06)'; }}
      onMouseLeave={e => { if (variant === 'ghost') e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// StatusBar — iOS-style status bar, monochrome.
// ─────────────────────────────────────────────────────────────
function StatusBar({ time = '9:41', dark }) {
  const fg = dark ? '#fff' : '#000';
  return (
    <div className="status-bar" style={{ color: fg }}>
      <span>{time}</span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {/* signal */}
        <svg width="17" height="11" viewBox="0 0 17 11" fill={fg}>
          <rect x="0"  y="7"  width="3" height="4" rx="0.5"/>
          <rect x="4.5" y="5"  width="3" height="6" rx="0.5"/>
          <rect x="9"  y="3"  width="3" height="8" rx="0.5"/>
          <rect x="13.5" y="0" width="3" height="11" rx="0.5"/>
        </svg>
        {/* wifi */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke={fg} strokeWidth="1.3">
          <path d="M1 4.5a10 10 0 0113 0"/><path d="M3.5 6.8a6.5 6.5 0 018 0"/><path d="M6 9.1a3 3 0 013 0"/>
        </svg>
        {/* battery */}
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke={fg} strokeOpacity="0.4" fill="none"/>
          <rect x="23" y="4" width="1.5" height="4" rx="0.5" fill={fg} fillOpacity="0.4"/>
          <rect x="2" y="2" width="19" height="8" rx="1.8" fill={fg}/>
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TabBar — bottom navigation, 4 tabs, dashed underline for active.
// ─────────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'home',    label: 'HOME',    icon: 'home' },
    { id: 'record',  label: 'RECORD',  icon: 'whistle' },
    { id: 'stats',   label: 'STATS',   icon: 'chart' },
    { id: 'me',      label: 'ME',      icon: 'user' },
  ];
  return (
    <div className="tab-bar">
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange && onChange(t.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 4, border: 'none', background: 'transparent', cursor: 'pointer',
              paddingTop: 6, opacity: on ? 1 : 0.42, transition: 'opacity .12s',
            }}>
            <Icon name={t.icon} size={22} stroke={on ? 1.8 : 1.5} />
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 0.8,
              fontWeight: 500, textTransform: 'uppercase',
              borderBottom: on ? '1.5px dashed #000' : '1.5px dashed transparent',
              paddingBottom: 2,
            }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SectionLabel — mono uppercase label with optional right meta.
// ─────────────────────────────────────────────────────────────
function SectionLabel({ children, right, style = {} }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '0 20px', marginBottom: 12, ...style,
    }}>
      <span className="t-mono" style={{ fontSize: 11, opacity: 0.55 }}>{children}</span>
      {right && <span className="t-mono" style={{ fontSize: 10, opacity: 0.4 }}>{right}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DashedDivider — thin dashed rule used as section separator.
// ─────────────────────────────────────────────────────────────
function DashedDivider({ style = {} }) {
  return <div style={{ height: 0, borderTop: '1px dashed rgba(0,0,0,0.18)', margin: '0 20px', ...style }} />;
}

// ─────────────────────────────────────────────────────────────
// MatchScore — large monumental score display (black digits).
// Winning side stays black bold; losing side goes to 45% opacity.
// ─────────────────────────────────────────────────────────────
function MatchScore({ home, away, homeScore, awayScore, homeColor, awayColor, compact }) {
  const size = compact ? 42 : 64;
  const homeLost = homeScore < awayScore;
  const awayLost = awayScore < homeScore;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 16 : 24 }}>
      <div style={{ flex: 1, textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
          <TeamDot color={homeColor} size={10} />
          <span className="t-label" style={{ fontSize: 13 }}>{home}</span>
        </div>
        <div style={{
          fontFamily: "'Inter',sans-serif", fontSize: size, fontWeight: 480, lineHeight: 1,
          letterSpacing: compact ? -1.4 : -2.56, fontVariantNumeric: 'tabular-nums',
          color: homeLost ? 'rgba(0,0,0,0.38)' : '#000',
        }}>{homeScore}</div>
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono',monospace", fontSize: compact ? 13 : 16,
        fontWeight: 400, letterSpacing: 0.8, color: 'rgba(0,0,0,0.38)',
        textTransform: 'uppercase', paddingTop: compact ? 22 : 32,
      }}>VS</div>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <TeamDot color={awayColor} size={10} />
          <span className="t-label" style={{ fontSize: 13 }}>{away}</span>
        </div>
        <div style={{
          fontFamily: "'Inter',sans-serif", fontSize: size, fontWeight: 480, lineHeight: 1,
          letterSpacing: compact ? -1.4 : -2.56, fontVariantNumeric: 'tabular-nums',
          color: awayLost ? 'rgba(0,0,0,0.38)' : '#000',
        }}>{awayScore}</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Icon, TeamDot, Pill, IconBtn, StatusBar, TabBar, SectionLabel,
  DashedDivider, MatchScore,
});

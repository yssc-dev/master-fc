import { useState, useEffect } from 'react';
import AuthUtil from './services/authUtil';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import LoginScreen from './components/auth/LoginScreen';
import HomeScreen from './components/home/HomeScreen';
import TeamDashboard from './components/dashboard/TeamDashboard';
import HistoryView from './components/history/HistoryView';
import SettingsScreen from './components/common/SettingsScreen';
import { loadSettingsFromFirebase } from './config/settings';
import App from './App';

export default function Root() {
  // AuthUtil.getStored()를 한 번만 호출하여 초기 상태 설정
  const [initialStored] = useState(() => AuthUtil.getStored());
  const [authed, setAuthed] = useState(() => !!initialStored);
  const [authUser, setAuthUser] = useState(() =>
    initialStored ? { name: initialStored.name, phone4: initialStored.phone4 } : null
  );
  const [allTeams, setAllTeams] = useState([]);
  const [teamGroups, setTeamGroups] = useState({});
  const [selectedTeamName, setSelectedTeamName] = useState(() => initialStored?.team || null);
  const [selectedTeamEntries, setSelectedTeamEntries] = useState(() =>
    initialStored?.team ? [{ mode: initialStored.mode || "풋살", role: initialStored.role || "멤버" }] : []
  );
  const [teamContext, setTeamContext] = useState(() =>
    initialStored?.team ? { team: initialStored.team, mode: initialStored.mode || "풋살", role: initialStored.role || "멤버" } : null
  );
  const [screen, setScreen] = useState(() => initialStored?.team ? "dashboard" : "login");
  // 다중 경기 지원: pendingGames = [{gameId, state, savedAt}, ...]
  const [pendingGames, setPendingGames] = useState([]);
  const [checkingPending, setCheckingPending] = useState(false);
  const [isNewGame, setIsNewGame] = useState(false);
  const [gameMode, setGameMode] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);

  const groupTeams = (teams) => {
    const groups = {};
    teams.forEach(t => {
      if (!groups[t.team]) groups[t.team] = [];
      groups[t.team].push({ mode: t.mode, role: t.role });
    });
    return groups;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만 실행 (저장된 팀이 있으면 pending 체크)
  useEffect(() => {
    if (screen === "dashboard" && selectedTeamName) {
      checkPendingGames(selectedTeamName);
      loadSettingsFromFirebase(selectedTeamName);
    }
  }, []);

  const checkPendingGames = (teamName) => {
    setCheckingPending(true);
    setPendingGames([]);

    FirebaseSync.loadAllActive(teamName).then(fbGames => {
      if (fbGames.length > 0) {
        const validGames = fbGames.filter(g => g.state && g.state.phase !== "setup");
        if (validGames.length > 0) {
          setPendingGames(validGames);
          setCheckingPending(false);
          return;
        }
      }
      // Firebase에 없으면 Apps Script에서 시도
      return AppSync.loadAllStates().then(appGames => {
        const validGames = appGames.filter(g => g.state && g.state.phase !== "setup");
        setPendingGames(validGames);
      });
    }).catch(() => { }).finally(() => setCheckingPending(false));
  };

  const handleLogin = (user, teams) => {
    setAuthUser(user);
    setAllTeams(teams);
    setAuthed(true);
    const groups = groupTeams(teams);
    setTeamGroups(groups);
    const teamNames = Object.keys(groups);
    if (teamNames.length === 1) {
      const tName = teamNames[0];
      const entries = groups[tName];
      selectTeam(tName, entries, user);
    } else {
      setScreen("home");
    }
  };

  const selectTeam = (teamName, entries, user) => {
    setSelectedTeamName(teamName);
    setSelectedTeamEntries(entries);
    const first = entries[0] || { mode: "풋살", role: "멤버" };
    const tc = { team: teamName, mode: first.mode, role: first.role };
    setTeamContext(tc);
    const u = user || authUser;
    AuthUtil.save(u.name, u.phone4, teamName, first.mode, first.role);
    setScreen("dashboard");
    checkPendingGames(teamName);
    loadSettingsFromFirebase(teamName);
  };

  const handleLogout = () => {
    AuthUtil.clear();
    setAuthed(false);
    setAuthUser(null);
    setAllTeams([]);
    setTeamGroups({});
    setSelectedTeamName(null);
    setSelectedTeamEntries([]);
    setTeamContext(null);
    setScreen("login");
    setPendingGames([]);
    setGameMode(null);
    setActiveGameId(null);
  };

  const handleStartNew = async (mode) => {
    // 진행중 경기가 있으면 알림
    if (pendingGames.length > 0) {
      const creators = pendingGames.map(g => g.state?.gameCreator || g.state?.lastEditor || "알 수 없음");
      const msg = creators.map((c, i) => `${i + 1}. ${c}님의 경기`).join("\n");
      if (!confirm(`이미 진행중인 경기가 있습니다:\n\n${msg}\n\n그래도 새 경기를 추가하시겠습니까?`)) return;
    }

    const newGameId = `g_${Date.now()}`;
    setIsNewGame(true);
    setGameMode(mode);
    setActiveGameId(newGameId);
    setScreen("app");
  };

  const handleContinue = (gameId) => {
    setIsNewGame(false);
    setGameMode(null);
    setActiveGameId(gameId);
    setScreen("app");
  };

  const handleSwitchTeam = () => {
    if (allTeams.length === 0) {
      handleLogout();
      return;
    }
    const groups = groupTeams(allTeams);
    setTeamGroups(groups);
    setScreen("home");
    setPendingGames([]);
  };

  if (screen === "login" || !authed) return <LoginScreen onLogin={handleLogin} />;

  if (screen === "home") {
    return <HomeScreen authUser={authUser} teamGroups={teamGroups} selectedTeamName={selectedTeamName} onSelectTeam={(name, entries) => selectTeam(name, entries)} onLogout={handleLogout} />;
  }

  if (screen === "dashboard") {
    return <TeamDashboard authUser={authUser} teamName={selectedTeamName} teamEntries={selectedTeamEntries}
      pendingGames={pendingGames} checkingPending={checkingPending}
      onStartGame={handleStartNew} onContinueGame={handleContinue}
      onViewHistory={() => setScreen("history")} onSettings={() => setScreen("settings")} onSwitchTeam={handleSwitchTeam} onLogout={handleLogout} />;
  }

  if (screen === "history") {
    return <HistoryView teamContext={teamContext} onBack={() => setScreen("dashboard")} />;
  }

  if (screen === "settings") {
    return <SettingsScreen teamName={selectedTeamName} onBack={() => setScreen("dashboard")} />;
  }

  return <App authUser={authUser} teamContext={teamContext} isNewGame={isNewGame} gameMode={gameMode} gameId={activeGameId}
    onLogout={handleLogout} onBackToMenu={() => { setIsNewGame(false); setGameMode(null); setActiveGameId(null); setScreen("dashboard"); if (selectedTeamName) checkPendingGames(selectedTeamName); else setPendingGames([]); }} />;
}

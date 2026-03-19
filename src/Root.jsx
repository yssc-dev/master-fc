import { useState, useEffect } from 'react';
import AuthUtil from './services/authUtil';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import LoginScreen from './components/auth/LoginScreen';
import HomeScreen from './components/home/HomeScreen';
import TeamDashboard from './components/dashboard/TeamDashboard';
import HistoryView from './components/history/HistoryView';
import App from './App';

export default function Root() {
  const [authed, setAuthed] = useState(() => !!AuthUtil.getStored());
  const [authUser, setAuthUser] = useState(() => {
    const stored = AuthUtil.getStored();
    return stored ? { name: stored.name, phone4: stored.phone4 } : null;
  });
  const [allTeams, setAllTeams] = useState([]);
  const [teamGroups, setTeamGroups] = useState({});
  const [selectedTeamName, setSelectedTeamName] = useState(() => {
    const stored = AuthUtil.getStored();
    return stored?.team || null;
  });
  const [selectedTeamEntries, setSelectedTeamEntries] = useState(() => {
    const stored = AuthUtil.getStored();
    return stored?.team ? [{ mode: stored.mode || "풋살", role: stored.role || "멤버" }] : [];
  });
  const [teamContext, setTeamContext] = useState(() => {
    const stored = AuthUtil.getStored();
    return stored?.team ? { team: stored.team, mode: stored.mode || "풋살", role: stored.role || "멤버" } : null;
  });

  const [screen, setScreen] = useState(() => {
    const stored = AuthUtil.getStored();
    return stored?.team ? "dashboard" : "login";
  });
  const [pendingRestore, setPendingRestore] = useState(null);
  const [checkingPending, setCheckingPending] = useState(false);
  const [isNewGame, setIsNewGame] = useState(false);
  const [gameMode, setGameMode] = useState(null); // "sheetSync" | "custom" | null (continue)

  const groupTeams = (teams) => {
    const groups = {};
    teams.forEach(t => {
      if (!groups[t.team]) groups[t.team] = [];
      groups[t.team].push({ mode: t.mode, role: t.role });
    });
    return groups;
  };

  useEffect(() => {
    if (screen === "dashboard" && selectedTeamName && !pendingRestore) {
      checkPendingGame(selectedTeamName);
    }
  }, []);

  const checkPendingGame = (teamName) => {
    setCheckingPending(true);
    setPendingRestore(null);
    FirebaseSync.loadState(teamName).then(fbSaved => {
      if (fbSaved && fbSaved.found && fbSaved.state && fbSaved.state.phase !== "setup") {
        setPendingRestore(fbSaved);
        setCheckingPending(false);
      } else {
        return AppSync.loadState().then(saved => {
          if (saved && saved.found && saved.state && saved.state.phase !== "setup") {
            setPendingRestore(saved);
          }
        });
      }
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
    checkPendingGame(teamName);
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
    setPendingRestore(null);
    setGameMode(null);
  };

  // gameMode: "sheetSync" | "custom"
  const handleStartNew = async (mode) => {
    if (pendingRestore) {
      if (teamContext?.role !== "관리자") {
        alert("진행중인 경기가 있습니다.\n관리자만 새 경기를 시작할 수 있습니다.");
        return;
      }
      const lastEditor = pendingRestore.state?.lastEditor || "";
      const editorInfo = lastEditor ? `${lastEditor}님이 기록 중인 경기입니다.\n` : "";
      if (!confirm(`${editorInfo}정말 새로 시작하시겠습니까?\n기존 진행중 경기가 초기화됩니다.`)) return;
      if (!confirm("되돌릴 수 없습니다. 정말 삭제하시겠습니까?")) return;
      // 해당 팀의 "진행중" 행만 삭제 (확정 기록/다른 팀 데이터는 보존)
      await FirebaseSync.clearState(teamContext?.team);
      await AppSync.clearState();
      setPendingRestore(null);
    }
    setIsNewGame(true);
    setGameMode(mode);
    setScreen("app");
  };

  const handleContinue = () => {
    setIsNewGame(false);
    setGameMode(null);
    setScreen("app");
  };

  const handleSwitchTeam = () => {
    const groups = groupTeams(allTeams);
    if (Object.keys(groups).length <= 1) {
      handleLogout();
    } else {
      setScreen("home");
      setPendingRestore(null);
    }
  };

  if (screen === "login" || !authed) return <LoginScreen onLogin={handleLogin} />;

  if (screen === "home") {
    return <HomeScreen authUser={authUser} teamGroups={teamGroups} onSelectTeam={(name, entries) => selectTeam(name, entries)} onLogout={handleLogout} />;
  }

  if (screen === "dashboard") {
    return <TeamDashboard authUser={authUser} teamName={selectedTeamName} teamEntries={selectedTeamEntries}
      hasPendingGame={!!pendingRestore} checkingPending={checkingPending}
      onStartGame={handleStartNew} onContinueGame={handleContinue}
      onViewHistory={() => setScreen("history")} onSwitchTeam={handleSwitchTeam} onLogout={handleLogout} />;
  }

  if (screen === "history") {
    return <HistoryView teamContext={teamContext} onBack={() => setScreen("dashboard")} />;
  }

  return <App authUser={authUser} teamContext={teamContext} isNewGame={isNewGame} gameMode={gameMode}
    onLogout={handleLogout} onBackToMenu={() => { setIsNewGame(false); setGameMode(null); setScreen("dashboard"); }} />;
}

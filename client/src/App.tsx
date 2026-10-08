import { useCallback, useState } from "react";
import type { Session } from "./matrix/api";
import { clearSession, loadSession, saveSession } from "./session";
import { ClientRoot } from "./ui/ClientRoot";
import { LoginScreen } from "./ui/LoginScreen";
import { useThemeEffect } from "./ui/theme";

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  useThemeEffect();

  const handleLogin = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  return <ClientRoot key={session.accessToken} session={session} onLogout={handleLogout} />;
}

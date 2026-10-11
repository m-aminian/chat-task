import { useCallback, useState } from "react";
import type { Session } from "./matrix/api";
import { clearSession, loadSession, saveSession } from "./session";
import { ClientRoot } from "./ui/ClientRoot";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { LoginScreen } from "./ui/LoginScreen";
import { useThemeEffect } from "./ui/theme";

const APP_FALLBACK = (
  <div className="empty">
    <p>Something went wrong.</p>
    <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
      Reload
    </button>
  </div>
);

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
  return (
    <ErrorBoundary fallback={APP_FALLBACK}>
      <ClientRoot key={session.accessToken} session={session} onLogout={handleLogout} />
    </ErrorBoundary>
  );
}

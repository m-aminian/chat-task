import { useState, type FormEvent } from "react";
import { login, MatrixApiError, type Session } from "../matrix/api";
import { DEFAULT_HOMESERVER } from "../session";

interface Props {
  onLogin: (session: Session) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [homeserver, setHomeserver] = useState(DEFAULT_HOMESERVER);
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(homeserver, username.trim(), password));
    } catch (err) {
      if (err instanceof MatrixApiError && err.errcode === "M_FORBIDDEN")
        setError("Wrong username or password.");
      else if (err instanceof TypeError)
        setError(`Could not reach ${homeserver}. Is the homeserver running?`);
      else setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        <label>
          Homeserver
          <input value={homeserver} onChange={(e) => setHomeserver(e.target.value)} type="url" required />
        </label>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

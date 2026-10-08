import { useEffect, useState } from "react";
import { createClient, exposeTimelines } from "../client";
import type { Session } from "../matrix/api";
import { ClientProvider } from "../store/react";
import { AppShell } from "./AppShell";
import { SessionContext } from "./session-context";

interface Props {
  session: Session;
  onLogout: () => void;
}

export function ClientRoot({ session, onLogout }: Props) {
  const [client] = useState(() => createClient(session));

  useEffect(() => {
    client.engine.onAuthError = onLogout;
    client.engine.start();
    const unexpose = exposeTimelines(client);
    return () => {
      client.engine.stop();
      client.engine.onAuthError = null;
      unexpose();
    };
  }, [client, onLogout]);

  return (
    <ClientProvider client={client}>
      <SessionContext.Provider value={{ session, logout: onLogout }}>
        <AppShell />
      </SessionContext.Provider>
    </ClientProvider>
  );
}

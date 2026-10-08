import { createContext, useContext } from "react";
import type { Session } from "../matrix/api";

export interface SessionContextValue {
  session: Session;
  logout: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <ClientRoot>");
  return value;
}

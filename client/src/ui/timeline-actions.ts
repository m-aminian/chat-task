import { createContext, useContext } from "react";
import type { EventId, TxnId } from "../matrix/ids";

export interface TimelineActions {
  reply(eventId: EventId): void;
  edit(eventId: EventId): void;
  jumpTo(eventId: EventId): void;
  react(eventId: EventId, key: string): void;
  redact(eventId: EventId): void;
  retry(txnId: TxnId): void;
  cancel(txnId: TxnId): void;
}

export const TimelineActionsContext = createContext<TimelineActions | null>(null);

export function useTimelineActions(): TimelineActions {
  const actions = useContext(TimelineActionsContext);
  if (!actions) throw new Error("useTimelineActions must be used inside a room view");
  return actions;
}

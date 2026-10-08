import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { useReadReceipts } from "../hooks/useReadReceipts";
import { useRoomMembers } from "../hooks/useRoomMembers";
import { summarize } from "../matrix/events";
import { localpart, type EventId, type RoomId } from "../matrix/ids";
import { useClient } from "../store/react";
import { truncate } from "../utils/text";
import { Composer } from "./Composer";
import { ContextPeek } from "./ContextPeek";
import { RoomHeader } from "./RoomHeader";
import { RoomInfoDrawer } from "./RoomInfoDrawer";
import { SearchPanel } from "./SearchPanel";
import { useSession } from "./session-context";
import { Timeline, type TimelineHandle } from "./Timeline";
import { TimelineActionsContext, type TimelineActions } from "./timeline-actions";
import { errorMessage, showToast } from "./toast-store";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  roomId: RoomId;
}

export function RoomView({ roomId }: Props) {
  const { queue, store } = useClient();
  const { session } = useSession();
  const timelineRef = useRef<TimelineHandle>(null);

  const [shownRoom, setShownRoom] = useState(roomId);
  const [replyTo, setReplyTo] = useState<EventId | null>(null);
  const [editing, setEditing] = useState<EventId | null>(null);
  const [peek, setPeek] = useState<EventId | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [draft, setDraft] = useState("");

  if (shownRoom !== roomId) {
    setShownRoom(roomId);
    setReplyTo(null);
    setEditing(null);
    setPeek(null);
    setAtBottom(true);
    setUnseen(0);
    setAnnouncement("");
    setDraft("");
  }

  useRoomMembers(roomId);
  useReadReceipts(roomId, atBottom);

  useLiveEvents(roomId, (events) => {
    const fromOthers = events.filter((e) => e.sender !== session.userId);
    const last = fromOthers[fromOthers.length - 1];
    if (!last) return;
    setAnnouncement(`${localpart(last.sender)}: ${truncate(summarize(last), 140)}`);
    if (!atBottom) setUnseen((n) => n + fromOthers.length);
  });

  const handleAtBottomChange = useCallback((value: boolean) => {
    setAtBottom(value);
    if (value) setUnseen(0);
  }, []);

  const actions = useMemo<TimelineActions>(
    () => ({
      reply: (eventId) => {
        setEditing(null);
        setReplyTo(eventId);
      },
      edit: (eventId) => {
        setReplyTo(null);
        setEditing(eventId);
      },
      jumpTo: (eventId) => {
        if (!timelineRef.current?.scrollToEvent(eventId)) setPeek(eventId);
      },
      react: (eventId, key) => {
        queue.react(roomId, eventId, key).catch((err: unknown) => showToast(errorMessage(err), "error"));
      },
      redact: (eventId) => {
        queue.redact(roomId, eventId).catch((err: unknown) => showToast(errorMessage(err), "error"));
      },
      retry: (txnId) => queue.retry(txnId),
      cancel: (txnId) => queue.cancel(txnId),
    }),
    [queue, roomId],
  );

  const editLast = useCallback(() => {
    const tl = store.getState().timelines[roomId];
    if (!tl) return;
    for (let i = tl.order.length - 1; i >= 0; i--) {
      const item = tl.items[tl.order[i]!];
      if (item && item.event.sender === session.userId && !item.redacted && item.event.kind !== "image") {
        setEditing(item.event.eventId);
        return;
      }
    }
  }, [store, roomId, session.userId]);

  return (
    <TimelineActionsContext.Provider value={actions}>
      <section className="room" aria-label="Room">
        <RoomHeader
          roomId={roomId}
          infoOpen={infoOpen}
          searchOpen={searchOpen}
          onToggleInfo={() => setInfoOpen((v) => !v)}
          onToggleSearch={() => setSearchOpen((v) => !v)}
        />
        {searchOpen ? <SearchPanel roomId={roomId} onClose={() => setSearchOpen(false)} /> : null}
        <div className="room__body">
          <div className="room__timeline">
            <Timeline
              key={roomId}
              ref={timelineRef}
              roomId={roomId}
              onAtBottomChange={handleAtBottomChange}
            />
            {unseen > 0 && !atBottom ? (
              <button
                type="button"
                className="jump-pill"
                onClick={() => timelineRef.current?.scrollToBottom()}
              >
                {unseen} new {unseen === 1 ? "message" : "messages"} ↓
              </button>
            ) : null}
          </div>
          {infoOpen ? <RoomInfoDrawer roomId={roomId} onClose={() => setInfoOpen(false)} /> : null}
        </div>
        <TypingIndicator roomId={roomId} />
        <Composer
          key={`${roomId}:${editing ?? ""}`}
          roomId={roomId}
          text={draft}
          onTextChange={setDraft}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onDoneEditing={() => setEditing(null)}
          onEditLast={editLast}
        />
        {peek ? <ContextPeek roomId={roomId} eventId={peek} onClose={() => setPeek(null)} /> : null}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
      </section>
    </TimelineActionsContext.Provider>
  );
}

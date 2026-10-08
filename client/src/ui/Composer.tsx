import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useTypingNotifier } from "../hooks/useTypingNotifier";
import type { EventId, RoomId } from "../matrix/ids";
import { useSetting } from "../settings/settings";
import { useClient, useSelector } from "../store/react";
import { currentBody } from "../timeline/merge";
import { SenderName } from "./SenderName";
import { errorMessage, showToast } from "./toast-store";

const MAX_ROWS = 8;

interface Props {
  roomId: RoomId;
  text: string;
  onTextChange: (text: string) => void;
  replyTo: EventId | null;
  editing: EventId | null;
  onCancelReply: () => void;
  onDoneEditing: () => void;
  onEditLast: () => void;
}

export function Composer({
  roomId,
  text,
  onTextChange,
  replyTo,
  editing,
  onCancelReply,
  onDoneEditing,
  onEditLast,
}: Props) {
  const { queue, store } = useClient();
  const enterToSend = useSetting("enterToSend");
  const typing = useTypingNotifier(roomId);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (!editing) return;
    const item = store.getState().timelines[roomId]?.items[editing];
    onTextChange(item ? (currentBody(item) ?? "") : "");
  }, []);

  const replyParent = useSelector((s) => (replyTo ? s.timelines[roomId]?.items[replyTo] : undefined));

  function submit() {
    const body = text.trim();
    if (!body) return;
    typing.stop();
    if (editing) {
      queue.edit(roomId, editing, body).catch((err: unknown) => showToast(errorMessage(err), "error"));
      onDoneEditing();
      return;
    }
    queue.sendText(roomId, body, replyTo ?? undefined);
    onTextChange("");
    onCancelReply();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      const send = enterToSend ? !event.shiftKey : event.ctrlKey || event.metaKey;
      if (send) {
        event.preventDefault();
        submit();
      }
    } else if (event.key === "Escape") {
      if (editing) onDoneEditing();
      else if (replyTo) onCancelReply();
    } else if (event.key === "ArrowUp" && text === "" && !editing) {
      event.preventDefault();
      onEditLast();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  const rows = Math.min(MAX_ROWS, text.split("\n").length);

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {replyTo ? (
        <div className="composer__context">
          <span>
            Replying to{" "}
            {replyParent ? <SenderName roomId={roomId} userId={replyParent.event.sender} /> : "a message"}
          </span>
          <button type="button" className="link-button" onClick={onCancelReply}>
            Cancel
          </button>
        </div>
      ) : null}
      {editing ? (
        <div className="composer__context">
          <span>Editing message</span>
          <button type="button" className="link-button" onClick={onDoneEditing}>
            Cancel
          </button>
        </div>
      ) : null}
      <div className="composer__row">
        <textarea
          ref={inputRef}
          className="composer__input"
          rows={rows}
          value={text}
          placeholder={editing ? "Edit message" : "Write a message"}
          aria-label="Message"
          onChange={(e) => {
            onTextChange(e.target.value);
            if (e.target.value) typing.onInput();
            else typing.stop();
          }}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="button button--primary" disabled={!text.trim()}>
          {editing ? "Save" : "Send"}
        </button>
      </div>
    </form>
  );
}

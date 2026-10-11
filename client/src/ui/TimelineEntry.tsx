import type { RoomId } from "../matrix/ids";
import type { TimelineRow } from "../store/selectors";
import { DaySeparator } from "./DaySeparator";
import { ErrorBoundary } from "./ErrorBoundary";
import { EventTile } from "./EventTile";

interface Props {
  roomId: RoomId;
  row: TimelineRow;
  highlighted: boolean;
}

const TILE_FALLBACK = <p className="body body--unsupported">This message couldn't be displayed.</p>;

export function TimelineEntry({ roomId, row, highlighted }: Props) {
  if (row.type === "day") return <DaySeparator label={row.label} />;
  return (
    <ErrorBoundary fallback={TILE_FALLBACK}>
      <EventTile
        roomId={roomId}
        eventId={row.eventId}
        continuation={row.continuation}
        highlighted={highlighted}
      />
    </ErrorBoundary>
  );
}

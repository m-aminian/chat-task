import type { RoomId } from "../matrix/ids";
import type { TimelineRow } from "../store/selectors";
import { DaySeparator } from "./DaySeparator";
import { EventTile } from "./EventTile";

interface Props {
  roomId: RoomId;
  row: TimelineRow;
  highlighted: boolean;
}

export function TimelineEntry({ roomId, row, highlighted }: Props) {
  if (row.type === "day") return <DaySeparator label={row.label} />;
  return (
    <EventTile
      roomId={roomId}
      eventId={row.eventId}
      continuation={row.continuation}
      highlighted={highlighted}
    />
  );
}

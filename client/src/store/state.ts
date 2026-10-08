import type { RoomId, UserId } from "../matrix/ids";
import type { RoomTimeline } from "../timeline/merge";

export interface RoomSummary {
  roomId: RoomId;
  name: string;
  topic: string;
  lastActivity: number;
  preview: { sender: UserId; text: string } | null;
  unread: number;
  highlights: number;
}

export interface Member {
  userId: UserId;
  displayName: string | null;
  avatarUrl: string | null;
}

export type SyncStatus = "stopped" | "initial" | "live" | "reconnecting";

export interface AppState {
  syncStatus: SyncStatus;
  syncError: string | null;

  roomIds: RoomId[];
  rooms: Record<RoomId, RoomSummary>;
  timelines: Record<RoomId, RoomTimeline>;
  typing: Record<RoomId, UserId[]>;
  members: Record<RoomId, Record<UserId, Member>>;
  paginating: Record<RoomId, boolean>;
}

export const initialState: AppState = {
  syncStatus: "stopped",
  syncError: null,
  roomIds: [],
  rooms: {},
  timelines: {},
  typing: {},
  members: {},
  paginating: {},
};

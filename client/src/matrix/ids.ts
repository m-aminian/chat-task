import { z } from "zod";

export type RoomId = string;
export type EventId = string;
export type UserId = string;
export type TxnId = string;

export const roomIdSchema = z
  .string()
  .startsWith("!")
  .transform((s) => s as RoomId);
export const eventIdSchema = z
  .string()
  .startsWith("$")
  .transform((s) => s as EventId);
export const userIdSchema = z
  .string()
  .regex(/^@[^:]+:.+$/)
  .transform((s) => s as UserId);

export const toUserId = (value: string): UserId => userIdSchema.parse(value);

export const isRoomId = (value: unknown): value is RoomId => roomIdSchema.safeParse(value).success;

let txnCounter = 0;
const txnPrefix = Math.random().toString(36).slice(2, 8);

export function newTxnId(): TxnId {
  txnCounter += 1;
  return `${txnPrefix}.${Date.now()}.${txnCounter}` as TxnId;
}

export function localEventId(txnId: TxnId): EventId {
  return `~${txnId}` as EventId;
}

export function localpart(userId: UserId): string {
  return userId.slice(1, userId.indexOf(":"));
}

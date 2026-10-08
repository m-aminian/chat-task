import { createHmac } from "node:crypto";
import { HOMESERVER, PASSWORD, SHARED_SECRET } from "./config.js";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T;
  if (!res.ok) throw new Error(`${res.status} ${res.url}: ${JSON.stringify(body)}`);
  return body;
}

export async function registerUser(username: string, admin: boolean): Promise<boolean> {
  const url = `${HOMESERVER}/_synapse/admin/v1/register`;
  const { nonce } = await json<{ nonce: string }>(await fetch(url));
  const mac = createHmac("sha1", SHARED_SECRET)
    .update([nonce, username, PASSWORD, admin ? "admin" : "notadmin"].join("\0"))
    .digest("hex");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, username, password: PASSWORD, admin, mac }),
  });
  if (res.ok) return true;

  const err = (await res.json()) as { errcode?: string };
  if (err.errcode === "M_USER_IN_USE") return false;
  throw new Error(`register ${username} failed: ${res.status} ${JSON.stringify(err)}`);
}

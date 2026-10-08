export const HOMESERVER = (process.env.HOMESERVER ?? "http://localhost:8008").replace(/\/$/, "");

export const SHARED_SECRET = process.env.REGISTRATION_SHARED_SECRET ?? "assignment-shared-secret";

export const PASSWORD = "assignment";

export const SERVER_NAME = "localhost";

export const USERS = {
  alice: { admin: false },
  bob: { admin: false },
  chaosbot: { admin: false },

  carol: { admin: false },
  dave: { admin: false },
  erin: { admin: false },

  admin: { admin: true },
} as const;

export type Username = keyof typeof USERS;

export const userId = (name: Username) => `@${name}:${SERVER_NAME}`;
export const roomAlias = (name: string) => `#${name}:${SERVER_NAME}`;

export const SEED_MARKER_TYPE = "org.assignment.seed";
export const SEED_VERSION = 1;

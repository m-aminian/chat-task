export const TIMELINE_LIMIT = 20;

export const TIMELINE_TYPES = ["m.room.message", "m.reaction", "m.room.redaction"] as const;

export const SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: TIMELINE_LIMIT, types: TIMELINE_TYPES },
    state: { types: ["m.room.name", "m.room.topic", "m.room.canonical_alias"] },
    ephemeral: { types: ["m.typing"] },
    account_data: { not_types: ["*"] },
  },
  presence: { not_types: ["*"] },
  account_data: { not_types: ["*"] },
});

export const MESSAGES_FILTER = JSON.stringify({ types: TIMELINE_TYPES });

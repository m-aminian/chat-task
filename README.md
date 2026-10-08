# The inherited client

You have taken over a web chat client built on [Matrix](https://matrix.org). It works in a demo, but people who use it all day are unhappy with it. Make it a client you would be comfortable shipping, and tell us how you got there.

What people say about it:

- "It gets really slow in the busy rooms."
- "After a few hours my laptop gets hot."
- "Sometimes what I see doesn't match what my colleagues see."
- "Now and then the screen just goes blank."

## Rules

- Keep the hand-written Matrix layer (`fetch` and its own sync engine). No Matrix SDK.
- AI tools are allowed. Say in `NOTES.md` what you used and how.
- Time box: 8 hours. You are not expected to finish everything. Prioritise.
- Keep `window.__timeline` working (the checker reads it).

## Deliverable

The repository, including `.git`, with `NOTES.md` filled in. In the follow-up call we go through your changes and work on your branch together.

## Setup

### Prerequisites

- **Docker** with Compose: Docker Desktop, or Podman with `podman machine start`.
- **Node.js 20 or newer.** pnpm comes through Corepack, so there is nothing else to install.
- macOS, Linux or Windows (inside WSL 2).
- Free ports: `8008` (homeserver) and `5173` (client).

### First run

```sh
make up        # starts the Synapse homeserver on :8008 and fills it with test data
make client    # starts the client on http://localhost:5173 (leave this terminal open)
```

The first `make up` downloads the Synapse image and seeds three rooms, which takes about 5 minutes. Later runs take seconds.

Open <http://localhost:5173> and sign in:

| | |
| --- | --- |
| Homeserver | `http://localhost:8008` (prefilled) |
| Username | `alice` (also `bob`, `chaosbot`) |
| Password | `assignment` |

Rooms: `#small` (50 messages), `#medium` (2,000) and `#big` (20,000).

### Everyday commands

| Command | What it does |
| --- | --- |
| `make client` | Run the client (Ctrl-C to stop) |
| `make chaos` | Busy traffic in `#big` and `#medium` until Ctrl-C. `ARGS="--intensity high"` or `ARGS="--duration 300"` |
| `make check` | Compares what the running client shows with what the server stored. `ARGS="--soak 10 --with-chaos"` runs it under load first |
| `make measure` | Scroll frame rate and memory measurements against the running client |
| `make down` | Stop the homeserver (keeps the data) |
| `make reset` | Wipe the homeserver and seed it again (about 5 minutes) |

`make check` and `make measure` need the client running (`make client` in another terminal).

### Troubleshooting

- **"Cannot connect to the Docker daemon"**: start Docker Desktop, or run `podman machine start`.
- **Port already in use**: stop whatever uses `8008` or `5173`, or run `make down` from an earlier session.
- **Rooms look different after chaos runs**: `make reset` restores the original data.
- **Login fails**: check that `make up` finished and <http://localhost:8008/health> answers `OK`.


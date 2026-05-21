# CCO (Chat Center Online)

Groups chat app integrated with Planning Center (hybrid model: PCO identity + in-app messaging).

## Stack

- **API:** Bun + Hono + Drizzle + PostgreSQL
- **Web:** Next.js 16
- **Mobile:** Expo Router

## Production deployment

One command on any Linux server — installs Docker, clones CCO, and walks through Cloudflare, database, and deploy. Planning Center OAuth is configured at `/setup` in the browser after deploy:

```bash
curl -fsSL https://raw.githubusercontent.com/BA-LSC/CCO/main/deploy/install.sh | bash
```

Full guide: **[deploy/README.md](deploy/README.md)**.

**Already cloned:**

```bash
./deploy/install.sh
```

Then open `https://<your-web-domain>/setup` for app configuration (church name, OAuth, webhooks).

**Day-two:**

```bash
./deploy/compose.sh ps
./deploy/compose.sh logs -f api
./deploy/compose.sh --profile jobs run --rm reconcile
```

| Script | When to use |
|--------|-------------|
| `./deploy/install.sh` | First-time server setup (recommended) |
| `./deploy/setup.sh` | Same wizard if repo is already cloned |
| `./deploy/bootstrap.sh` | Redeploy when `.env` is ready |
| `./deploy/compose.sh` | Logs, migrations, cron |
| `bun run deploy:install` | Same as `./deploy/install.sh` |

---

## Local development

### Prerequisites

- [Bun](https://bun.sh) **1.3+** (repo pins `bun@1.3.14` in `package.json`)
- [Docker](https://docs.docker.com/get-docker/) with Compose v2 (PostgreSQL + Redis only)

Install Bun if needed:

```bash
curl -fsSL https://bun.sh/install | bash
bun --version
```

### 1. Clone and install

```bash
git clone https://github.com/<org>/<repo>.git cco
cd cco
bun install
```

### 2. Start infrastructure

```bash
docker compose up -d
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Notes |
|----------|--------|
| `PCO_CLIENT_ID` / `PCO_CLIENT_SECRET` | From [Planning Center Developers](https://developer.planning.center/) |
| `SESSION_SECRET` | 32+ characters (`openssl rand -hex 32`) |
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters (`openssl rand -hex 32`) |

### 3. Database migrations

```bash
bun run db:migrate
```

If `drizzle-kit migrate` fails, apply SQL files in `services/api/drizzle/` in order (`0000` through `0010`).

### 4. Run services

**Option A — two terminals**

```bash
# Terminal 1 — API
bun run dev:api

# Terminal 2 — Web
bun run dev:web
```

**Option B — single command (background API)**

```bash
bun run dev:all
```

| Service | URL |
|---------|-----|
| Web (sign in here) | http://localhost:3000 |
| API | http://localhost:3001 |

Use `localhost`, not `127.0.0.1` or a LAN IP, for OAuth in the browser.

### 5. Planning Center OAuth app

Register at [Planning Center Developers](https://developer.planning.center/) with redirect URIs that match **exactly**:

| Client | Redirect URI |
|--------|----------------|
| Web | `http://localhost:3000/api/auth/pco/callback` |
| Mobile | `http://localhost:3001/auth/pco/mobile/callback` |

### Mobile sign-in

The Expo app uses `connect://oauth/callback` via `expo-web-browser`. Start the API before signing in on a device or simulator. On a physical device, set `EXPO_PUBLIC_API_URL` to your machine’s LAN IP (e.g. `http://192.168.1.10:3001`).

CCO is the product name; internal OAuth and database identifiers may still use the legacy `connect` prefix.

### 6. Webhooks (production)

Point PCO webhooks to:

```text
https://<your-api-domain>/webhooks/pco
```

Subscribe to: `groups.v2.events.membership.*`, `people.v2.events.person.updated`. Configure webhook secrets during production `/setup` — paste one PCO `authenticity_secret` per line (one per subscription, all using the same endpoint URL).

---

## Features

- PCO OAuth (web + mobile) with encrypted token storage
- Group sync with **leader/admin role** mapping from PCO
- **Roster sync** for leaders (`POST /v1/groups/:id/roster/sync`)
- Realtime chat (WebSocket) with membership checks
- Message edit/delete, **reactions**, **@mentions** with targeted push
- Multiple conversations per group (create, mute, archive)
- Cursor-based message history
- Services team chat
- Webhooks: membership created/updated/destroyed, person updated
- Nightly reconcile job re-syncs groups from PCO

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/pco/start` | Begin OAuth (API) |
| POST | `/auth/pco/exchange` | Exchange OAuth code (web callback) |
| GET | `/v1/session/me` | Current user |
| GET | `/v1/session/ws-token` | WebSocket auth token |
| GET | `/v1/groups` | List user's groups |
| POST | `/v1/groups/sync` | Sync from PCO `my_groups` + roles |
| POST | `/v1/groups/:id/roster/sync` | Sync full roster (leaders) |
| GET | `/v1/groups/:id` | Group detail, members, conversations |
| POST | `/v1/groups/:id/conversations` | Create conversation (leaders) |
| GET | `/v1/conversations/:id/messages` | Message history (`?before=&limit=`) |
| PATCH | `/v1/conversations/:id/mute` | Mute/unmute conversation |
| POST | `/v1/conversations/:id/archive?groupId=` | Archive conversation (leaders) |
| POST | `/v1/messages?conversationId=` | Send message (idempotent via `clientMessageId`) |
| PATCH | `/v1/messages/:id` | Edit own message |
| DELETE | `/v1/messages/:id` | Delete own message (leaders can moderate) |
| GET/POST/DELETE | `/v1/messages/:id/reactions` | Message reactions |
| POST | `/v1/uploads` | Image upload (local dev storage) |
| POST | `/v1/push/register` | Register Expo push token |
| GET | `/v1/services/teams` | List service teams |
| GET | `/v1/services/teams/:id` | Team detail + conversation |
| POST | `/v1/services/teams/sync` | Sync service teams from PCO |
| WS | `/v1/ws?conversationId=&token=` | Realtime events |
| POST | `/webhooks/pco` | PCO webhook receiver |

Web OAuth entry: `/auth/sign-in` → Planning Center → `/api/auth/pco/callback`

## Jobs

```bash
cd services/api && bun run jobs:reconcile
```

## Tests

Unit tests (API + packages):

```bash
bun run test:unit
```

E2E (Playwright — API and web must be running):

```bash
cd apps/web && bunx playwright install chromium && bun run test:e2e
```

## Docs

- Design: `docs/superpowers/specs/2026-05-19-pco-chat-groups-design.md`
- Plan: `docs/superpowers/plans/2026-05-19-pco-chat-groups.md`

## License

[MIT](LICENSE)

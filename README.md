# CCO (Chat Center Online)

Groups chat integrated with Planning Center — PCO identity, in-app messaging, teams, calls, and push notifications.

## Production install (recommended)

**Greenfield:** install entirely in **your** Cloudflare account with the browser wizard — no VPS, Docker, or SSH.

1. Open **[https://setup-c.co](https://setup-c.co)**
2. Create a Cloudflare API token (permissions listed in the wizard)
3. Choose your zone; confirm `chat.<zone>` and `api.<zone>`
4. Wait for provisioning (D1, Workers, Pages, R2, KV, Queues, DNS, RealtimeKit)
5. Connect Planning Center OAuth and webhooks (URLs pre-filled)
6. Open `https://chat.<zone>/setup` to finish first-time configuration

Full walkthrough: **[docs/install/README.md](docs/install/README.md)** (token scopes, SSL, D1 limits, smoke checklist).

**Day-two updates (Cloudflare orgs):** churches do not `git pull` on Workers. Apply releases from **Admin → Updates** (or redeploy published artifacts from [setup-c.co/releases](https://setup-c.co/releases)). Operator docs: **[deploy/cloudflare/README.md](deploy/cloudflare/README.md)**.

CCO hosts only the install wizard and orchestrator at `setup-c.co`; your chat app runs in your Cloudflare account.

---

## Architecture (Cloudflare)

| Layer | Technology |
|-------|------------|
| API | Hono on **Cloudflare Workers** (`workers/cco-api`), **D1**, **R2**, **KV**, **Queues** |
| Web | **Next.js 16** on **Cloudflare Pages** via OpenNext (`apps/web`) |
| Realtime | **Durable Objects** WebSocket hub (`workers/cco-realtime`) |
| Edge | PCO webhooks, Giphy proxy, push consumer, reconcile cron |
| Calls | **Cloudflare RealtimeKit** (configured in Integrations) |
| Install | OpenNext wizard + orchestrator worker (`apps/install`, `workers/install-orchestrator`) |

Wrangler config is **`wrangler.jsonc`** (not `.toml`) in each deployable app/worker. Monorepo tooling: **Bun**, **Turborepo**, shared packages under `packages/`.

Worker map: **[workers/README.md](workers/README.md)**.

---

## Advanced: self-host on a VPS

Docker on Linux + **Cloudflare Tunnel** (no public 80/443 on the server), PostgreSQL, Redis, containerized API and web. Use when you need full control of Postgres or an existing VPS workflow.

```bash
curl -fsSL https://raw.githubusercontent.com/BA-LSC/CCO/main/deploy/install.sh | bash
```

Guide: **[deploy/README.md](deploy/README.md)** — `./deploy/update.sh`, `./deploy/compose.sh`, `/setup` for OAuth and webhooks.

Optional **Workers at the edge** (R2 cache, webhook verify) alongside the VPS stack is documented in `deploy/cloudflare/`; that is not the default greenfield path.

---

## Local development

### Prerequisites

- [Bun](https://bun.sh) **1.3+**
- [Docker](https://docs.docker.com/get-docker/) Compose v2 — **PostgreSQL + Redis** only (mirrors VPS data layer; Cloudflare path uses D1/R2 in production)

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/BA-LSC/CCO.git cco
cd cco
bun install
```

Hooks install with `bun install` (pre-commit secret scan, pre-push lint + unit tests).

**Mobile** (`apps/mobile`) is outside the root workspace — see [apps/mobile/README.md](apps/mobile/README.md).

### Run locally

```bash
docker compose up -d
cp .env.example .env   # set PCO_CLIENT_ID/SECRET, SESSION_SECRET, TOKEN_ENCRYPTION_KEY
bun run db:migrate
bun run dev:all        # or dev:api + dev:web in two terminals
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |

Use `localhost` (not `127.0.0.1`) for OAuth. Web redirect: `http://localhost:3000/api/auth/pco/callback`.

Production webhooks: `https://<api-domain>/webhooks/pco` — subscribe to `groups.v2.events.membership.*` and `people.v2.events.person.updated`.

---

## Features

- PCO OAuth (web + mobile) with encrypted token storage
- Group sync with leader/admin roles from PCO; roster sync for leaders
- Realtime chat (WebSocket) with membership checks
- Message edit/delete, reactions, @mentions with targeted push
- Multiple conversations per group (create, mute, archive)
- Services team chat; audio/video via RealtimeKit when configured
- PCO webhooks + nightly reconcile

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
| POST | `/v1/uploads` | Image upload (local dev; Cloudflare uses presigned R2) |
| POST | `/v1/push/register` | Register Expo push token |
| GET | `/v1/services/teams` | List service teams |
| GET | `/v1/services/teams/:id` | Team detail + conversation |
| POST | `/v1/services/teams/sync` | Sync service teams from PCO |
| WS | `/v1/ws?conversationId=&token=` | Realtime events |
| POST | `/webhooks/pco` | PCO webhook receiver |

Web sign-in: `/auth/sign-in` → Planning Center → `/api/auth/pco/callback`

## Jobs (VPS / local)

```bash
cd services/api && bun run jobs:reconcile
```

On Cloudflare, reconcile runs on the `cco-reconcile-cron` worker.

## Tests

```bash
bun run test:unit
cd apps/web && bunx playwright install chromium && bun run test:e2e   # API + web running
```

## Docs

- Install: [docs/install/README.md](docs/install/README.md)
- Deploy (VPS): [deploy/README.md](deploy/README.md)
- Deploy (Cloudflare): [deploy/cloudflare/README.md](deploy/cloudflare/README.md)
- Design: `docs/superpowers/specs/2026-05-19-pco-chat-groups-design.md`

## License

[MIT](LICENSE)

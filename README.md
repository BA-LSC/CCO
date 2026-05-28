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

**Legacy VPS / Docker self-host:** preserved on the **`manual-vps`** branch only (not maintained on `main`).

---

## Architecture (Cloudflare)

| Layer | Technology |
|-------|------------|
| API | Hono on **Cloudflare Workers** (`workers/cco-api`), **D1**, **R2**, **KV**, **Queues**; Giphy at `/v1/giphy` |
| Web | **Next.js 16** on **Cloudflare Pages** via OpenNext (`apps/web`) |
| Realtime | **Durable Objects** WebSocket hub (`workers/cco-realtime` → `cco-realtime-fanout`) |
| Edge | PCO webhooks, push consumer, reconcile cron |
| Calls | **Cloudflare RealtimeKit** (configured in Integrations) |
| Install | OpenNext wizard + orchestrator worker (`apps/install`, `workers/install-orchestrator`) |

Wrangler config is **`wrangler.jsonc`** (not `.toml`) in each deployable app/worker. Monorepo tooling: **Bun**, **Turborepo**, shared packages under `packages/`.

Worker map: **[workers/README.md](workers/README.md)**.

Cloudflare-native local dev (Wrangler + D1) is planned in a future branch.

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
| POST | `/v1/uploads/presign` | Presigned R2 upload (production) |
| POST | `/v1/push/register` | Register Expo push token |
| GET | `/v1/services/teams` | List service teams |
| GET | `/v1/services/teams/:id` | Team detail + conversation |
| POST | `/v1/services/teams/sync` | Sync service teams from PCO |
| WS | `/v1/ws?conversationId=&token=` | Realtime events |
| POST | `/webhooks/pco` | PCO webhook receiver |

Web sign-in: `/auth/sign-in` → Planning Center → `/api/auth/pco/callback`

## Jobs

On Cloudflare, nightly PCO reconcile runs on the `cco-reconcile-cron` worker.

## Tests

```bash
bun run test:unit
cd apps/web && bunx playwright install chromium && bun run test:e2e
```

## Docs

- Install: [docs/install/README.md](docs/install/README.md)
- Deploy (Cloudflare): [deploy/cloudflare/README.md](deploy/cloudflare/README.md)
- Design: `docs/superpowers/specs/2026-05-19-pco-chat-groups-design.md`

## License

[MIT](LICENSE)

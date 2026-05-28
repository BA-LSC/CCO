# cco-api — Cloudflare Worker (Hono)

Main CCO API for Cloudflare-native installs. Reuses route handlers from `services/api` with D1, R2, KV, Queue, and Realtime fanout bindings.

## Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | Primary database (`@cco/db`) |
| `UPLOADS` | R2 | Media attachments |
| `PRESENCE_KV` | KV | User online presence |
| `DEPLOY_KV` | KV | Deploy draining / status signals |
| `PUSH_QUEUE` | Queue producer | Async push notification delivery |
| `REALTIME_FANOUT` | Service | `cco-realtime-fanout` per-conversation Durable Object fanout |

**Placement:** `mode: smart` — runs near D1/R2/KV after Cloudflare analyzes traffic (~15 min post-deploy).

## Mounted routes

- `GET /health` — install verification
- `/auth/*`, `/v1/session/*` — auth and session
- `/v1/messages/*`, `/v1/conversations/*`, `/v1/groups/*`, `/v1/dms/*`
- `/v1/setup/*`, `/v1/settings/*`
- `/v1/uploads/*` — presign + serve (R2 binding)
- `/v1/presence/*`, `/v1/unread/*`, `/v1/push/*`
- `/v1/calls/*`, `/v1/services/*`
- `/v1/giphy/*` — GIF search, import (session auth; same handlers as Bun API)
- `/internal/*` — edge worker callbacks (PCO webhooks, reconcile cron, push consumer)

## WebSocket (Phase 5)

| Route | Handled by |
|-------|------------|
| `GET /v1/ws` | **`cco-realtime-fanout`** — ConversationRoom Durable Object per `conversationId` |

## Deferred (other workers)
| `POST /webhooks/pco` | **Edge** — `cco-pco-webhook` → `/internal/webhooks/pco` |
| Local disk uploads (`Bun.write`) | Not supported — R2 only |
| Redis pub/sub | Replaced by `REALTIME_FANOUT` service binding |
| Hyperdrive / Postgres | Not used — D1 only |

## Dev

```bash
cd workers/cco-api
bun install
npx wrangler dev
```

Replace placeholder binding IDs in `wrangler.jsonc` after provision, or use `wrangler dev --local` with miniflare defaults.

## Tests

```bash
bun test workers/cco-api
bun test services/api/src/routes/internal.test.ts
```

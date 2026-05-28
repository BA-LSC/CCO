# Cloudflare deployment

## setup-c.co — browser install wizard

New churches start at **[https://setup-c.co](https://setup-c.co)**. CCO hosts the install UI and orchestrator on Cloudflare:

| Service | Path | Deploy target |
|---------|------|---------------|
| Install wizard UI | `https://setup-c.co` | `apps/install` → `cco-install` (OpenNext) |
| Install orchestrator | `https://setup-c.co/api/*` | `workers/install-orchestrator` |

```bash
export CLOUDFLARE_API_TOKEN=...
./deploy/cloudflare/deploy-setup-c.sh
```

See **[docs/install/README.md](../../docs/install/README.md)** for token permissions and troubleshooting.

---

## Cloudflare Pages (OpenNext) — church web app

The web UI deploys to **Cloudflare Pages** via [@opennextjs/cloudflare](https://opennext.js.org/cloudflare).

## Build

From the repo root:

```bash
bun install
bun run --cwd apps/web build:cloudflare
```

`build` runs Next.js only; `build:cloudflare` runs OpenNext (do not point `build` at OpenNext or it will recurse).

Output lands in `apps/web/.open-next/`. Deploy with Wrangler from `apps/web` (see `apps/web/wrangler.jsonc`):

```bash
cd apps/web && npx wrangler deploy
```

Or from `apps/web`: `bun run deploy:cloudflare`.

Route guards run in **`middleware.ts`** (edge middleware for OpenNext).

## Environment variables (Pages / Worker)

Set these on the **Pages project** or in `apps/web/wrangler.jsonc` `vars` / secrets at install time:

| Variable | Example | Purpose |
|----------|---------|---------|
| `CCO_DEPLOY_TARGET` | `cloudflare` | Enables Cloudflare code paths (API origin, presigned uploads, deploy polling) |
| `WEB_URL` | `https://chat.example.com` | Public web origin for redirects and PCO callback |
| `NEXT_PUBLIC_WEB_URL` | same as `WEB_URL` | Client-side origin hints |
| `API_DOMAIN` | `api.example.com` | Server-side API host (OAuth exchange, health, presign) |
| `NEXT_PUBLIC_WS_URL` | `wss://api.example.com` | WebSocket base (optional if derivable from `WEB_URL`) |
| `PUBLIC_UPLOAD_URL` | `https://chat.example.com/api/v1/uploads` | Signed attachment display URLs |
| `PCO_WEB_REDIRECT_URI` | `https://chat.example.com/api/auth/pco/callback` | Planning Center OAuth redirect (web) |
| `CF_DEPLOY_KV` | `1` | Deploy overlay reads status via API `/health` (KV on API worker) |
| `NEXT_PUBLIC_DIRECT_UPLOADS` | `1` | Client uses `POST /api/v1/uploads/presign` + direct R2 PUT |

**Do not set** `API_URL=http://api:3001` on Pages — that was a Docker internal hostname. Use `API_DOMAIN` or derive from `WEB_URL`.

## Upload flow (Cloudflare)

1. Browser `POST /api/v1/uploads/presign` (same-origin → API worker via route or Next handler).
2. API returns `{ uploadUrl, url, filename }` with a presigned R2 PUT URL.
3. Browser `PUT` file bytes directly to R2 (no large Next.js body proxy).
4. Chat message references `url` (signed GET via API or cache rule).

Multipart `POST /api/v1/uploads` is rejected on Cloudflare deploy (`400`) — use presign only.

## OAuth on Pages

| Step | URL |
|------|-----|
| PCO redirect (user browser) | `https://chat.<zone>/api/auth/pco/callback` |
| Token exchange (server-side) | `https://api.<zone>/auth/pco/exchange` |

The callback route runs on Pages; it calls the API worker on the **api** subdomain using `getServerApiOrigin()` (`API_DOMAIN` or `api.<zone>` from `WEB_URL`).

Register the redirect URI shown on `/setup` in Planning Center:

- `https://chat.<zone>/api/auth/pco/callback` (preferred)
- `https://chat.<zone>/auth/pco/callback` (legacy path, still supported)

## Deploy status (no Redis SSE)

On Cloudflare, deploy overlay status is polled from `GET /api/app-version` and `GET https://api.<zone>/health` every 5s during updates — not Redis pub/sub. The API worker writes deploy flags to **DEPLOY_KV**; the web app reads them via the health endpoint.

## OpenNext limitations (Next.js 16)

- **Large multipart uploads** — not supported on Workers/Pages; presigned R2 only.
- **Node.js middleware** — not supported; edge middleware only.
- **Worker size** — monitor gzip size after `bun run build` (Paid plan ~10 MiB compressed).

## Routing at install (Phase 7)

Provision pipeline should map:

- `chat.<domain>/*` → Pages project (`cco-web`)
- `chat.<domain>/api/v1/*` → optional Worker route to `cco-api` (or Next route handlers proxy to API)
- `api.<domain>/*` → `cco-api` worker

Client calls same-origin `/api/v1/*` on the web hostname; Cloudflare routes or Next handlers forward to the API worker.

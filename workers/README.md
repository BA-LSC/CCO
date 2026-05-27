# Cloudflare Workers (edge compute)

Workers extend CCO beyond the VPS. Resource IDs (R2 bucket, KV, Queues, Hyperdrive) are auto-provisioned when a Cloudflare API token is saved during `/setup` or **Admin → Integrations**.

## Workers

| Worker | Route / trigger | Purpose |
|--------|-----------------|--------|
| `cco-install` | `setup-c.co` | BYO install wizard UI (OpenNext Pages) |
| `cco-install-orchestrator` | `setup-c.co/api/*` / local `:8787` | Install API (session KV, Cloudflare verify, provision pipeline) |
| `cco-api` | `{API_DOMAIN}/*` (catch-all) | Main Hono API on D1 + R2 + KV + Queues |
| `cco-pco-webhook` | `{API_DOMAIN}/webhooks/pco` | Edge HMAC verify + forward to internal handler |
| `cco-giphy-proxy` | _(unused — giphy served by `cco-api`)_ | Legacy edge proxy (not routed after provision) |
| `cco-reconcile-cron` | Cron `0 3 * * *` | Nightly PCO reconcile (batch user sync) |
| `cco-push-consumer` | Queue `cco-push-notifications` | Retryable Expo/Web Push delivery |
| `cco-realtime-fanout` | `{API_DOMAIN}/v1/ws` | Per-conversation Durable Object WebSocket hub (replaces Bun WS + Redis) |
| `cco-web` | `{WEB_DOMAIN}/*` (Pages) | OpenNext web app — see `deploy/cloudflare/README.md` |

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...
export CF_INTERNAL_SECRET=...   # openssl rand -hex 32 — same on VPS + workers
export API_DOMAIN=api.example.com
./deploy/provision-cloudflare-workers.sh
```

Set worker secrets (examples):

```bash
cd workers/pco-webhook && npx wrangler secret put WEBHOOK_SECRETS
cd workers/pco-webhook && npx wrangler secret put INTERNAL_FORWARD_SECRET
# INTERNAL_FORWARD_URL = https://api.example.com/internal/webhooks/pco
```

## VPS env (after auto-provision)

See `deploy/.env.production.example` for `CF_*` variables. Enable KV-backed presence/deploy with `CF_PRESENCE_KV=1` and `CF_DEPLOY_KV=1` once namespaces are provisioned.

## Phase 4 — R2 attachment cache

For signed R2 GET URLs, add a **Cache Rule** in Cloudflare:

- **When**: URI path contains `X-Amz-Signature` (presigned R2 query)
- **Then**: Eligible for cache, Edge TTL = respect origin `Cache-Control` (upload serve sets `max-age` from signature expiry)

Auto-provisioning via API is limited; create this rule in the dashboard or Terraform when R2 public delivery is enabled.

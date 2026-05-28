# Cloudflare Workers (edge compute)

Resource IDs (R2 bucket, KV, Queues) are auto-provisioned when a Cloudflare API token is saved during `/setup` or **Admin → Integrations**.

## Workers (BYO church deploy)

Built from `CCO_WORKER_BUILD_SPECS` in `packages/cloudflare-provision` — five Workers plus OpenNext Pages:

| Worker | Route / trigger | Purpose |
|--------|-----------------|--------|
| `cco-api` | `{API_DOMAIN}/*` (catch-all) | Main Hono API on D1 + R2 + KV + Queues; Giphy at `/v1/giphy` |
| `cco-pco-webhook` | `{API_DOMAIN}/webhooks/pco` | Edge HMAC verify + forward to internal handler |
| `cco-reconcile-cron` | Cron `0 3 * * *`, `*/10 * * * *` | Nightly PCO reconcile; org update check |
| `cco-push-consumer` | Queue `cco-push-notifications` | Retryable Expo/Web Push delivery |
| `cco-realtime-fanout` | `{API_DOMAIN}/v1/ws`, `/v1/ws/inbox` | Per-conversation Durable Object WebSocket hub |
| `cco-web` | `{WEB_DOMAIN}/*` (Pages) | OpenNext web app — see `deploy/cloudflare/README.md` |

**Smart Placement:** `cco-api` and `cco-realtime-fanout` default to Automatic (Smart Placement). **Admin → Integrations → Cloudflare** can pin both to a fixed US West region instead.

**Legacy (not deployed):** `workers/giphy-proxy` (`cco-giphy-proxy`) — Giphy is served by `cco-api`; the standalone proxy is unused.

**Setup-c.co only (operator):** `cco-install` (wizard UI), `cco-install-orchestrator` (`setup-c.co/api/*`).

## Deploy

**Greenfield:** churches use [setup-c.co](https://setup-c.co). **Operators** building release bundles or redeploying setup-c.co:

```bash
export CLOUDFLARE_API_TOKEN=...
./deploy/cloudflare/deploy-setup-c.sh
```

**BYO church updates:** Admin → Updates → Apply (see [deploy/cloudflare/README.md](../deploy/cloudflare/README.md)).

Set worker secrets (examples):

```bash
cd workers/pco-webhook && npx wrangler secret put WEBHOOK_SECRETS
cd workers/pco-webhook && npx wrangler secret put INTERNAL_FORWARD_SECRET
# INTERNAL_FORWARD_URL = https://api.example.com/internal/webhooks/pco
```

## Phase 4 — R2 attachment cache

For signed R2 GET URLs, add a **Cache Rule** in Cloudflare:

- **When**: URI path contains `X-Amz-Signature` (presigned R2 query)
- **Then**: Eligible for cache, Edge TTL = respect origin `Cache-Control` (upload serve sets `max-age` from signature expiry)

Auto-provisioning via API is limited; create this rule in the dashboard or Terraform when R2 public delivery is enabled.

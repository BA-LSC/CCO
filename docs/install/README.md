# Install CCO (Chat Center Online)

**Recommended:** install entirely in your own Cloudflare account using the browser wizard — no VPS, Docker, SSH, or `wrangler`.

## Browser install (default)

Open **[https://setup-c.co](https://setup-c.co)** and complete the wizard:

| Step | What you do | What happens automatically |
|------|-------------|----------------------------|
| 1. Welcome | Enter your church name | Session created |
| 2. Cloudflare | Create an API token → paste it | Token verified; zones listed |
| 3. Domains | Pick zone; confirm `chat.<zone>` and `api.<zone>` | SSL coverage checked |
| 4. Deploy | Watch progress (usually 2–5 minutes) | D1, Workers, Pages, R2, KV, Queues, DNS, RealtimeKit |
| 5. Planning Center | OAuth + webhook secret (URLs pre-filled) | Webhooks registered |
| 6. Done | Open live chat | Redirect to `https://chat.<your-zone>` |

After deploy finishes, you are sent to `https://chat.<zone>/setup?install=complete` to connect Planning Center and finish first-time configuration.

### Hosting (CCO-operated on Cloudflare)

The install wizard lives at **[https://setup-c.co](https://setup-c.co)** on Cloudflare:

| Component | Worker / project | Routes |
|-----------|------------------|--------|
| Install UI | `cco-install` (OpenNext Pages) | `setup-c.co` |
| Install API | `cco-install-orchestrator` | `setup-c.co/api/*`, `setup-c.co/health` |

The UI calls the API **same-origin** (`/api/session`, etc.). Deploy both from the repo:

```bash
export CLOUDFLARE_API_TOKEN=...
./deploy/cloudflare/deploy-setup-c.sh
```

Before first deploy: create the `INSTALL_SESSIONS` KV namespace, set its id in `workers/install-orchestrator/wrangler.jsonc`, and run `wrangler secret put TOKEN_ENCRYPTION_KEY` on the orchestrator worker.

### Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account on the **Workers Paid** plan (~$5/month minimum)
- A domain (zone) on that account with DNS managed by Cloudflare
- A [Planning Center](https://developer.planning.center/) developer app (configured in step 5)

### Cloudflare API token permissions

Cloudflare does not offer third-party OAuth for “deploy into your account.” Create a **Custom Token** at [API Tokens](https://dash.cloudflare.com/profile/api-tokens) with at least:

**Account** (all resources in your account):

| Permission | Level |
|------------|-------|
| Workers Scripts | Edit |
| D1 | Edit |
| Workers KV Storage | Edit |
| Workers R2 Storage | Edit |
| Queues | Edit |
| Secrets Store | Write |
| Realtime | Edit or Admin |
| Account Settings | Read |

**Zone** — Include → Specific zone → your church domain:

| Permission | Level |
|------------|-------|
| Zone | Read |
| DNS | Edit |
| Workers Routes | Edit |
| Cache Rules | Edit |

**User:**

| Permission | Level |
|------------|-------|
| User Details | Read |

**Notes:**

- **Workers Scripts → Edit** is also required for Durable Object migrations on `cco-realtime-fanout` and for Smart Placement / fixed-region placement on `cco-api` and `cco-realtime-fanout`.
- **Queues → Edit** covers both the push queue (`cco-push-notifications`) and its dead-letter queue (`cco-push-notifications-dlq`).

#### Preflight (what each step actually checks)

| When | Checked |
|------|---------|
| **Step 2** (paste token) | Token is **Active** (`/user/tokens/verify`) and can list accounts — not the full deploy permission set |
| **Step 3** (domains) | Zone list for the token (**Zone → Read**) |
| **Step 4** (deploy) | Full permission table above (D1, Workers, R2, KV, Queues + DLQ, Secrets Store, Realtime, DNS, routes, cache rules, etc.) |
| **Admin → Updates → Apply** | Subset only: Active token, **Workers Scripts → Edit**, **R2 → Edit**, **Secrets Store → Write**, **Workers Routes → Edit** on configured chat and API hostnames (no D1/KV/Queues/DNS preflight) |

The wizard links to the token page from step 2. Paste the token once; it is stored in your account **Secrets Store** (not in the app database) and used to provision and update Workers in **your** account. Admin integration secret changes write to the same store and take effect without redeploying Workers.

**Existing BYO churches:** after upgrading, run **Admin → Updates → Apply** once so legacy encrypted D1 secrets are copied into Secrets Store and worker bindings are refreshed.

### What gets provisioned

Runtime stack (100% Cloudflare-native) in your account:

- **D1** — `cco` database with baseline schema (single migration)
- **Five API Workers** — `cco-api` (main API; Giphy at `/v1/giphy` with session auth), `cco-pco-webhook`, `cco-realtime-fanout` (Durable Objects), `cco-push-consumer`, `cco-reconcile-cron`
- **cco-web** — OpenNext Pages worker on `chat.<zone>`
- **Routes** — API hostname routes (webhooks, WebSocket, catch-all) plus chat custom domain or zone route
- **R2** — attachments bucket with CORS for browser uploads
- **KV** — presence and deploy-status namespaces
- **Queues** — `cco-push-notifications` with dead-letter queue `cco-push-notifications-dlq`
- **Secrets Store** — org integration and platform secrets (worker bindings; not stored in D1)
- **Cache rules** — R2 presigned attachment caching on the zone
- **DNS** — proxied records for chat and API hostnames
- **RealtimeKit** — audio/video (auto-provisioned when the token has Realtime permission)

See [workers/README.md](../../workers/README.md) and [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md) for operator and developer details.

### Cost expectations (small church)

| Resource | Typical usage | Notes |
|----------|---------------|-------|
| Workers Paid | Required | ~$5/month minimum |
| D1 | &lt; 100 MB | 5 GB included on Paid |
| R2 | &lt; 10 GB media | 10 GB free tier |
| RealtimeKit | Light calls | Beta pricing; GA may be per-minute |
| Durable Objects | Active chat hours | 1M requests/month included |

The wizard notes Workers Paid and possible RealtimeKit charges after beta.

---

## Troubleshooting

### Token verification fails or “permission denied”

**Symptoms:** Step 2 returns an error immediately after paste; deploy steps fail with Cloudflare API 403.

**Step 2 vs deploy:** A successful paste in step 2 only confirms the token is **Active** and can list accounts. It does **not** preflight deploy permissions. Missing scopes usually surface during **step 4 (deploy)** with 403 on a specific provision step.

**Checks:**

1. Token status is **Active** in [API Tokens](https://dash.cloudflare.com/profile/api-tokens) (required for step 2).
2. For deploy failures, every permission in the table above is present — missing **D1 Edit**, **Workers Scripts Edit**, **Zone → Read**, or **Queues Edit** (queue + DLQ) are common causes.
3. **Zone resources** include the zone you select in step 3 (not “All zones” only on account-scoped permissions).
4. **Account Settings → Read** is set if the wizard cannot list accounts in step 2.
5. Regenerate the token if it was created before upgrading to Workers Paid.

**Fix:** Create a new custom token with the **full** permission set before starting deploy (step 4). Paste it in step 2 to store it; if deploy already failed, paste the corrected token in step 2 again (or update via **Admin → Integrations**) and retry deploy.

### Zone / SSL errors on domain step

**Symptoms:** Cannot proceed from Domains; hostnames rejected; HTTPS errors after deploy.

**Checks:**

1. The zone status is **active** in Cloudflare DNS (nameservers point to Cloudflare).
2. `chat.<zone>` and `api.<zone>` are hostnames **on that zone** (defaults are correct for most churches).
3. **SSL/TLS** → Overview: encryption mode **Full** or **Full (strict)** (not Off).
4. **SSL/TLS** → Edge Certificates: **Always Use HTTPS** enabled.
5. Universal SSL certificate covers the zone (no pending DCV for the apex if you use custom hostnames).

**Fix:** Resolve DNS/SSL in the Cloudflare dashboard, wait for certificate issuance (up to ~24 hours for new zones), then restart deploy from step 4.

### D1 errors during deploy

**Symptoms:** `create_d1` or `migrate_d1` step shows **failed**; message mentions D1 limit, database count, or migration SQL.

**Checks:**

1. Account is on **Workers Paid** — free Workers-only accounts have tight D1 limits.
2. You have not exceeded **D1 databases per account** (delete unused test `cco` databases in **Workers & Pages → D1** if you re-ran install many times).
3. Total storage is under your plan limit (see **D1** in the dashboard).
4. If `migrate_d1` fails, open the failed step error text — baseline SQL fetch failures often mean a transient network issue; retry deploy.

**Fix:**

- Remove stale test databases named `cco` from previous attempts.
- Confirm Paid plan, then use **Start deploy** again (or refresh `setup-c.co` and resume if the session is still active).
- For persistent migration errors, note the step error and check [GitHub issues](https://github.com/BA-LSC/CCO/issues).

### Provision stuck or incomplete

- Refresh only after checking **Deploy progress** — closing the tab does not cancel Cloudflare-side work, but you may need a new session if the session expired.
- Confirm `https://api.<zone>/health` returns `{"ok":true}` after completion.
- Planning Center setup must use the exact redirect and webhook URLs shown on `/setup`.

### Planning Center redirect mismatch

Register **exact** URIs from `/setup` in your PCO developer app:

- `https://chat.<zone>/api/auth/pco/callback`
- `https://api.<zone>/auth/pco/mobile/callback`
- Webhook: `https://api.<zone>/webhooks/pco`

---

## Local development (install app)

Contributors can run the install UI and orchestrator locally:

```bash
# Orchestrator (default :8787)
cd workers/install-orchestrator && npx wrangler dev

# Install UI (points at orchestrator)
cd apps/install && bun install && bun run dev
```

Set `NEXT_PUBLIC_INSTALL_API_URL` if the API is not on `http://localhost:8787`. See `workers/install-orchestrator/.dev.vars.example`.

### Automated E2E (Playwright)

From the repo root (or `apps/install`):

```bash
cd apps/install && bun install && bunx playwright install chromium
bun run test:e2e
```

Tests mock the install orchestrator API by default (no real Cloudflare token required). Optional flags:

| Variable | Purpose |
|----------|---------|
| `INSTALL_E2E_LIVE=1` | Run the live orchestrator health probe against `INSTALL_API_URL` (default `:8787`) |
| `INSTALL_E2E_SKIP_WEB_SERVER=1` | Reuse an already-running install UI on `:3002` |
| `WEB_URL` | Base URL for the PCO setup handoff test (default `http://localhost:3000`; skipped if unreachable) |

---

## Smoke checklist (manual, post-deploy)

Use this after a real browser install or staging run. Check each item before calling the church “live.”

- [ ] **Fresh Cloudflare account** (or delete prior `cco` test resources from earlier attempts)
- [ ] **Complete install wizard in browser only** — no SSH, Docker, or `wrangler`
- [ ] **`https://api.<zone>/health`** returns `{"ok":true}` (or equivalent)
- [ ] **`https://chat.<zone>/setup?install=complete`** loads; webhook URL shows `https://api.<zone>/webhooks/pco`
- [ ] **PCO sign-in** from setup; OAuth redirect URIs match the values on `/setup`
- [ ] **Group sync** — at least one Planning Center group appears in the sidebar
- [ ] **Send message** in a channel; **realtime update** appears without full page refresh
- [ ] **Upload image** — attachment stored (R2) and visible in thread
- [ ] **RealtimeKit call** — start/join audio or video when RealtimeKit is configured
- [ ] **Web Push notification** — subscribe and receive a test push (queue consumer healthy)
- [ ] **PCO membership webhook** — add/remove test member in PCO; roster updates in CCO

### Full verification suite (contributors)

```bash
bun run build:packages
bun test packages services/api workers
bun run typecheck
cd apps/install && bun run test:e2e
```

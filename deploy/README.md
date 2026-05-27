# Production deployment

> **Recommended for new churches:** install in your own Cloudflare account with the browser wizard at **[https://setup-c.co](https://setup-c.co)** — no VPS, Docker, or SSH. Full guide: **[docs/install/README.md](../docs/install/README.md)** (token permissions, zone SSL, D1 limits, and wizard steps).

The sections below are **Advanced: Self-host on a server** — Docker on a Linux VPS, **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** (no public HTTP/S ports), PostgreSQL, Redis, and containerized API + web services. Use this path when you need full control over the stack, an existing Postgres deployment, or self-hosted infrastructure instead of the Cloudflare Workers + D1 greenfield install.

---

## Advanced: Self-host on a server

Deploy **CCO (Chat Center Online)** on a single Linux server.

**Time:** ~30 minutes (excluding DNS propagation)

**Result:**

| Service | Example URL |
|---------|-------------|
| Web app | `https://chat.example.com` |
| API (REST, WebSocket, uploads, webhooks) | `https://api.example.com` |

### Quick deploy (one command)

On any fresh Linux server (Ubuntu, Debian, Vultr, etc.):

```bash
curl -fsSL https://raw.githubusercontent.com/BA-LSC/CCO/main/deploy/install.sh | bash
```

That installs Docker if needed, clones CCO, and runs an interactive wizard for:

- Cloudflare account, tunnel, security hardening, and VPS firewall (step-by-step)
- Database: bundled Postgres, Vultr VPC, or external URL
- Deploy

Traffic flows: **User → Cloudflare edge → cloudflared → Docker (web/api)**. The VPS does not expose ports 80/443.

Planning Center OAuth is configured in the browser at `/setup` after deploy.

**Custom clone URL or install path:**

```bash
CCO_REPO=https://github.com/you/your-fork.git CCO_DIR=/opt/cco \
  curl -fsSL https://raw.githubusercontent.com/BA-LSC/CCO/main/deploy/install.sh | bash
```

**Already have the repo:**

```bash
chmod +x deploy/*.sh
./deploy/install.sh
```

Verify after deploy:

```bash
cd ~/cco   # or your CCO_DIR
./deploy/compose.sh ps
curl -s "https://api.example.com/health"
# {"ok":true}
```

Open `https://chat.example.com/setup` and complete first-time app setup.

#### Scripts

| Script | Purpose |
|--------|---------|
| `deploy/install.sh` | **Start here** — clone/update + full wizard |
| `deploy/setup.sh` | Same wizard (if repo already cloned) |
| `deploy/bootstrap.sh` | Deploy when `.env` is already complete |
| `deploy/update.sh` | **Day-two updates** — `git pull`, selective build, migrate, restart |
| `deploy/compose.sh` | Day-two `docker compose` (auto picks DB mode) |
| `deploy/check-database.sh` | Test `DATABASE_URL` only |
| `deploy/configure-vultr-db.sh` | Vultr `DATABASE_URL` only (also in setup) |
| `deploy/harden-server.sh` | Optional UFW: SSH only, no public web ports |

External PostgreSQL is auto-detected from `DATABASE_URL`. Set `BUNDLED_DATABASE=1` to force the container.

For manual `.env` editing and troubleshooting, continue below.

#### Selective deploy builds

`./deploy/update.sh` builds only images affected by the pulled commits (API package changes → `migrate` + `api`; web changes → `web`). Override when needed:

```bash
./deploy/update.sh --all          # rebuild migrate, api, and web
./deploy/update.sh --api-only     # migrate + api only
./deploy/update.sh --web-only     # web only
./deploy/bootstrap.sh --all       # same flags without git pull
```

#### Docker registry build cache (optional)

Set `CCO_BUILD_CACHE_IMAGE` in `.env` to a registry prefix (e.g. `ghcr.io/org/cco/cache`) before deploy. Builds use `docker buildx` with `--cache-from` / `--cache-to` for faster VPS rebuilds. Requires `docker buildx` and registry push access.

---

## Legacy quick deploy (manual clone)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
git clone https://github.com/BA-LSC/CCO.git cco
cd cco
./deploy/install.sh
```

---

## Vultr — easy commands

### Cloudflare (do this first)

Domain on Cloudflare (free). Run `./deploy/setup.sh` — it walks through creating a **Cloudflare Tunnel** in the dashboard step by step. No A records to your Vultr IP required.

See [Cloudflare Tunnel](#4-cloudflare-tunnel).

### Option A — VPS + bundled PostgreSQL

```bash
ssh root@<Vultr-IPv4>
curl -fsSL https://get.docker.com | sh
usermod -aG docker "$USER"
# Log out and back in

git clone https://github.com/<org>/<repo>.git cco
cd cco
chmod +x deploy/*.sh
./deploy/setup.sh
```

At the database prompt, choose **1** (bundled). Optional: `sudo ./deploy/harden-server.sh` (SSH only — no public HTTP/S).

### Option B — VPS + managed PostgreSQL (VPC)

**Vultr panel** (once): [VPC](#5-optional-vultr-managed-postgresql-vpc) → attach VPS → **Databases** → PostgreSQL 18 on that VPC → database `cco` → copy **VPC** connection details.

```bash
ssh root@<Vultr-IPv4>
curl -fsSL https://get.docker.com | sh
usermod -aG docker "$USER"
# Log out and back in

git clone https://github.com/<org>/<repo>.git cco
cd cco
chmod +x deploy/*.sh
./deploy/setup.sh
```

At the database prompt, choose **2** and enter VPC host, port, user, and password from the Vultr panel (`sslmode=require` is applied automatically).

**Or** configure DB separately:

```bash
./deploy/configure-vultr-db.sh
./deploy/check-database.sh
./deploy/bootstrap.sh
```

### Verify

```bash
curl -s "https://api.example.com/health"
# {"ok":true}
```

Open `https://chat.example.com/setup`.

### Day-two

```bash
./deploy/update.sh
./deploy/compose.sh ps
./deploy/compose.sh logs -f api
./deploy/compose.sh --profile jobs run --rm reconcile
```

---

## Requirements

- **Server:** Ubuntu 22.04+ or similar (2 GB RAM minimum, 4 GB recommended)
- **Docker:** Engine 24+ and Docker Compose v2
- **DNS:** [Cloudflare](https://dash.cloudflare.com/) proxied CNAMEs for `chat` and `api` on your zone (e.g. `chat.example.com`, `api.example.com`)
- **Domains:** `chat.example.com` (web), `api.example.com` (API)
- **Planning Center:** Developer app at [developer.planning.center](https://developer.planning.center/)

---

## Optional: Deploy on Vultr (panel checklist)

Use the [Vultr easy commands](#vultr--easy-commands) above for copy-paste deploy. This section is the Vultr control-panel checklist.

### 1. Create a cloud instance

1. Sign in at [vultr.com](https://www.vultr.com/) → **Deploy** → **Cloud Compute**.
2. **Image:** Ubuntu 22.04 LTS.
3. **Plan:** at least **4 GB RAM** / 2 vCPU (2 GB works for small pilots).
4. **Region:** closest to your users.
5. **SSH keys:** add your public key (recommended).
6. Deploy and note the instance **IPv4 address**.

### 2. Firewall

**Vultr control panel** → your instance → **Settings** → **Firewall** (or account firewall group):

| Protocol | Port | Notes |
|----------|------|--------|
| TCP | 22 | SSH (restrict source IPs if possible) |

Do **not** open 80/443 — CCO uses Cloudflare Tunnel (outbound only). Optional: `sudo ./deploy/harden-server.sh` on the server.

**On the server** (after SSH), run `./deploy/harden-server.sh` or configure UFW manually ([Cloudflare Tunnel](#4-cloudflare-tunnel)).

### 3. DNS (Cloudflare)

Use a Cloudflare Tunnel — see [section 4](#4-cloudflare-tunnel). Proxied CNAME records point to the tunnel, not your Vultr IP.

### 4. Deploy on the server

Same as [Option A or B](#vultr--easy-commands): `chmod +x deploy/*.sh && ./deploy/setup.sh`.

### 5. Optional: Vultr Managed PostgreSQL (VPC)

Use this when you want PostgreSQL off the app server (managed backups, less disk on the VPS, or multiple app nodes later). Traffic stays on Vultr’s private network when both the VPS and database are in the **same VPC and region**.

#### A. Create a VPC

1. [Vultr](https://my.vultr.com/) → **Products** → **Network** → **VPC** → **Add VPC**.
2. Pick the **same region** you will use for the Cloud Compute instance and the database.
3. Note the VPC (you will attach both the server and the database to it).

If the VPS already exists without a VPC, attach it: instance → **Settings** → **IPv4** → **VPC Networks** → assign the VPC.

#### B. Create the managed database

1. **Products** → **Databases** → **Deploy new database**.
2. **Engine:** PostgreSQL **18** (match the bundled container version).
3. **Region:** same as the VPS.
4. **VPC network:** select the VPC from step A.
5. Choose a plan and deploy.
6. In the database dashboard:
   - Create a database named `cco` (or use `defaultdb` and set `POSTGRES_DB=defaultdb` in `.env`).
   - Copy the **VPC** connection details (host, port, user, password) — not the public endpoint if you disabled public access.

#### C. Lock down access

In the managed database **Settings**:

- Prefer **VPC-only** access (no public internet) when the app server is on that VPC.
- Under **Trusted Sources**, allow the VPC and/or your compute instance as required by the Vultr UI for your account.

#### D. Configure and deploy

Included in `./deploy/setup.sh` (database option **2**), or run:

```bash
./deploy/configure-vultr-db.sh
./deploy/check-database.sh
./deploy/bootstrap.sh
```

`sslmode=require` is added automatically for `*.vultrdb.com`. The bundled `postgres` container is skipped when `DATABASE_URL` is external. Set `BUNDLED_DATABASE=1` to force the container.

Backups: use **Vultr Managed Database** automated backups in the panel, not local `pg_dump`.

---

## Architecture

```
Internet
   │
   ▼
┌──────────────┐     outbound only
│  Cloudflare  │◀──── cloudflared (Docker)
│     edge     │
└──────┬───────┘
       │ tunnel
       ▼
┌─────────┐     ┌─────┐     ┌──────────┐
│ web     │────▶│ api │────▶│ postgres │
│ :3000   │     │:3001│     └──────────┘
└─────────┘     └──┬──┘
                   └──▶ redis
```

- **cloudflared** connects outbound to Cloudflare — no public ports on the VPS.
- **Web** serves the Next.js UI; browser calls `/api/v1/*` on the web host, proxied to the API on the internal Docker network.
- **WebSocket clients** connect to the API domain (`NEXT_PUBLIC_WS_URL`).
- **OAuth:** web callback on the web host; API handles exchange and mobile callbacks on the API host.
- **Uploads** live in a Docker volume on the API container (`/data/uploads`).
- **PostgreSQL:** runs in Docker by default, or on [Vultr Managed Database over VPC](#5-optional-vultr-managed-postgresql-vpc) when `DATABASE_URL` points at an external host.

---

## 1. Install Docker

On Ubuntu (including Vultr):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Log out and back in (or start a new SSH session) so the `docker` group applies, then:

```bash
docker compose version
```

---

## 2. Clone the repository

```bash
git clone https://github.com/<org>/<repo>.git cco
cd cco
```

Use the HTTPS or SSH URL from your GitHub repository page.

---

## 3. Configure environment

**Recommended:** run `./deploy/setup.sh` (generates secrets and derived URLs).

**Manual:** `cp deploy/.env.production.example .env` and edit. Required values:

| Variable | Description |
|----------|-------------|
| `CCO_DOMAIN` | Public web hostname (e.g. `chat.example.com`) |
| `API_DOMAIN` | Public API hostname (e.g. `api.example.com`) |
| `WEB_URL` | `https://` + `CCO_DOMAIN` |
| `NEXT_PUBLIC_WS_URL` | `wss://` + `API_DOMAIN` |
| `NEXT_PUBLIC_WEB_URL` | Same as `WEB_URL` |
| `PUBLIC_UPLOAD_URL` | `https://` + `CCO_DOMAIN` + `/api/v1/uploads` (same-origin image proxy) |
| `PCO_CLIENT_ID` / `PCO_CLIENT_SECRET` | Optional in `.env` — enter at `/setup` after deploy (stored encrypted in DB) |
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters — loss makes DB secrets unrecoverable |
| `PCO_WEB_REDIRECT_URI` | `https://<CCO_DOMAIN>/api/auth/pco/callback` |
| `PCO_REDIRECT_URI` | `https://<API_DOMAIN>/auth/pco/callback` |
| `PCO_MOBILE_REDIRECT_URI` | `https://<API_DOMAIN>/auth/pco/mobile/callback` |
| `SESSION_SECRET` | 32+ random characters |
| `POSTGRES_PASSWORD` | Strong password (bundled DB only; not used with Vultr managed DB) |
| `DATABASE_URL` | Bundled: `@postgres:5432`. Vultr: `./deploy/configure-vultr-db.sh` ([managed DB](#5-optional-vultr-managed-postgresql-vpc)) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Run token (created by setup API automation, or pasted manually) |

> **Important:** `NEXT_PUBLIC_*` values are baked into the web image at **build time**. After changing them:
>
> ```bash
> ./deploy/compose.sh up -d --build web
> ```

---

## 4. Cloudflare Tunnel

Production uses **Cloudflare Tunnel only** — no A records to your VPS IP and no Caddy/Let’s Encrypt on the server.

### Prerequisites

1. Domain on Cloudflare (Free plan).
2. [Zero Trust](https://one.dash.cloudflare.com/) enabled (free).

### Setup (API — recommended)

Run `./deploy/setup.sh`. Step 2 uses a **Cloudflare API token** to automatically:

1. Create a Cloudflare Tunnel
2. Configure ingress (`http://web:3000`, `http://api:3001`)
3. Create proxied CNAME records for both hostnames
4. Start `cloudflared` on the server so the connector shows as connected

Create a token at [API Tokens](https://dash.cloudflare.com/profile/api-tokens) — **Create Custom Token** with:

| Scope | Permission | Access |
|-------|------------|--------|
| Account | Cloudflare One Connectors | **Edit** |
| Zone | **DNS** (not DNS Settings) | **Edit** |

**Zone Resources:** Include → Specific zone → your domain.

If the wizard cannot find your account automatically, add **Account → Account Settings → Read**, or paste Account ID from the dashboard when prompted.

Not required: WARP, Access, Workers, or `pkg.cloudflareclient.com` (WARP client — CCO uses `cloudflared` in Docker).

Manual fallback: say **No** at the API prompt and paste the Docker install command from Zero Trust instead.

### Security hardening (free)

During setup, confirm these in the Cloudflare dashboard:

- **Security → Settings:** Security Level High, Bot Fight Mode, Browser Integrity Check
- **SSL/TLS → Edge Certificates:** Always Use HTTPS, TLS 1.2+, Automatic HTTPS Rewrites
- **DNS:** both hostnames **Proxied** (orange cloud)

Optional on the VPS: `sudo ./deploy/harden-server.sh` (UFW: SSH only).

### Verify

```bash
./deploy/compose.sh logs cloudflared
curl -s "https://api.example.com/health"
```

`cloudflared` should show registered connections. Health check returns `{"ok":true}`.

---

## 5. Configure Planning Center

In your [Planning Center developer app](https://developer.planning.center/):

### OAuth redirect URIs

Add **exactly** (the `/setup` wizard shows the same URIs for your deployment):

- `https://chat.example.com/api/auth/pco/callback` (your `PCO_WEB_REDIRECT_URI`)
- `https://api.example.com/auth/pco/mobile/callback` (your `PCO_MOBILE_REDIRECT_URI`)

### Webhooks (recommended)

```text
https://api.example.com/webhooks/pco
```

Subscribe to:

- `groups.v2.events.membership.created`
- `groups.v2.events.membership.updated`
- `groups.v2.events.membership.destroyed`
- `people.v2.events.person.updated`

Set each subscription's `authenticity_secret` in **`/setup`** (one per line — stored encrypted in the database).

---

## 6. Deploy

From the repository root (if you already ran `setup.sh`, skip to verify):

```bash
chmod +x deploy/*.sh
./deploy/bootstrap.sh
```

Or run the full wizard again: `./deploy/setup.sh`

### Verify

```bash
./deploy/compose.sh ps
curl -s "https://api.example.com/health"
```

Expected: `{"ok":true}`

---

## 7. Nightly reconcile job

CCO re-syncs groups from Planning Center on a schedule. On the host, add cron (example: 3 AM daily):

```bash
crontab -e
```

```cron
0 3 * * * cd /home/user/cco && ./deploy/compose.sh --profile jobs run --rm reconcile >> /var/log/cco-reconcile.log 2>&1
```

Replace `/home/user/cco` with your clone path. `./deploy/compose.sh` works for both bundled and Vultr managed databases.

---

## 8. First-time setup

1. Open `https://<CCO_DOMAIN>/setup` (or sign in — you will be redirected if setup is incomplete).
2. Enter organization name, Planning Center **Client ID** / **Client Secret**, and webhook secret.
3. Copy the redirect and webhook URLs shown in the wizard into your PCO developer app (must match character-for-character).
4. Sign in with a Planning Center **organization admin** account to finish setup.
5. After setup, OAuth credentials in `.env` are ignored; the API reads encrypted values from the database.

---

## Operations

Use `./deploy/compose.sh` for all commands below (picks bundled vs external PostgreSQL from `.env`).

### View logs

```bash
./deploy/compose.sh logs -f api
./deploy/compose.sh logs -f web
./deploy/compose.sh logs -f cloudflared
```

### Run migrations after pulling updates

Migrations run automatically during `./deploy/update.sh` and `./deploy/bootstrap.sh`. To run them alone:

```bash
./deploy/compose.sh run --rm migrate
```

### Restart a service

```bash
./deploy/compose.sh restart api
```

### Update to a new release

```bash
./deploy/update.sh
```

### Backups

**Bundled PostgreSQL** (default):

```bash
./deploy/compose.sh exec -T postgres pg_dump -U cco cco > "cco-backup-$(date +%F).sql"
```

**Vultr Managed Database:** enable automated backups in the Vultr database dashboard; optional manual dump from the VPS using the VPC `DATABASE_URL` and `psql`/`pg_dump`.

Always back up the `uploads_data` volume (and `postgres_data` when using the bundled database) before major upgrades.

### Stop everything

```bash
./deploy/compose.sh down
```

Add `-v` only if you intend to **delete all data** (database, uploads, TLS certs).

---

## Troubleshooting

**Browser install at [setup-c.co](https://setup-c.co):** token permissions, zone SSL, and D1 limits are covered in **[docs/install/README.md](../docs/install/README.md#troubleshooting)**.

### Blank page (no styles)

Rebuild the web image (standalone output requires `prepare-standalone.mjs`):

```bash
./deploy/compose.sh up -d --build web
```

### Tunnel / HTTPS not working

- `./deploy/compose.sh logs cloudflared` — look for `Registered tunnel connection`
- Confirm public hostnames in Zero Trust match `CCO_DOMAIN` and `API_DOMAIN`
- Services must be `http://web:3000` and `http://api:3001` (Docker network names)
- DNS records should be **Proxied** (orange cloud) CNAMEs to `*.cfargotunnel.com`
- Confirm Cloudflare hardening did not block legitimate traffic (try Security Level **High**, not **I'm Under Attack** during setup)

### OAuth redirect mismatch

PCO requires exact URI matches. Compare `.env` / `/setup` URIs with your PCO app settings.

### WebSocket connection fails

- `NEXT_PUBLIC_WS_URL` must be `wss://` + your API domain
- Rebuild web after changing it: `./deploy/compose.sh up -d --build web`

### Database connection errors

- **Bundled DB:** `DATABASE_URL` host must be `postgres` (Docker service name), not `localhost`; password must match `POSTGRES_PASSWORD`
- **Vultr managed DB:** VPC hostname, same region/VPC as the VPS; run `./deploy/check-database.sh` then `./deploy/configure-vultr-db.sh` if needed

### Migrations failed

```bash
./deploy/compose.sh logs migrate
./deploy/compose.sh run --rm migrate
```

If `drizzle-kit migrate` fails, apply SQL files in `services/api/drizzle/` in order (`0000` through `0010`).

---

## File reference

| File | Purpose |
|------|---------|
| `deploy/docker-compose.prod.yml` | Production stack |
| `deploy/docker-compose.external-db.yml` | Overlay when `DATABASE_URL` is external |
| `deploy/Dockerfile.api` | API image |
| `deploy/Dockerfile.web` | Web image (Next.js standalone) |
| `deploy/lib/cloudflare-tunnel.sh` | Tunnel API automation + connector bootstrap |
| `deploy/lib/firewall.sh` | VPS + provider firewall walkthrough |
| `deploy/harden-server.sh` | UFW apply (SSH only) |
| `deploy/.env.production.example` | Environment template |
| `deploy/setup.sh` | Guided setup wizard |
| `deploy/bootstrap.sh` | Validate `.env`, migrate, build, start stack |
| `deploy/update.sh` | Pull latest code and redeploy |
| `deploy/compose.sh` | `docker compose` wrapper for your DB mode |
| `deploy/lib/env.sh` | URL derivation, secret helpers |
| `deploy/lib/database.sh` | Auto-detect external DB, TLS normalization |

---

## Local development

For hot reload without production containers, see the [root README](../README.md).

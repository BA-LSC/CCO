# Production deployment

Deploy **CCO (Chat Center Online)** on a single Linux server with Docker, [Caddy](https://caddyserver.com/) (automatic HTTPS), PostgreSQL, Redis, and containerized API + web services.

**Time:** ~30 minutes (excluding DNS propagation)

**Result:**

| Service | Example URL |
|---------|-------------|
| Web app | `https://chat.example.com` |
| API (REST, WebSocket, uploads, webhooks) | `https://api.chat.example.com` |

---

## Quick deploy (one command)

On any fresh Linux server (Ubuntu, Debian, Vultr, etc.):

```bash
curl -fsSL https://raw.githubusercontent.com/BA-LSC/CCO/main/deploy/install.sh | bash
```

That installs Docker if needed, clones CCO, and runs an interactive wizard for:

- Domains and Let's Encrypt email
- Cloudflare DNS (with your server IP)
- Database: bundled Postgres, Vultr VPC, or external URL
- Deploy

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
curl -s "https://api.chat.example.com/health"
# {"ok":true}
```

Open `https://chat.example.com/setup` and complete first-time app setup.

### Scripts

| Script | Purpose |
|--------|---------|
| `deploy/install.sh` | **Start here** — clone/update + full wizard |
| `deploy/setup.sh` | Same wizard (if repo already cloned) |
| `deploy/bootstrap.sh` | Deploy when `.env` is already complete |
| `deploy/compose.sh` | Day-two `docker compose` (auto picks DB mode) |
| `deploy/check-database.sh` | Test `DATABASE_URL` only |
| `deploy/configure-vultr-db.sh` | Vultr `DATABASE_URL` only (also in setup) |

External PostgreSQL is auto-detected from `DATABASE_URL`. Set `BUNDLED_DATABASE=1` to force the container.

For manual `.env` editing and troubleshooting, continue below.

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

In [Cloudflare](https://dash.cloudflare.com/) → **DNS** → **Records** (grey cloud / **DNS only** on first deploy):

| Type | Name | Content |
|------|------|---------|
| A | `chat` | `<Vultr IPv4>` |
| A | `api.chat` | `<Vultr IPv4>` |

Verify: `dig +short chat.example.com` → your Vultr IP.

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

At the database prompt, choose **1** (bundled). Open firewall ports 80/443 in Vultr and UFW ([server firewall](#4-configure-dns-cloudflare)).

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
curl -s "https://api.chat.example.com/health"
# {"ok":true}
```

Open `https://chat.example.com/setup`.

### Day-two

```bash
./deploy/compose.sh ps
./deploy/compose.sh logs -f api
./deploy/compose.sh run --rm migrate          # after git pull
./deploy/compose.sh --profile jobs run --rm reconcile
```

---

## Requirements

- **Server:** Ubuntu 22.04+ or similar (2 GB RAM minimum, 4 GB recommended)
- **Docker:** Engine 24+ and Docker Compose v2
- **DNS:** [Cloudflare](https://dash.cloudflare.com/) with A records for `chat` and `api.chat` → server IP
- **Domains:** `chat.example.com` (web), `api.chat.example.com` (API)
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
| TCP | 80 | HTTP (Let’s Encrypt + redirects) |
| TCP | 443 | HTTPS |

**On the server** (after SSH), also allow HTTP/HTTPS with UFW (step in [Configure DNS (Cloudflare)](#4-configure-dns-cloudflare)).

### 3. DNS (Cloudflare)

Point both hostnames at the Vultr instance IPv4 in [Cloudflare](#4-configure-dns-cloudflare) (same records as any other server).

Wait for propagation (`dig +short chat.example.com` should return your server IP) before `./deploy/setup.sh`.

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
┌─────────┐     ┌─────┐     ┌──────────┐
│  Caddy  │────▶│ web │────▶│   api    │
│  :443   │     │:3000│     │  :3001   │
└─────────┘     └─────┘     └────┬─────┘
   │                              │
   │                              ├──▶ postgres
   │                              └──▶ redis
   │
   └──▶ api (direct for WS, uploads, webhooks)
```

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
| `API_DOMAIN` | Public API hostname (e.g. `api.chat.example.com`) |
| `WEB_URL` | `https://` + `CCO_DOMAIN` |
| `NEXT_PUBLIC_WS_URL` | `wss://` + `API_DOMAIN` |
| `NEXT_PUBLIC_WEB_URL` | Same as `WEB_URL` |
| `PUBLIC_UPLOAD_URL` | `https://` + `API_DOMAIN` + `/uploads` |
| `PCO_CLIENT_ID` / `PCO_CLIENT_SECRET` | Optional in `.env` — enter at `/setup` after deploy (stored encrypted in DB) |
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters — loss makes DB secrets unrecoverable |
| `PCO_WEB_REDIRECT_URI` | `https://<CCO_DOMAIN>/api/auth/pco/callback` |
| `PCO_REDIRECT_URI` | `https://<API_DOMAIN>/auth/pco/callback` |
| `PCO_MOBILE_REDIRECT_URI` | `https://<API_DOMAIN>/auth/pco/mobile/callback` |
| `SESSION_SECRET` | 32+ random characters |
| `POSTGRES_PASSWORD` | Strong password (bundled DB only; not used with Vultr managed DB) |
| `DATABASE_URL` | Bundled: `@postgres:5432`. Vultr: `./deploy/configure-vultr-db.sh` ([managed DB](#5-optional-vultr-managed-postgresql-vpc)) |
| `CADDY_EMAIL` | Email for Let’s Encrypt notifications |

> **Important:** `NEXT_PUBLIC_*` values are baked into the web image at **build time**. After changing them:
>
> ```bash
> ./deploy/compose.sh up -d --build web
> ```

---

## 4. Configure DNS (Cloudflare)

Set up DNS in [Cloudflare](https://dash.cloudflare.com/) **before** starting Caddy (Let’s Encrypt must reach your server on ports 80/443).

### Add your domain

1. **Websites** → **Add a site** → enter `example.com` → choose a plan (Free is fine).
2. Cloudflare shows two nameservers — at your domain registrar, replace existing NS records with those nameservers.
3. Wait until the site status is **Active** in Cloudflare.

### Create records

**DNS** → **Records** → add:

| Type | Name | Content | Proxy status |
|------|------|---------|----------------|
| A | `chat` | Your server IPv4 | **DNS only** (grey cloud) |
| A | `api.chat` | Your server IPv4 | **DNS only** (grey cloud) |

Use **DNS only** on the first deploy so Caddy can complete the Let’s Encrypt HTTP challenge directly to your origin. After HTTPS works, you may switch to **Proxied** (orange cloud) on both records and set **SSL/TLS** → **Overview** → **Full (strict)**.

Optional: add AAAA records with the same names if your server has IPv6.

### Verify propagation

```bash
dig +short chat.example.com
dig +short api.chat.example.com
```

Both should return your server IP (not Cloudflare edge IPs) while records are DNS only.

### Cloudflare tips (after go-live)

- **WebSockets:** required for chat — enabled by default on proxied zones; keep `api.chat` proxied if you use orange cloud for that host.
- **Always Use HTTPS:** **SSL/TLS** → **Edge Certificates** → enable after origin certificates are working.
- **OAuth / webhooks:** PCO must reach your public URLs; proxied `api.chat` is fine once SSL mode is **Full (strict)**.

### Server firewall

Open ports **80** and **443** on the host (and your cloud provider firewall, e.g. Vultr):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 5. Configure Planning Center

In your [Planning Center developer app](https://developer.planning.center/):

### OAuth redirect URIs

Add **exactly** (the `/setup` wizard shows the same URIs for your deployment):

- `https://chat.example.com/api/auth/pco/callback` (your `PCO_WEB_REDIRECT_URI`)
- `https://api.chat.example.com/auth/pco/mobile/callback` (your `PCO_MOBILE_REDIRECT_URI`)

### Webhooks (recommended)

```text
https://api.chat.example.com/webhooks/pco
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
curl -s "https://api.chat.example.com/health"
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
./deploy/compose.sh logs -f caddy
```

### Run migrations after pulling updates

```bash
git pull
./deploy/compose.sh build migrate api
./deploy/compose.sh run --rm migrate
./deploy/compose.sh up -d api
```

### Restart a service

```bash
./deploy/compose.sh restart api
```

### Update to a new release

```bash
git pull
./deploy/compose.sh up -d --build
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

### Blank page (no styles)

Rebuild the web image (standalone output requires `prepare-standalone.mjs`):

```bash
./deploy/compose.sh up -d --build web
```

### Caddy fails to obtain certificates

- `dig +short chat.example.com` must return your **origin** IP while records are **DNS only** in Cloudflare
- If records are **Proxied**, set SSL/TLS to **Full (strict)** only after Caddy has a certificate, or temporarily set both hosts to **DNS only** and redeploy
- Ports 80/443 must be open on the host and cloud firewall (Vultr, etc.)
- `./deploy/compose.sh logs caddy`

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
| `deploy/Caddyfile` | Reverse proxy + TLS |
| `deploy/.env.production.example` | Environment template |
| `deploy/setup.sh` | Guided setup wizard |
| `deploy/bootstrap.sh` | Validate `.env`, test DB, start stack |
| `deploy/compose.sh` | `docker compose` wrapper for your DB mode |
| `deploy/lib/env.sh` | URL derivation, secret helpers |
| `deploy/lib/database.sh` | Auto-detect external DB, TLS normalization |

---

## Local development

For hot reload without production containers, see the [root README](../README.md).

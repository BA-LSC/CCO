# Deploy entrypoint for the OpenNext web worker.
# Build output and wrangler config live in apps/web (required by @opennextjs/cloudflare).

From repo root:

```bash
bun run --cwd apps/web build:cloudflare
cd apps/web && npx wrangler deploy
```

Or use the app script: `bun run --cwd apps/web deploy:cloudflare`

See `deploy/cloudflare/README.md` for environment variables.

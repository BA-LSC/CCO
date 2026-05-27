import {
  createInitialProvisionState,
  listCloudflareAccounts,
  listCloudflareZones,
  loadProvisionState,
  persistProvisionState,
  provisionSessionKey,
  runProvisionPipeline,
  verifyCloudflareApiToken,
  type ProvisionSessionStore,
} from "@cco/cloudflare-provision";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createInstallProvisionHandlers, createWorkerBundleLoader, createReleasesLoader } from "./provision-handlers";
import {
  buildProvisionStatus,
  deleteCloudflareToken,
  loadInstallSession,
  readCloudflareToken,
  saveInstallSession,
  storeCloudflareToken,
  type InstallSession,
} from "./session";

export type InstallOrchestratorEnv = {
  INSTALL_SESSIONS: KVNamespace;
  /** Static release artifacts (worker bundles, web assets, D1 baseline). */
  RELEASES_ASSETS?: Fetcher;
  CCO_INSTALL_ORIGIN: string;
  TOKEN_ENCRYPTION_KEY: string;
  CCO_WORKER_BUNDLES_BASE_URL?: string;
  CCO_RELEASES_BASE_URL?: string;
  CCO_D1_BASELINE_URL?: string;
};

type Variables = {
  sessionId: string;
  session: InstallSession;
};

function requireEncryptionKey(env: InstallOrchestratorEnv): string {
  const key = env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured on the install orchestrator");
  }
  return key;
}

function kvStore(kv: KVNamespace): ProvisionSessionStore {
  return {
    get: (key) => kv.get(key),
    put: (key, value, options) => kv.put(key, value, options),
  };
}

function installCors(origin: string) {
  return cors({
    origin: (requestOrigin) => {
      if (!requestOrigin) return origin;
      if (requestOrigin === origin) return requestOrigin;
      if (origin.startsWith("http://localhost") && requestOrigin.startsWith("http://localhost")) {
        return requestOrigin;
      }
      return origin;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  });
}

async function requireSession(
  c: { env: InstallOrchestratorEnv; req: { header: (name: string) => string | undefined } },
): Promise<{ sessionId: string; session: InstallSession } | Response> {
  const sessionId = c.req.header("x-install-session")?.trim();
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "x-install-session header required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session = await loadInstallSession(c.env.INSTALL_SESSIONS, sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Install session not found or expired" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return { sessionId, session };
}

export function createInstallApp() {
  const app = new Hono<{ Bindings: InstallOrchestratorEnv; Variables: Variables }>();

  app.use("/api/*", async (c, next) => {
    await installCors(c.env.CCO_INSTALL_ORIGIN)(c, next);
  });

  app.get("/health", (c) => c.json({ ok: true, service: "cco-install-orchestrator" }));

  app.post("/api/session", async (c) => {
    const body = await c.req
      .json<{ churchName?: string }>()
      .catch((): { churchName?: string } => ({}));
    const churchName = body.churchName?.trim();
    if (!churchName) {
      return c.json({ error: "churchName required" }, 400);
    }

    const sessionId = crypto.randomUUID();
    const session: InstallSession = {
      churchName,
      step: "welcome",
      createdAt: Date.now(),
    };
    await saveInstallSession(c.env.INSTALL_SESSIONS, sessionId, session);
    return c.json({ sessionId, step: session.step });
  });

  app.post("/api/cloudflare/verify", async (c) => {
    const resolved = await requireSession(c);
    if (resolved instanceof Response) return resolved;
    const { sessionId, session } = resolved;

    const body = await c.req
      .json<{ apiToken?: string; accountId?: string }>()
      .catch((): { apiToken?: string; accountId?: string } => ({}));
    const apiToken = body.apiToken?.trim();
    if (!apiToken) {
      return c.json({ error: "apiToken required" }, 400);
    }

    const verified = await verifyCloudflareApiToken(apiToken);
    if (verified.status !== "active") {
      return c.json({ error: "Cloudflare API token is not active" }, 400);
    }

    const accounts = await listCloudflareAccounts(apiToken);
    const accountId = body.accountId?.trim() || accounts[0]?.id;
    if (!accountId) {
      return c.json({ error: "No Cloudflare accounts found for this token" }, 400);
    }

    const updated = await storeCloudflareToken(
      c.env.INSTALL_SESSIONS,
      sessionId,
      { ...session, accountId, step: "cloudflare" },
      apiToken,
      requireEncryptionKey(c.env),
    );

    return c.json({
      ok: true,
      accountId,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      step: updated.step,
    });
  });

  app.get("/api/cloudflare/zones", async (c) => {
    const resolved = await requireSession(c);
    if (resolved instanceof Response) return resolved;
    const { sessionId, session } = resolved;

    let apiToken: string | null;
    try {
      apiToken = await readCloudflareToken(session, requireEncryptionKey(c.env));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Encryption misconfigured" }, 500);
    }
    if (!apiToken) {
      return c.json({ error: "Cloudflare token not configured for this session" }, 400);
    }

    const zones = await listCloudflareZones(apiToken);
    const body = await c.req.query();
    const selectedZoneId = body.zoneId?.trim();

    if (selectedZoneId) {
      const zone = zones.find((z) => z.id === selectedZoneId);
      if (!zone) {
        return c.json({ error: "Zone not found for this token" }, 404);
      }
      const chatHostname = body.chatHostname?.trim() || `chat.${zone.name}`;
      const apiHostname = body.apiHostname?.trim() || `api.${zone.name}`;
      const updated: InstallSession = {
        ...session,
        step: "domains",
        zoneId: zone.id,
        zoneName: zone.name,
        chatHostname,
        apiHostname,
      };
      await saveInstallSession(c.env.INSTALL_SESSIONS, sessionId, updated);
      return c.json({
        zone: { id: zone.id, name: zone.name, status: zone.status },
        chatHostname,
        apiHostname,
        step: updated.step,
      });
    }

    return c.json({
      zones: zones.map((z) => ({ id: z.id, name: z.name, status: z.status })),
    });
  });

  app.post("/api/provision/start", async (c) => {
    const resolved = await requireSession(c);
    if (resolved instanceof Response) return resolved;
    const { sessionId, session } = resolved;

    if (!session.zoneId || !session.chatHostname || !session.apiHostname) {
      return c.json({ error: "Select a zone and hostnames before starting provision" }, 400);
    }

    let apiToken: string | null;
    try {
      apiToken = await readCloudflareToken(session, requireEncryptionKey(c.env));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Encryption misconfigured" }, 500);
    }
    if (!apiToken) {
      return c.json({ error: "Cloudflare token not configured for this session" }, 400);
    }

    const store = kvStore(c.env.INSTALL_SESSIONS);
    const existing = await loadProvisionState(store, sessionId);
    if (!existing) {
      const initial = createInitialProvisionState(session.churchName);
      initial.resources.accountId = session.accountId;
      initial.resources.zoneId = session.zoneId;
      initial.resources.chatHostname = session.chatHostname;
      initial.resources.apiHostname = session.apiHostname;
      await persistProvisionState(store, sessionId, initial, { expirationTtl: 3600 });
    }

    const releasesBase =
      c.env.CCO_RELEASES_BASE_URL?.trim() || c.env.CCO_WORKER_BUNDLES_BASE_URL?.trim();
    const releases = createReleasesLoader(releasesBase);
    const handlers = await createInstallProvisionHandlers({
      readWorkerBundle: createWorkerBundleLoader(
        c.env.CCO_WORKER_BUNDLES_BASE_URL?.trim() || releasesBase,
      ),
      releasesBaseUrl: releases.releasesBaseUrl,
      fetchWebManifest: releases.fetchWebManifest,
      fetchD1BaselineSql: c.env.CCO_D1_BASELINE_URL
        ? async () => {
            const res = await fetch(c.env.CCO_D1_BASELINE_URL!);
            if (!res.ok) {
              throw new Error(`Failed to fetch D1 baseline SQL: HTTP ${res.status}`);
            }
            return res.text();
          }
        : releases.releasesBaseUrl
          ? async () => {
              const res = await fetch(`${releases.releasesBaseUrl}/0000_d1_baseline.sql`);
              if (!res.ok) {
                throw new Error(`Failed to fetch D1 baseline SQL: HTTP ${res.status}`);
              }
              return res.text();
            }
          : undefined,
    });

    const deploySession: InstallSession = { ...session, step: "deploy", provisionJobId: sessionId };
    await saveInstallSession(c.env.INSTALL_SESSIONS, sessionId, deploySession);

    const pipelinePromise = runProvisionPipeline(
      sessionId,
      store,
      {
        apiToken,
        accountId: session.accountId,
        zoneId: session.zoneId,
        chatHostname: session.chatHostname,
        apiHostname: session.apiHostname,
      },
      handlers,
    );

    c.executionCtx.waitUntil(
      pipelinePromise
        .then(async () => {
          const latest = await loadInstallSession(c.env.INSTALL_SESSIONS, sessionId);
          if (latest) {
            await saveInstallSession(c.env.INSTALL_SESSIONS, sessionId, {
              ...latest,
              step: "complete",
            });
            await deleteCloudflareToken(c.env.INSTALL_SESSIONS, sessionId, latest);
          }
        })
        .catch(async (err) => {
          console.error("[install provision]", err);
          const latest = await loadInstallSession(c.env.INSTALL_SESSIONS, sessionId);
          if (latest) {
            await saveInstallSession(c.env.INSTALL_SESSIONS, sessionId, {
              ...latest,
              step: "deploy",
            });
          }
        }),
    );

    return c.json({ ok: true, sessionId, started: true });
  });

  app.get("/api/provision/status", async (c) => {
    const resolved = await requireSession(c);
    if (resolved instanceof Response) return resolved;
    const { sessionId } = resolved;

    const store = kvStore(c.env.INSTALL_SESSIONS);
    const state = await loadProvisionState(store, sessionId);
    if (!state) {
      return c.json({ error: "Provision has not been started for this session" }, 404);
    }

    return c.json(buildProvisionStatus(sessionId, state));
  });

  return app;
}

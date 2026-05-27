import type { BrowserContext } from "@playwright/test";

export const INSTALL_API_URL =
  process.env.INSTALL_API_URL?.replace(/\/+$/, "") ?? "http://localhost:8787";

export const TEST_SESSION_ID = "e2e00000-0000-4000-8000-000000000001";
export const TEST_CHURCH = "Grace E2E Church";
export const TEST_ZONE = {
  id: "zone-e2e-test",
  name: "e2e.test.example.com",
  status: "active",
};
export const TEST_CHAT_HOST = `chat.${TEST_ZONE.name}`;
export const TEST_API_HOST = `api.${TEST_ZONE.name}`;
export const TEST_CHAT_URL = `https://${TEST_CHAT_HOST}`;
export const TEST_WEBHOOK_URL = `https://${TEST_API_HOST}/webhooks/pco`;

const PROVISION_STEPS = [
  "verify_token",
  "create_d1",
  "migrate_d1",
  "create_r2",
  "create_kv",
  "create_queue",
  "deploy_workers",
  "deploy_pages",
  "configure_dns",
  "configure_routes",
  "provision_realtimekit",
  "configure_cache_rules",
  "finalize_org",
  "complete",
] as const;

function completeStepStatus() {
  return Object.fromEntries(
    PROVISION_STEPS.map((step) => [step, { status: "complete" as const }]),
  );
}

function runningStepStatus(runningStep: (typeof PROVISION_STEPS)[number]) {
  const idx = PROVISION_STEPS.indexOf(runningStep);
  return Object.fromEntries(
    PROVISION_STEPS.map((step, i) => {
      if (i < idx) return [step, { status: "complete" as const }];
      if (i === idx) return [step, { status: "running" as const }];
      return [step, { status: "pending" as const }];
    }),
  );
}

export type InstallApiMockState = {
  provisionPolls: number;
};

export async function registerInstallApiMocks(
  context: BrowserContext,
  state: InstallApiMockState = { provisionPolls: 0 },
): Promise<void> {
  const apiPattern = `${INSTALL_API_URL}/**`;

  await context.route(apiPattern, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/session" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessionId: TEST_SESSION_ID, step: "welcome" }),
      });
      return;
    }

    if (path === "/api/cloudflare/verify" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          accountId: "acc-e2e",
          accounts: [{ id: "acc-e2e", name: "E2E Account" }],
          step: "cloudflare",
        }),
      });
      return;
    }

    if (path === "/api/cloudflare/zones" && method === "GET") {
      const zoneId = url.searchParams.get("zoneId");
      if (zoneId) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            zone: TEST_ZONE,
            chatHostname: url.searchParams.get("chatHostname") ?? TEST_CHAT_HOST,
            apiHostname: url.searchParams.get("apiHostname") ?? TEST_API_HOST,
            step: "domains",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ zones: [TEST_ZONE] }),
      });
      return;
    }

    if (path === "/api/provision/start" && method === "POST") {
      state.provisionPolls = 0;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, started: true }),
      });
      return;
    }

    if (path === "/api/provision/status" && method === "GET") {
      state.provisionPolls += 1;
      const complete = state.provisionPolls >= 2;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          churchName: TEST_CHURCH,
          currentStep: complete ? "complete" : "deploy_workers",
          stepStatus: complete
            ? completeStepStatus()
            : runningStepStatus("deploy_workers"),
          resources: {
            chatHostname: TEST_CHAT_HOST,
            apiHostname: TEST_API_HOST,
          },
          complete,
          chatUrl: complete ? TEST_CHAT_URL : undefined,
          apiUrl: complete ? `https://${TEST_API_HOST}` : undefined,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `Unmocked install API route: ${method} ${path}` }),
    });
  });
}

export async function registerChatHealthMock(context: BrowserContext): Promise<void> {
  const healthPath = "/health";
  await context.route(
    (url) => url.hostname === TEST_CHAT_HOST && url.pathname === healthPath,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    },
  );
}

export async function registerSetupApiMocks(context: BrowserContext): Promise<void> {
  const installContext = {
    fromInstall: true,
    churchName: TEST_CHURCH,
    signInRedirectUri: `${TEST_CHAT_URL}/api/auth/pco/callback`,
    webhookUrl: TEST_WEBHOOK_URL,
    apiRedirectUri: `https://${TEST_API_HOST}/auth/pco/mobile/callback`,
    mobileRedirectUri: `https://${TEST_API_HOST}/auth/pco/mobile/callback`,
    cloudflarePlatformProvisioned: true,
    readOnlyUrls: true,
  };

  await context.route("**/api/v1/setup/install-context**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(installContext),
    });
  });

  await context.route("**/api/v1/setup/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, signInAvailable: false }),
    });
  });

  await context.route("**/api/v1/setup/draft", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, draft: null }),
    });
  });

  await context.route("**/api/v1/setup/redirect-uris", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        signInRedirectUri: installContext.signInRedirectUri,
        webhookUrl: installContext.webhookUrl,
        apiRedirectUri: installContext.apiRedirectUri,
        mobileRedirectUri: installContext.mobileRedirectUri,
      }),
    });
  });

  await context.route("**/api/v1/setup/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not signed in" }),
    });
  });
}

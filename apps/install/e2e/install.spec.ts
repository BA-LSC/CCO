import { expect, test } from "@playwright/test";
import {
  INSTALL_API_URL,
  registerChatHealthMock,
  registerInstallApiMocks,
  registerSetupApiMocks,
  TEST_API_HOST,
  TEST_CHURCH,
  TEST_CHAT_HOST,
  TEST_CHAT_URL,
  TEST_WEBHOOK_URL,
  TEST_ZONE,
  type InstallApiMockState,
} from "./mock-install-api";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

test.describe("Install wizard (mocked orchestrator)", () => {
  let mockState: InstallApiMockState;

  test.beforeEach(async ({ context }) => {
    mockState = { provisionPolls: 0 };
    await registerInstallApiMocks(context, mockState);
    await registerChatHealthMock(context);
  });

  test("orchestrator health is reachable when live", async ({ request }) => {
    test.skip(
      process.env.INSTALL_E2E_LIVE !== "1",
      "Set INSTALL_E2E_LIVE=1 to probe a running orchestrator on :8787",
    );
    const res = await request.get(`${INSTALL_API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("welcome → cloudflare → domains → deploy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await page.getByLabel("Church name").fill(TEST_CHURCH);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Cloudflare API token" })).toBeVisible();
    await page.getByLabel("API token").fill("cf-e2e-mock-token");
    await page.getByRole("button", { name: "Verify token" }).click();

    await expect(page.getByRole("heading", { name: "Domains" })).toBeVisible();
    await expect(page.getByLabel("Chat hostname")).toHaveValue(TEST_CHAT_HOST);
    await expect(page.getByLabel("API hostname")).toHaveValue(TEST_API_HOST);
    await page.getByRole("button", { name: "Start deploy" }).click();

    await expect(page.getByRole("heading", { name: "Deploy progress" })).toBeVisible();
    await expect(page.getByText("deploy workers")).toBeVisible({ timeout: 15_000 });
  });

  test("provision status reaches complete", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Church name").fill(TEST_CHURCH);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("API token").fill("cf-e2e-mock-token");
    await page.getByRole("button", { name: "Verify token" }).click();
    await page.getByRole("button", { name: "Start deploy" }).click();

    await expect(page.getByText(/Complete — redirecting/i)).toBeVisible({ timeout: 20_000 });
    expect(mockState.provisionPolls).toBeGreaterThanOrEqual(2);
  });

  test("deployed chat /health returns ok", async ({ page }) => {
    await page.goto("about:blank");
    const health = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return { ok: res.ok, body: (await res.json()) as { ok: boolean } };
    }, `${TEST_CHAT_URL}/health`);
    expect(health.ok).toBe(true);
    expect(health.body).toEqual({ ok: true });
  });
});

test.describe("Planning Center setup after install", () => {
  test.beforeEach(async ({ context }) => {
    await registerSetupApiMocks(context);
  });

  test("setup page shows pre-filled webhook URL from install handoff", async ({ page, request }) => {
    let webAvailable = false;
    try {
      const probe = await request.get(WEB_URL, { timeout: 5_000 });
      webAvailable = probe.ok() || probe.status() < 500;
    } catch {
      webAvailable = false;
    }
    test.skip(!webAvailable, `Web app not running at ${WEB_URL} — start with cd apps/web && bun run dev`);

    await page.goto(`${WEB_URL}/setup?install=complete`);
    await expect(page.getByRole("heading", { name: "Connect Planning Center" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Webhook endpoint URL", { exact: true })).toBeVisible();
    await expect(page.getByDisplayValue(TEST_WEBHOOK_URL)).toBeVisible();
    await expect(page.getByLabel("Church name")).toHaveValue(TEST_CHURCH);
  });
});

test.describe("Install wizard zone defaults", () => {
  test.beforeEach(async ({ context }) => {
    await registerInstallApiMocks(context, { provisionPolls: 0 });
  });

  test("selecting zone prefills chat and api hostnames", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Church name").fill(TEST_CHURCH);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("API token").fill("cf-e2e-mock-token");
    await page.getByRole("button", { name: "Verify token" }).click();

    await expect(page.getByLabel("Zone")).toHaveValue(TEST_ZONE.id);
    await expect(page.getByLabel("Chat hostname")).toHaveValue(`chat.${TEST_ZONE.name}`);
    await expect(page.getByLabel("API hostname")).toHaveValue(`api.${TEST_ZONE.name}`);
  });
});

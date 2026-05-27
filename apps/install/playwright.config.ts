import { defineConfig, devices } from "@playwright/test";

const INSTALL_WEB_URL = process.env.INSTALL_WEB_URL ?? "http://localhost:3002";
const INSTALL_API_URL = process.env.INSTALL_API_URL ?? "http://localhost:8787";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  use: {
    baseURL: INSTALL_WEB_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.INSTALL_E2E_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "bun run dev",
        url: INSTALL_WEB_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_INSTALL_API_URL: INSTALL_API_URL,
        },
      },
});

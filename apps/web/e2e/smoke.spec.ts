import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

test.describe("CCO smoke", () => {
  test("API health returns ok", async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ ok: true, draining: false });
  });

  test("home page shows sign in", async ({ page }) => {
    await page.goto(WEB_URL);
    await expect(page.getByRole("link", { name: /Planning Center/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CCO" })).toBeVisible();
  });
});

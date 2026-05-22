import { test, expect } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

test.describe("chat API contract", () => {
  test("health endpoint is up", async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({ ok: true, draining: false });
  });

  test("messages endpoint requires auth", async ({ request }) => {
    const res = await request.post(`${API_URL}/v1/messages?conversationId=00000000-0000-0000-0000-000000000001`, {
      data: {
        body: "hello",
        clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      },
    });
    expect(res.status()).toBe(401);
  });
});

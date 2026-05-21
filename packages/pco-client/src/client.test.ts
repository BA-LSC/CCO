import { describe, expect, test } from "bun:test";
import { PlanningCenterClient } from "./client";

describe("PlanningCenterClient", () => {
  test("configured is false without token", () => {
    const client = new PlanningCenterClient({ accessToken: "" });
    expect(client.configured).toBe(false);
  });

  test("get throws when not configured", async () => {
    const client = new PlanningCenterClient({ accessToken: "" });
    await expect(client.get("/groups/v2/groups")).rejects.toThrow("not configured");
  });
});

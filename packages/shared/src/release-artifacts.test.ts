import { describe, expect, test } from "bun:test";
import { verifyReleaseArtifactsReady } from "./release-artifacts.js";

describe("verifyReleaseArtifactsReady", () => {
  test("returns ready when all artifacts respond to HEAD", async () => {
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${String(input)} ${init?.method ?? "GET"}`);
    }) as typeof fetch;

    const result = await verifyReleaseArtifactsReady("https://setup-c.co/releases", {
      fetchFn,
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test("reports missing artifacts on 404", async () => {
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method !== "HEAD") throw new Error("expected HEAD");
      if (url.endsWith("/cco-api.mjs")) return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const result = await verifyReleaseArtifactsReady("https://setup-c.co/releases", {
      fetchFn,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("cco-api.mjs");
  });
});

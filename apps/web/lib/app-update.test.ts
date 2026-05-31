import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  clearDeployWait,
  isClientBuildStale,
  isDeployPending,
  markDeployWait,
  probeServerAppVersion,
} from "./app-update";

describe("isClientBuildStale", () => {
  test("detects version mismatch", () => {
    expect(isClientBuildStale("new-sha", false, "old-sha")).toBe(true);
  });

  test("ignores dev, unavailable, and matching builds", () => {
    expect(isClientBuildStale("new-sha", false, "dev")).toBe(false);
    expect(isClientBuildStale(null, true, "old-sha")).toBe(false);
    expect(isClientBuildStale("same-sha", false, "same-sha")).toBe(false);
  });
});

describe("probeServerAppVersion", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    markDeployWait({ showOverlay: false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearDeployWait();
  });

  test("does not treat client deploy-wait as server updating on 503", async () => {
    expect(isDeployPending()).toBe(true);

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("unavailable", { status: 503, statusText: "Service Unavailable" })),
    ) as typeof fetch;

    await expect(probeServerAppVersion()).resolves.toEqual({
      version: null,
      unavailable: true,
      updating: false,
      deployPhase: null,
    });
  });

  test("does not treat client deploy-wait as server updating on network error", async () => {
    expect(isDeployPending()).toBe(true);

    globalThis.fetch = mock(() => Promise.reject(new Error("network down"))) as typeof fetch;

    await expect(probeServerAppVersion()).resolves.toEqual({
      version: null,
      unavailable: true,
      updating: false,
      deployPhase: null,
    });
  });
});

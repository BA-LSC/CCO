import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  clearDeployWait,
  isDeployPending,
  markDeployWait,
  probeServerAppVersion,
} from "./app-update";

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

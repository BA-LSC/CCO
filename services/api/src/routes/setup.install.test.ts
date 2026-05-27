import { describe, expect, test, afterEach } from "bun:test";
import { isInstallHandoffAuthorized } from "../services/setup-session";

describe("isInstallHandoffAuthorized", () => {
  const prevBootstrap = process.env.SETUP_BOOTSTRAP_SECRET;
  const prevInternal = process.env.CF_INTERNAL_SECRET;

  afterEach(() => {
    if (prevBootstrap === undefined) delete process.env.SETUP_BOOTSTRAP_SECRET;
    else process.env.SETUP_BOOTSTRAP_SECRET = prevBootstrap;
    if (prevInternal === undefined) delete process.env.CF_INTERNAL_SECRET;
    else process.env.CF_INTERNAL_SECRET = prevInternal;
  });

  test("accepts SETUP_BOOTSTRAP_SECRET", () => {
    process.env.SETUP_BOOTSTRAP_SECRET = "bootstrap-secret";
    delete process.env.CF_INTERNAL_SECRET;
    expect(isInstallHandoffAuthorized("bootstrap-secret")).toBe(true);
    expect(isInstallHandoffAuthorized("wrong")).toBe(false);
  });

  test("accepts CF_INTERNAL_SECRET when bootstrap secret unset", () => {
    delete process.env.SETUP_BOOTSTRAP_SECRET;
    process.env.CF_INTERNAL_SECRET = "internal-secret";
    expect(isInstallHandoffAuthorized("internal-secret")).toBe(true);
  });
});

describe("setup install routes", () => {
  test("GET /install-context requires install=complete", async () => {
    const { setupRouter } = await import("../routes/setup");
    const res = await setupRouter.request("/install-context");
    expect(res.status).toBe(400);
  });

  test("POST /install-handoff returns 401 without auth", async () => {
    delete process.env.SETUP_BOOTSTRAP_SECRET;
    delete process.env.CF_INTERNAL_SECRET;
    const { setupRouter } = await import("../routes/setup");
    const res = await setupRouter.request("/install-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchName: "Grace Church",
        chatHostname: "chat.grace.org",
        apiHostname: "api.grace.org",
      }),
    });
    expect(res.status).toBe(401);
  });
});

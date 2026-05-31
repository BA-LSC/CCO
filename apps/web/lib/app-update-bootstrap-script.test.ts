import { describe, expect, test } from "bun:test";
import { appUpdateBootstrapScript } from "./app-update-bootstrap-script";

describe("appUpdateBootstrapScript", () => {
  test("returns empty script for dev builds", () => {
    expect(appUpdateBootstrapScript("dev")).toBe("");
  });

  test("reloads stale bundles before React hydrates", () => {
    const script = appUpdateBootstrapScript("old-sha");
    expect(script).toContain("shouldArm");
    expect(script).toContain("data.version!==client");
    expect(script).toContain("window.location.reload");
    expect(script).toContain("cco:app-updating");
  });
});

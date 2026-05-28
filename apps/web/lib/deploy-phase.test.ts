import { describe, expect, it } from "vitest";
import { labelForDeployPhase, resolveDeployStatusMessage } from "./deploy-phase";

describe("resolveDeployStatusMessage", () => {
  it("maps known API phase codes to labels", () => {
    expect(labelForDeployPhase("deploying-chat")).toBe("Deploying chat app…");
    expect(
      resolveDeployStatusMessage({
        phase: "running-migrations",
        updating: true,
        elapsedMs: 0,
      }),
    ).toBe("Running database migrations…");
  });

  it("falls back when phase is missing", () => {
    expect(
      resolveDeployStatusMessage({ phase: null, updating: true, elapsedMs: 20_000 }),
    ).toBe("Deploying workers…");
  });

  it("shows refresh message when update is finishing", () => {
    expect(
      resolveDeployStatusMessage({ phase: null, updating: false, elapsedMs: 60_000 }),
    ).toBe("Refreshing this page…");
  });
});

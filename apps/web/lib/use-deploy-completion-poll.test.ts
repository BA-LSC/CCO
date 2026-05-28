import { describe, expect, it } from "vitest";
import { shouldFinishDeployPoll } from "./use-deploy-completion-poll";

describe("shouldFinishDeployPoll", () => {
  it("waits while the server is still draining", () => {
    expect(
      shouldFinishDeployPoll({
        updating: true,
        sawDeployUpdating: false,
        deployWaitPending: true,
        serverVersion: "abc",
        clientVersion: "old",
        unavailable: false,
      }),
    ).toBe(false);
  });

  it("reloads when this tab started apply update even if draining was missed", () => {
    expect(
      shouldFinishDeployPoll({
        updating: false,
        sawDeployUpdating: false,
        deployWaitPending: true,
        serverVersion: "same",
        clientVersion: "same",
        unavailable: false,
      }),
    ).toBe(true);
  });

  it("reloads after observing deploy draining finish", () => {
    expect(
      shouldFinishDeployPoll({
        updating: false,
        sawDeployUpdating: true,
        deployWaitPending: false,
        serverVersion: "same",
        clientVersion: "same",
        unavailable: false,
      }),
    ).toBe(true);
  });

  it("reloads on version mismatch without deploy wait state", () => {
    expect(
      shouldFinishDeployPoll({
        updating: false,
        sawDeployUpdating: false,
        deployWaitPending: false,
        serverVersion: "new",
        clientVersion: "old",
        unavailable: false,
      }),
    ).toBe(true);
  });

  it("keeps polling when nothing indicates a finished deploy", () => {
    expect(
      shouldFinishDeployPoll({
        updating: false,
        sawDeployUpdating: false,
        deployWaitPending: false,
        serverVersion: "same",
        clientVersion: "same",
        unavailable: false,
      }),
    ).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  shouldAcceptUpdatesReload,
  shouldFinishDeployPoll,
  validateUpdatesReload,
  waitForUpdatesStatusAfterDeploy,
} from "./use-deploy-completion-poll";

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

const OLD_SHA = "0a01b1ae1a44f2c8b2e3d4a5b6c7d8e9f0a1b2c3";
const NEW_SHA = "cab0bc60abb79956f4576f3cbef714ab3adc039c";

describe("shouldAcceptUpdatesReload", () => {
  it("rejects null status and apply errors", () => {
    expect(shouldAcceptUpdatesReload(null)).toBe(false);
    expect(
      shouldAcceptUpdatesReload({
        lastApplyError: "boom",
        currentVersion: OLD_SHA,
        latestVersion: NEW_SHA,
      }),
    ).toBe(false);
  });

  it("accepts when no update is flagged", () => {
    expect(
      shouldAcceptUpdatesReload({
        lastApplyError: null,
        currentVersion: NEW_SHA,
        latestVersion: NEW_SHA,
      }),
    ).toBe(true);
  });

  it("accepts stale updateAvailable when expected applied SHA matches current", () => {
    expect(
      shouldAcceptUpdatesReload(
        {
          lastApplyError: null,
          currentVersion: OLD_SHA,
          latestVersion: NEW_SHA,
        },
        NEW_SHA,
      ),
    ).toBe(true);
  });

  it("accepts when latest still shows target but current matches expected short SHA", () => {
    expect(
      shouldAcceptUpdatesReload(
        {
          lastApplyError: null,
          currentVersion: "cab0bc60abb7",
          latestVersion: NEW_SHA,
        },
        NEW_SHA,
      ),
    ).toBe(true);
  });

  it("rejects when update flag remains and expected SHA does not match catalog", () => {
    expect(
      shouldAcceptUpdatesReload(
        {
          lastApplyError: null,
          currentVersion: OLD_SHA,
          latestVersion: NEW_SHA,
        },
        "deadbeef0000000000000000000000000000000001",
      ),
    ).toBe(false);
  });
});

describe("validateUpdatesReload", () => {
  it("reloads when the catalog still shows an available update", () => {
    const onError = vi.fn();
    expect(
      validateUpdatesReload(
        {
          lastApplyError: null,
          currentVersion: OLD_SHA,
          latestVersion: NEW_SHA,
        },
        onError,
      ),
    ).toBe("reload");
    expect(onError).not.toHaveBeenCalled();
  });

  it("aborts when the apply endpoint recorded an error", () => {
    const onError = vi.fn();
    expect(
      validateUpdatesReload(
        {
          lastApplyError: "boom",
          currentVersion: OLD_SHA,
          latestVersion: NEW_SHA,
        },
        onError,
      ),
    ).toBe("abort");
    expect(onError).toHaveBeenCalledWith("Apply failed: boom");
  });
});

describe("waitForUpdatesStatusAfterDeploy", () => {
  it("retries until shouldAcceptUpdatesReload passes", async () => {
    const loadStatus = vi
      .fn()
      .mockResolvedValueOnce({
        lastApplyError: null,
        currentVersion: OLD_SHA,
        latestVersion: NEW_SHA,
      })
      .mockResolvedValueOnce({
        lastApplyError: null,
        currentVersion: NEW_SHA,
        latestVersion: NEW_SHA,
      });

    const result = await waitForUpdatesStatusAfterDeploy(loadStatus);

    expect(loadStatus).toHaveBeenCalledTimes(2);
    expect(result?.currentVersion).toBe(NEW_SHA);
  });
});

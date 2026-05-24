import { describe, expect, test } from "bun:test";
import {
  CCO_REALTIMEKIT_APP_NAME,
  matchPresetNames,
  resolveCloudflareAccountId,
  resolveRealtimeKitAppSelection,
} from "./cloudflare-realtimekit-provision";

describe("matchPresetNames", () => {
  test("matches exact CCO preset names", () => {
    expect(
      matchPresetNames(["host", "group_call_participant", "guest"]),
    ).toEqual({
      host: "host",
      member: "group_call_participant",
      guest: "guest",
    });
  });

  test("matches dashboard-style preset names", () => {
    expect(
      matchPresetNames(["group-call-host", "group-call-participant", "guest"]),
    ).toEqual({
      host: "group-call-host",
      member: "group-call-participant",
      guest: "guest",
    });
  });

  test("returns null when a role is missing", () => {
    expect(matchPresetNames(["host", "guest"])).toBeNull();
  });
});

describe("resolveCloudflareAccountId", () => {
  test("uses preferred account when available", () => {
    const accounts = [{ id: "acc-a" }, { id: "acc-b" }];
    expect(resolveCloudflareAccountId(accounts, "acc-b")).toBe("acc-b");
  });

  test("uses sole account without preference", () => {
    expect(resolveCloudflareAccountId([{ id: "acc-a" }])).toBe("acc-a");
  });

  test("throws when multiple accounts and no preference", () => {
    expect(() =>
      resolveCloudflareAccountId([{ id: "acc-a" }, { id: "acc-b" }]),
    ).toThrow(/multiple accounts/i);
  });
});

describe("resolveRealtimeKitAppSelection", () => {
  test("prefers existing app id", () => {
    const apps = [
      { id: "app-1", name: "Other" },
      { id: "app-2", name: CCO_REALTIMEKIT_APP_NAME },
    ];
    expect(
      resolveRealtimeKitAppSelection(apps, { preferredAppId: "app-1" }),
    ).toEqual({ id: "app-1", name: "Other" });
  });

  test("finds app by CCO name", () => {
    const apps = [
      { id: "app-1", name: "Other" },
      { id: "app-2", name: CCO_REALTIMEKIT_APP_NAME },
    ];
    expect(resolveRealtimeKitAppSelection(apps, {})).toEqual({
      id: "app-2",
      name: CCO_REALTIMEKIT_APP_NAME,
    });
  });

  test("uses sole app when only one exists", () => {
    const apps = [{ id: "app-1", name: "Only app" }];
    expect(resolveRealtimeKitAppSelection(apps, {})).toEqual(apps[0]);
  });

  test("returns create when no app matches", () => {
    const apps = [
      { id: "app-1", name: "Other" },
      { id: "app-2", name: "Another" },
    ];
    expect(resolveRealtimeKitAppSelection(apps, {})).toBe("create");
  });
});

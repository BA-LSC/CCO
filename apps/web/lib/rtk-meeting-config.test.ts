import { describe, expect, test } from "bun:test";
import { buildRtkMeetingConfig, peerLooksLikeGuest } from "./rtk-meeting-config";

describe("peerLooksLikeGuest", () => {
  test("detects guest custom participant id", () => {
    expect(peerLooksLikeGuest({ customParticipantId: "guest:Pat:abc" })).toBe(true);
  });

  test("detects guest preset name", () => {
    expect(peerLooksLikeGuest({ presetName: "group_call_guest" })).toBe(true);
  });

  test("returns false for members", () => {
    expect(
      peerLooksLikeGuest({
        customParticipantId: "33333333-3333-4333-8333-333333333333",
        presetName: "group_call_participant",
      }),
    ).toBe(false);
  });
});

describe("buildRtkMeetingConfig", () => {
  test("guest with chat disabled removes chat toggle only", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: false, placement: "guest" });
    const removal = config.root?.["div#controlbar-right"]?.remove ?? [];
    expect(removal).toContain("rtk-chat-toggle");
    expect(removal).not.toContain("rtk-polls-toggle");
    expect(removal).not.toContain("rtk-plugins-toggle");
  });

  test("guest with chat enabled keeps default control bar", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: true, placement: "guest" });
    const removal = config.root?.["div#controlbar-right"]?.remove;
    expect(removal == null || !removal.includes("rtk-chat-toggle")).toBe(true);
    expect(removal == null || !removal.includes("rtk-polls-toggle")).toBe(true);
  });

  test("inline removes polls, plugins, participants, and leave but keeps chat when enabled", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: true, placement: "inline" });
    const removal = config.root?.["div#controlbar-right"]?.remove ?? [];
    expect(removal).toContain("rtk-polls-toggle");
    expect(removal).toContain("rtk-plugins-toggle");
    expect(removal).toContain("rtk-participants-toggle");
    expect(removal).toContain("rtk-leave-button");
    expect(removal).not.toContain("rtk-chat-toggle");
    expect(config.root?.["div#controlbar-center"]?.remove).toContain("rtk-leave-button");
  });

  test("pip removes chat toggle when chat disabled", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: false, placement: "pip" });
    const removal = config.root?.["div#controlbar-right"]?.remove ?? [];
    expect(removal).toContain("rtk-chat-toggle");
    expect(removal).toContain("rtk-polls-toggle");
    expect(removal).toContain("rtk-plugins-toggle");
    expect(removal).toContain("rtk-participants-toggle");
    expect(removal).toContain("rtk-leave-button");
  });
});

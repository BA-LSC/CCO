import { describe, expect, test } from "bun:test";
import {
  buildRtkMeetingConfig,
  listControlbarTags,
  peerLooksLikeGuest,
} from "./rtk-meeting-config";

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
    const right = listControlbarTags(config, "div#controlbar-right");
    expect(right).not.toContain("rtk-chat-toggle");
    expect(right).toContain("rtk-polls-toggle");
    expect(right).toContain("rtk-plugins-toggle");
  });

  test("guest with chat enabled keeps default control bar", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: true, placement: "guest" });
    const right = listControlbarTags(config, "div#controlbar-right");
    expect(right).toContain("rtk-chat-toggle");
    expect(right).toContain("rtk-polls-toggle");
  });

  test("inline removes chat, polls, plugins, participants, and leave", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: true, placement: "inline" });
    const right = listControlbarTags(config, "div#controlbar-right");
    const center = listControlbarTags(config, "div#controlbar-center");

    expect(right).not.toContain("rtk-chat-toggle");
    expect(right).not.toContain("rtk-polls-toggle");
    expect(right).not.toContain("rtk-plugins-toggle");
    expect(right).not.toContain("rtk-participants-toggle");
    expect(center).not.toContain("rtk-leave-button");
    expect(center).not.toContain("rtk-livestream-toggle");
    expect(center).not.toContain("rtk-webinar-stage-toggle");
    expect(center).not.toContain("rtk-stage-toggle");
    expect(center).not.toContain("rtk-ai-toggle");
    expect(center).toEqual([
      "rtk-settings-toggle",
      "rtk-screen-share-toggle",
      "rtk-mic-toggle",
      "rtk-camera-toggle",
      "rtk-more-toggle",
    ]);
    expect(center).toContain("rtk-settings-toggle");
    expect(center).toContain("rtk-screen-share-toggle");
    expect(center).toContain("rtk-mic-toggle");
    expect(center).toContain("rtk-camera-toggle");
    expect(config.styles?.["rtk-leave-button"]?.display).toBe("none");
    expect(config.styles?.["rtk-chat-toggle"]?.display).toBe("none");
    expect(config.styles?.["rtk-controlbar"]?.justifyContent).toBe("center");
    expect(config.styles?.["div#controlbar-left"]?.display).toBe("none");
  });

  test("pip removes chat, polls, plugins, participants, and leave", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: false, placement: "pip" });
    const right = listControlbarTags(config, "div#controlbar-right");
    const center = listControlbarTags(config, "div#controlbar-center");
    const centerChildren = config.root?.["div#controlbar-center"];

    expect(right).not.toContain("rtk-chat-toggle");
    expect(right).not.toContain("rtk-polls-toggle");
    expect(right).not.toContain("rtk-plugins-toggle");
    expect(right).not.toContain("rtk-participants-toggle");
    expect(center).not.toContain("rtk-leave-button");
    expect(centerChildren).toEqual(center.map((tag) => [tag, { size: "sm" }]));
    expect(config.styles?.["div#controlbar-center"]?.gap).toBe("0px");
    expect(config.styles?.["div#controlbar-center"]?.flexWrap).toBe("nowrap");
    expect(config.styles?.["rtk-mic-toggle"]?.minWidth).toBe("32px");
    expect(config.styles?.["rtk-mic-toggle"]?.["--rtk-controlbar-button-icon-size"]).toBe("18px");
  });

  test("inline uses compact icon-only controlbar buttons with hover tooltips", () => {
    const config = buildRtkMeetingConfig({ enableInRoomChat: true, placement: "inline" });
    const centerChildren = config.root?.["div#controlbar-center"];

    expect(centerChildren?.[0]).toEqual(["rtk-settings-toggle", { size: "sm" }]);
    expect(config.styles?.["div#controlbar-center"]?.gap).toBe("2px");
    expect(config.styles?.["rtk-mic-toggle"]?.minWidth).toBe("34px");
    expect(config.styles?.["rtk-mic-toggle"]?.["--rtk-controlbar-button-icon-size"]).toBe("18px");
  });
});

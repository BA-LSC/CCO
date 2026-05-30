import { describe, expect, test } from "bun:test";
import { resolveCallPanelPlacement } from "./call-panel-placement";

const HOME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("resolveCallPanelPlacement", () => {
  test("returns none when not in call", () => {
    expect(
      resolveCallPanelPlacement({
        inCall: false,
        homeConversationId: HOME,
        activeConversationId: HOME,
      }),
    ).toBe("none");
  });

  test("returns none when home conversation is missing", () => {
    expect(
      resolveCallPanelPlacement({
        inCall: true,
        homeConversationId: null,
        activeConversationId: HOME,
      }),
    ).toBe("none");
  });

  test("returns inline on the call home chat", () => {
    expect(
      resolveCallPanelPlacement({
        inCall: true,
        homeConversationId: HOME,
        activeConversationId: HOME,
      }),
    ).toBe("inline");
  });

  test("returns pip on a different chat", () => {
    expect(
      resolveCallPanelPlacement({
        inCall: true,
        homeConversationId: HOME,
        activeConversationId: OTHER,
      }),
    ).toBe("pip");
  });

  test("returns pip when browsing without an active conversation", () => {
    expect(
      resolveCallPanelPlacement({
        inCall: true,
        homeConversationId: HOME,
        activeConversationId: null,
      }),
    ).toBe("pip");
  });
});

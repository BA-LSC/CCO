import { describe, expect, test } from "bun:test";
import {
  isChatIndexPath,
  isPersistableChatPath,
} from "./last-chat-path";

describe("isPersistableChatPath", () => {
  test("accepts DM, group channel, and team routes", () => {
    expect(isPersistableChatPath("/dms/abc-123")).toBe(true);
    expect(isPersistableChatPath("/groups/g1/c/c1")).toBe(true);
    expect(isPersistableChatPath("/teams/t1")).toBe(true);
  });

  test("rejects index and settings routes", () => {
    expect(isPersistableChatPath("/groups")).toBe(false);
    expect(isPersistableChatPath("/dms")).toBe(false);
    expect(isPersistableChatPath("/settings/integrations")).toBe(false);
    expect(isPersistableChatPath("//evil.example")).toBe(false);
  });
});

describe("isChatIndexPath", () => {
  test("matches chat home routes", () => {
    expect(isChatIndexPath("/groups")).toBe(true);
    expect(isChatIndexPath("/dms")).toBe(true);
    expect(isChatIndexPath("/teams")).toBe(true);
    expect(isChatIndexPath("/dms/abc")).toBe(false);
  });
});

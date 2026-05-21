import { describe, expect, test } from "bun:test";
import { canCreateConversation } from "../permissions";

describe("oauth-complete", () => {
  test("child profile would be blocked at route layer", () => {
    expect(canCreateConversation("member")).toBe(false);
  });
});

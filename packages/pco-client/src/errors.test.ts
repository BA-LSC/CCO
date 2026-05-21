import { describe, expect, test } from "bun:test";
import { parsePcoErrorMessage } from "./errors";

describe("parsePcoErrorMessage", () => {
  test("explains TRASH_PANDA as missing product access", () => {
    const raw = JSON.stringify({
      errors: [
        {
          code: "unauthorized",
          detail: "This request could not be authenticated. Error Code Hint: (TRASH_PANDA)",
        },
      ],
    });
    expect(parsePcoErrorMessage(raw)).toContain("Groups");
  });
});

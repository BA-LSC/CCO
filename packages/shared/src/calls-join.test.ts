import { describe, expect, test } from "bun:test";
import { canJoinCallAsParticipant } from "./calls";

const HOST_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";

describe("canJoinCallAsParticipant", () => {
  test("allows non-host members", () => {
    expect(
      canJoinCallAsParticipant({ hostUserId: HOST_ID }, MEMBER_ID),
    ).toBe(true);
  });

  test("blocks the call host", () => {
    expect(canJoinCallAsParticipant({ hostUserId: HOST_ID }, HOST_ID)).toBe(
      false,
    );
  });

  test("blocks when user id is missing", () => {
    expect(canJoinCallAsParticipant({ hostUserId: HOST_ID }, null)).toBe(
      false,
    );
    expect(canJoinCallAsParticipant({ hostUserId: HOST_ID }, undefined)).toBe(
      false,
    );
  });
});

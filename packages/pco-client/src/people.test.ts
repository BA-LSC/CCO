import { describe, expect, test } from "bun:test";
import { parsePersonDisplayName } from "./people";

describe("parsePersonDisplayName", () => {
  test("joins first and last name", () => {
    expect(
      parsePersonDisplayName({ first_name: "Jamie", last_name: "Lee" }),
    ).toBe("Jamie Lee");
  });

  test("returns null when names are missing", () => {
    expect(parsePersonDisplayName({})).toBeNull();
    expect(parsePersonDisplayName(undefined)).toBeNull();
  });
});

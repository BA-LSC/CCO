import { describe, expect, test } from "bun:test";
import { mergeGroups } from "./groups";

describe("mergeGroups", () => {
  test("inserts new and updates names", () => {
    const existing = [{ pcoGroupId: "1", name: "Old" }];
    const incoming = [
      { pcoGroupId: "1", name: "New" },
      { pcoGroupId: "2", name: "B" },
    ];
    const result = mergeGroups(existing, incoming);
    expect(result.toCreate).toEqual([{ pcoGroupId: "2", name: "B" }]);
    expect(result.toUpdate).toEqual([
      { pcoGroupId: "1", name: "New", imageUrl: null },
    ]);
  });
});

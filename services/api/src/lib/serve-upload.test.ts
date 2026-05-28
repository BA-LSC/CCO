import { describe, expect, test } from "bun:test";
import { parseByteRangeHeader } from "./upload-range";

describe("parseByteRangeHeader", () => {
  test("parses an inclusive byte range", () => {
    expect(parseByteRangeHeader("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
  });

  test("parses an open-ended range", () => {
    expect(parseByteRangeHeader("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
  });

  test("parses a suffix range", () => {
    expect(parseByteRangeHeader("bytes=-4", 10)).toEqual({ start: 6, end: 9 });
  });

  test("returns null when no range is present", () => {
    expect(parseByteRangeHeader(undefined, 10)).toBeNull();
  });

  test("returns unsatisfiable for invalid ranges", () => {
    expect(parseByteRangeHeader("bytes=20-30", 10)).toBe("unsatisfiable");
  });
});

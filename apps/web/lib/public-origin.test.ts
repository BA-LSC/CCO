import { describe, expect, test } from "bun:test";
import { getPublicOrigin } from "./public-origin";

describe("getPublicOrigin", () => {
  test("prefers WEB_URL over internal request host", () => {
    const prev = process.env.WEB_URL;
    process.env.WEB_URL = "https://cco.lscavl.dev";
    try {
      const request = new Request("http://0.0.0.0:3000/auth/sign-out");
      expect(getPublicOrigin(request)).toBe("https://cco.lscavl.dev");
    } finally {
      if (prev === undefined) delete process.env.WEB_URL;
      else process.env.WEB_URL = prev;
    }
  });

  test("uses forwarded headers when env is unset", () => {
    const prevWeb = process.env.WEB_URL;
    const prevPublic = process.env.NEXT_PUBLIC_WEB_URL;
    delete process.env.WEB_URL;
    delete process.env.NEXT_PUBLIC_WEB_URL;
    try {
      const request = new Request("http://0.0.0.0:3000/auth/sign-out", {
        headers: {
          "x-forwarded-host": "cco.lscavl.dev",
          "x-forwarded-proto": "https",
        },
      });
      expect(getPublicOrigin(request)).toBe("https://cco.lscavl.dev");
    } finally {
      if (prevWeb === undefined) delete process.env.WEB_URL;
      else process.env.WEB_URL = prevWeb;
      if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_WEB_URL;
      else process.env.NEXT_PUBLIC_WEB_URL = prevPublic;
    }
  });
});

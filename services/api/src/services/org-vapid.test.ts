import { afterEach, describe, expect, test } from "bun:test";
import {
  defaultVapidSubject,
  normalizeVapidSubject,
  parseVapidSubjectEmail,
} from "./org-vapid";

describe("org-vapid", () => {
  const previousWebUrl = process.env.WEB_URL;

  afterEach(() => {
    if (previousWebUrl === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = previousWebUrl;
  });

  test("defaultVapidSubject derives support email from WEB_URL", () => {
    process.env.WEB_URL = "https://cco.example.org";
    expect(defaultVapidSubject()).toBe("mailto:support@cco.example.org");
  });

  test("defaultVapidSubject falls back when WEB_URL is unset", () => {
    delete process.env.WEB_URL;
    expect(defaultVapidSubject()).toBe("mailto:support@example.com");
  });

  test("normalizeVapidSubject accepts bare email", () => {
    expect(normalizeVapidSubject("admin@church.org")).toBe("mailto:admin@church.org");
  });

  test("parseVapidSubjectEmail strips mailto prefix", () => {
    expect(parseVapidSubjectEmail("mailto:admin@church.org")).toBe("admin@church.org");
  });
});

import { describe, expect, it } from "bun:test";
import {
  formatMessageDayDivider,
  formatMessageTime,
  messageStartsNewDay,
} from "./message-time";

describe("formatMessageTime", () => {
  const now = new Date("2026-05-28T18:00:00.000Z");

  it("shows weekday and time within the past week", () => {
    const iso = "2026-05-22T13:25:29.500Z";
    const formatted = formatMessageTime(iso, now);
    expect(formatted).toMatch(/^Fri /);
    expect(formatted).toMatch(/25/);
  });

  it("shows month, day, and time when older than a week", () => {
    const iso = "2026-05-10T13:25:29.500Z";
    const formatted = formatMessageTime(iso, now);
    expect(formatted).toMatch(/^May 10 at /);
  });
});

describe("formatMessageDayDivider", () => {
  it("formats a full weekday date label", () => {
    expect(formatMessageDayDivider("2026-05-22T13:25:29.500Z")).toMatch(/Friday, May 22/);
  });
});

describe("messageStartsNewDay", () => {
  const messages = [
    { createdAt: "2026-05-21T10:00:00.000Z" },
    { createdAt: "2026-05-21T11:00:00.000Z" },
    { createdAt: "2026-05-22T10:00:00.000Z" },
  ];

  it("starts a new day for the first message", () => {
    expect(messageStartsNewDay(messages, 0)).toBe(true);
  });

  it("does not start a new day for same-day follow-ups", () => {
    expect(messageStartsNewDay(messages, 1)).toBe(false);
  });

  it("starts a new day when the calendar day changes", () => {
    expect(messageStartsNewDay(messages, 2)).toBe(true);
  });
});

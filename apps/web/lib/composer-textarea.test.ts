import { describe, expect, test } from "bun:test";
import { syncComposerTextareaHeight } from "./composer-textarea";

describe("syncComposerTextareaHeight", () => {
  test("clears inline height when the composer is empty", () => {
    const field = document.createElement("div");
    field.className = "composer-mention-input";
    field.style.height = "120px";
    field.style.overflowY = "auto";
    field.textContent = "";

    document.body.append(field);

    syncComposerTextareaHeight(field);

    expect(field.style.height).toBe("");
    expect(field.style.overflowY).toBe("hidden");

    field.remove();
  });

  test("shrinks after multiline content is cleared", () => {
    const field = document.createElement("div");
    field.className = "composer-mention-input";
    field.textContent = "line one\nline two\nline three";
    field.style.height = "120px";
    field.style.overflowY = "auto";

    document.body.append(field);
    syncComposerTextareaHeight(field);
    const expandedHeight = field.style.height;
    expect(expandedHeight).not.toBe("");

    field.textContent = "";
    syncComposerTextareaHeight(field);

    expect(field.style.height).toBe("");
    expect(field.style.overflowY).toBe("hidden");

    field.remove();
  });
});

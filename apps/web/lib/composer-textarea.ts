type ComposerFieldElement = HTMLTextAreaElement | HTMLElement;

function isComposerEmpty(textarea: ComposerFieldElement): boolean {
  const raw = textarea.textContent ?? "";
  return raw.replace(/\u00a0/g, " ").replace(/\u200b/g, "").trim().length === 0;
}

/** Grow/shrink the chat composer to fit content, capped at max lines (then scroll). */
export function syncComposerTextareaHeight(
  textarea: ComposerFieldElement | null,
  maxLines = 3,
): void {
  if (!textarea) return;

  if (isComposerEmpty(textarea)) {
    textarea.style.height = "";
    textarea.style.overflowY = "hidden";
    return;
  }

  const style = getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight);
  const paddingTop = parseFloat(style.paddingTop);
  const paddingBottom = parseFloat(style.paddingBottom);
  const borderTop = parseFloat(style.borderTopWidth);
  const borderBottom = parseFloat(style.borderBottomWidth);
  const minHeight = parseFloat(style.minHeight) || 44;

  const lineBox = Number.isFinite(lineHeight) ? lineHeight : 22;
  const chrome = paddingTop + paddingBottom + borderTop + borderBottom;
  const maxHeight = lineBox * maxLines + chrome;

  textarea.style.height = "0px";
  const contentHeight = textarea.scrollHeight;
  const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { syncComposerTextareaHeight } from "@/lib/composer-textarea";
import { appendMentionChipChildren, formatMention, parseMentionSegments } from "@/lib/mentions";

export function getActiveMentionQuery(value: string): string | null {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    if (value[i] !== "@") continue;
    const segment = value.slice(i);
    if (segment.includes(" ")) return null;
    const query = segment.slice(1);
    if (query.startsWith("[")) return null;
    return query.toLowerCase();
  }
  return null;
}

function readTextBeforeCaret(root: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return root.textContent ?? "";

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return root.textContent ?? "";

  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString();
}

function serializeComposerBody(root: HTMLElement): string {
  let out = "";
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const userId = node.dataset.mentionId;
    const displayName = node.dataset.mentionName;
    if (userId && displayName) {
      out += formatMention(displayName, userId);
      continue;
    }
    out += node.textContent ?? "";
  }
  return out;
}

function renderComposerBody(root: HTMLElement, body: string): void {
  root.replaceChildren();
  for (const segment of parseMentionSegments(body)) {
    if (segment.type === "text") {
      if (segment.value) root.append(segment.value);
      continue;
    }
    const chip = document.createElement("span");
    chip.className = "mention composer-mention-chip";
    chip.contentEditable = "false";
    chip.dataset.mentionId = segment.userId;
    chip.dataset.mentionName = segment.displayName;
    appendMentionChipChildren(chip, segment.displayName);
    root.append(chip);
  }
}

function placeCaretAtEnd(root: HTMLElement): void {
  root.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export type ComposerMentionInputHandle = {
  focus: () => void;
  blur: () => void;
  insertMention: (displayName: string, userId: string) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onMentionQueryChange: (query: string | null) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  "aria-label"?: string;
  onLayout?: () => void;
};

export const ComposerMentionInput = forwardRef<ComposerMentionInputHandle, Props>(
  function ComposerMentionInput(
    {
      value,
      onChange,
      onMentionQueryChange,
      onKeyDown,
      placeholder,
      disabled = false,
      readOnly = false,
      "aria-label": ariaLabel,
      onLayout,
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastRenderedValueRef = useRef<string | null>(null);
    const isComposingRef = useRef(false);

    const syncFromEditor = useCallback(() => {
      const root = editorRef.current;
      if (!root) return;
      const next = serializeComposerBody(root);
      lastRenderedValueRef.current = next;
      onChange(next);
      onMentionQueryChange(getActiveMentionQuery(readTextBeforeCaret(root)));
    }, [onChange, onMentionQueryChange]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const root = editorRef.current;
          if (!root || disabled || readOnly) return;
          placeCaretAtEnd(root);
        },
        blur: () => {
          editorRef.current?.blur();
        },
        insertMention: (displayName: string, userId: string) => {
          const root = editorRef.current;
          if (!root || disabled || readOnly) return;

          root.focus();
          const selection = window.getSelection();
          if (!selection) return;

          let range: Range;
          if (selection.rangeCount > 0 && root.contains(selection.anchorNode)) {
            range = selection.getRangeAt(0);
          } else {
            range = document.createRange();
            range.selectNodeContents(root);
            range.collapse(false);
          }

          const textBefore = readTextBeforeCaret(root);
          const at = textBefore.lastIndexOf("@");
          if (at >= 0) {
            const deleteRange = document.createRange();
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let remaining = at;
            let startNode: Node | null = null;
            let startOffset = 0;
            while (walker.nextNode()) {
              const textNode = walker.currentNode;
              const length = textNode.textContent?.length ?? 0;
              if (remaining <= length) {
                startNode = textNode;
                startOffset = remaining;
                break;
              }
              remaining -= length;
            }
            if (startNode) {
              deleteRange.setStart(startNode, startOffset);
              deleteRange.setEnd(range.startContainer, range.startOffset);
              deleteRange.deleteContents();
              range = deleteRange;
            } else {
              const tail = textBefore.slice(at);
              if (tail && root.textContent?.endsWith(tail)) {
                const lastText = root.lastChild;
                if (lastText?.nodeType === Node.TEXT_NODE) {
                  const text = lastText.textContent ?? "";
                  if (text.endsWith(tail)) {
                    lastText.textContent = text.slice(0, -tail.length);
                  }
                }
              }
            }
          }

          const chip = document.createElement("span");
          chip.className = "mention composer-mention-chip";
          chip.contentEditable = "false";
          chip.dataset.mentionId = userId;
          chip.dataset.mentionName = displayName;
          appendMentionChipChildren(chip, displayName);

          range.insertNode(chip);
          const space = document.createTextNode(" ");
          chip.after(space);

          const caret = document.createRange();
          caret.setStartAfter(space);
          caret.collapse(true);
          selection.removeAllRanges();
          selection.addRange(caret);

          syncFromEditor();
        },
      }),
      [disabled, readOnly, syncFromEditor],
    );

    useLayoutEffect(() => {
      const root = editorRef.current;
      if (!root) return;

      if (lastRenderedValueRef.current !== value) {
        const active = document.activeElement === root;
        renderComposerBody(root, value);
        lastRenderedValueRef.current = value;
        if (active) placeCaretAtEnd(root);
        onMentionQueryChange(getActiveMentionQuery(readTextBeforeCaret(root)));
      }

      syncComposerTextareaHeight(root);
      onLayout?.();
    }, [onLayout, onMentionQueryChange, value]);

    return (
      <div
        ref={editorRef}
        className="composer-mention-input"
        contentEditable={!disabled && !readOnly}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={() => {
          if (isComposingRef.current) return;
          syncFromEditor();
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          syncFromEditor();
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          const related = event.relatedTarget;
          if (related instanceof HTMLElement && related.closest(".mention-suggestions")) {
            return;
          }
          onMentionQueryChange(null);
        }}
      />
    );
  },
);

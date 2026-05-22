"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { syncComposerTextareaHeight } from "@/lib/composer-textarea";
import { ComposerAttachMenu } from "@/components/ComposerAttachMenu";
import { ComposerGiphyPicker } from "@/components/ComposerGiphyPicker";
import { ComposerPendingMedia } from "@/components/ComposerPendingMedia";
import { formatMention, fetchGiphyEnabled } from "@/lib/api";
import { isAppUpdateInProgress } from "@/lib/app-update";
import {
  clearComposerDraft,
  readComposerDraft,
  saveComposerDraft,
  setSendInFlight,
} from "@/lib/app-update-composer";
import {
  createPendingComposerMedia,
  dragEventHasMediaFiles,
  firstMediaFileFromDataTransfer,
  revokePendingComposerMedia,
  validateComposerMediaFile,
  type PendingComposerMedia,
} from "@/lib/composer-media";

type Member = { id?: string; displayName: string; onCco?: boolean };

function getActiveMentionQuery(value: string): string | null {
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

function memberCanMention(member: Member): boolean {
  return Boolean(member.id && member.onCco !== false);
}

type Props = {
  conversationId: string | null;
  canPost: boolean;
  composerLocked: boolean;
  readOnlyReason?: string;
  coarsePointer: boolean;
  composerPlaceholder: string;
  members: Member[];
  resolvedUserId?: string;
  sendError: string | null;
  onSendError: (error: string | null) => void;
  onSend: (payload: { text: string; media: PendingComposerMedia | null }) => Promise<void>;
  onSendGiphy: (importUrl: string) => Promise<void>;
  onComposerLayout?: () => void;
  onMountStageMedia?: (stageMedia: (file: File) => void) => void;
  appUpdateBlocked: boolean;
};

export function ChatComposer({
  conversationId,
  canPost,
  composerLocked,
  readOnlyReason,
  coarsePointer: _coarsePointer,
  composerPlaceholder,
  members,
  resolvedUserId,
  sendError,
  onSendError,
  onSend,
  onSendGiphy,
  onComposerLayout,
  onMountStageMedia,
  appUpdateBlocked,
}: Props) {
  const [body, setBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingComposerMedia | null>(null);
  const [composerDragOver, setComposerDragOver] = useState(false);
  const [giphyOpen, setGiphyOpen] = useState(false);
  const [giphyEnabled, setGiphyEnabled] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendInFlightRef = useRef(false);
  const composerDragDepthRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const composerReadOnly = !canPost;
  const composerInputLocked = composerLocked || composerReadOnly;

  useEffect(() => {
    if (!conversationId) return;
    const draft = readComposerDraft(conversationId);
    setBody(draft ?? "");
    setMentionQuery(null);
    setPendingMedia((current) => {
      revokePendingComposerMedia(current);
      return null;
    });
    setGiphyOpen(false);
    onSendError(null);
  }, [conversationId, onSendError]);

  useEffect(() => {
    if (!appUpdateBlocked || !conversationId) return;
    saveComposerDraft(conversationId, body);
  }, [appUpdateBlocked, body, conversationId]);

  useEffect(() => {
    return () => revokePendingComposerMedia(pendingMedia);
  }, [pendingMedia]);

  useEffect(() => {
    void fetchGiphyEnabled().then(setGiphyEnabled);
  }, []);

  useEffect(() => {
    if (canPost) return;
    composerRef.current?.blur();
  }, [canPost]);

  useLayoutEffect(() => {
    syncComposerTextareaHeight(composerRef.current);
    onComposerLayout?.();
  }, [body, composerLocked, conversationId, onComposerLayout]);

  const resetComposerDragState = useCallback(() => {
    composerDragDepthRef.current = 0;
    setComposerDragOver(false);
  }, []);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const el = composerRef.current;
      el?.focus();
      syncComposerTextareaHeight(el);
    });
  }, []);

  const clearPendingMedia = useCallback(() => {
    setPendingMedia((current) => {
      revokePendingComposerMedia(current);
      return null;
    });
  }, []);

  const stageComposerMedia = useCallback(
    (file: File) => {
      if (!canPost || composerLocked || sendInFlightRef.current || isAppUpdateInProgress()) return;

      const validationError = validateComposerMediaFile(file);
      if (validationError) {
        onSendError(validationError);
        return;
      }

      const next = createPendingComposerMedia(file);
      if (!next) {
        onSendError("Unsupported file type. Use an image or video.");
        return;
      }

      onSendError(null);
      setPendingMedia((current) => {
        revokePendingComposerMedia(current);
        return next;
      });
      resetComposerDragState();
      focusComposer();
    },
    [canPost, composerLocked, focusComposer, onSendError, resetComposerDragState],
  );

  useEffect(() => {
    onMountStageMedia?.(stageComposerMedia);
  }, [onMountStageMedia, stageComposerMedia]);

  const insertMention = useCallback(
    (member: Member) => {
      if (!memberCanMention(member) || !member.id) return;
      const token = formatMention(member.displayName, member.id);
      setBody((prev) => {
        const at = prev.lastIndexOf("@");
        if (at >= 0) return `${prev.slice(0, at)}${token} `;
        return `${prev}${token} `;
      });
      setMentionQuery(null);
      composerRef.current?.focus();
    },
    [],
  );

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = body.trim();
      const media = pendingMedia;
      if (
        !conversationId ||
        (!text && !media) ||
        sendInFlightRef.current ||
        !canPost ||
        composerLocked ||
        isAppUpdateInProgress()
      ) {
        return;
      }

      setMentionQuery(null);
      onSendError(null);
      sendInFlightRef.current = true;
      setSendInFlight(true);
      setIsSending(true);

      try {
        await onSend({ text, media });
        setBody("");
        setPendingMedia((current) => {
          revokePendingComposerMedia(current);
          return null;
        });
        if (conversationId) clearComposerDraft(conversationId);
        resetComposerDragState();
      } catch (err) {
        onSendError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        sendInFlightRef.current = false;
        setSendInFlight(false);
        setIsSending(false);
        focusComposer();
      }
    },
    [
      body,
      canPost,
      composerLocked,
      conversationId,
      focusComposer,
      onSend,
      onSendError,
      pendingMedia,
      resetComposerDragState,
    ],
  );

  const handleBodyChange = useCallback(
    (value: string) => {
      if (!canPost) return;
      setBody(value);
      setMentionQuery(getActiveMentionQuery(value));
    },
    [canPost],
  );

  const mentionCandidates =
    mentionQuery === null
      ? []
      : members.filter(
          (m) =>
            m.id !== resolvedUserId &&
            m.displayName.toLowerCase().includes(mentionQuery),
        );

  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        if (mentionQuery !== null) {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
        if (pendingMedia) {
          e.preventDefault();
          clearPendingMedia();
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (mentionQuery !== null) {
          const firstMentionable = mentionCandidates.find(memberCanMention);
          if (firstMentionable) {
            e.preventDefault();
            insertMention(firstMentionable);
            return;
          }
        }
        e.preventDefault();
        void handleSend();
      }
    },
    [clearPendingMedia, handleSend, insertMention, mentionCandidates, mentionQuery, pendingMedia],
  );

  const canSendMessage =
    Boolean(body.trim() || pendingMedia) && canPost && !composerLocked && !isSending;

  return (
    <>
      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <ul className="mention-suggestions" role="listbox" aria-label="Mention suggestions">
          {mentionCandidates.slice(0, 8).map((m) => {
            const canMention = memberCanMention(m);
            return (
              <li key={m.id ?? m.displayName}>
                <button
                  type="button"
                  role="option"
                  className={canMention ? undefined : "mention-suggestion--pending"}
                  disabled={!canMention}
                  aria-disabled={!canMention}
                  onClick={() => insertMention(m)}
                >
                  <span className="mention-suggestion-name">@{m.displayName}</span>
                  {!canMention ? (
                    <span className="mention-suggestion-hint">Not on CCO yet</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pendingMedia ? (
        <ComposerPendingMedia
          previewUrl={pendingMedia.previewUrl}
          kind={pendingMedia.kind}
          fileName={pendingMedia.file.name}
          onRemove={clearPendingMedia}
        />
      ) : null}

      {sendError ? (
        <p className="composer-send-error" role="alert">
          {sendError}
        </p>
      ) : null}

      {giphyOpen ? (
        <ComposerGiphyPicker
          open={giphyOpen}
          disabled={composerInputLocked || isSending}
          onClose={() => setGiphyOpen(false)}
          onSelect={(gif) => void onSendGiphy(gif.importUrl)}
        />
      ) : null}

      <form
        onSubmit={handleSend}
        className={[
          "composer",
          composerReadOnly ? "composer--readonly" : "",
          composerLocked ? "composer--locked" : "",
          pendingMedia ? "composer--has-pending-media" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-disabled={composerReadOnly || undefined}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.mp4,.webm,.mov"
          hidden
          disabled={composerInputLocked}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) stageComposerMedia(file);
            e.target.value = "";
          }}
        />
        <ComposerAttachMenu
          disabled={composerInputLocked}
          giphyEnabled={giphyEnabled}
          onPickMedia={() => fileRef.current?.click()}
          onPickGiphy={() => setGiphyOpen(true)}
        />
        <textarea
          ref={composerRef}
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={
            composerReadOnly
              ? (readOnlyReason ?? "You cannot post in this conversation.")
              : composerPlaceholder
          }
          enterKeyHint="send"
          disabled={composerInputLocked}
          readOnly={composerReadOnly}
          rows={1}
          aria-label="Message"
        />
        <button
          type="submit"
          className="composer-send"
          disabled={!canSendMessage}
          aria-label={isSending ? "Sending message" : "Send message"}
          aria-busy={isSending}
        >
          <svg className="composer-send-icon" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </>
  );
}

export type { PendingComposerMedia };

export function useComposerDragHandlers(params: {
  canPost: boolean;
  composerLocked: boolean;
  onDropFile: (file: File) => void;
}) {
  const { canPost, composerLocked, onDropFile } = params;
  const composerDragDepthRef = useRef(0);
  const [composerDragOver, setComposerDragOver] = useState(false);

  const resetComposerDragState = useCallback(() => {
    composerDragDepthRef.current = 0;
    setComposerDragOver(false);
  }, []);

  const handleComposerDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canPost || composerLocked) return;
      if (!dragEventHasMediaFiles(e.dataTransfer)) return;
      e.preventDefault();
      composerDragDepthRef.current += 1;
      setComposerDragOver(true);
    },
    [canPost, composerLocked],
  );

  const handleComposerDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canPost || composerLocked) return;
      if (!dragEventHasMediaFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setComposerDragOver(true);
    },
    [canPost, composerLocked],
  );

  const handleComposerDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
    if (composerDragDepthRef.current === 0) {
      setComposerDragOver(false);
    }
  }, []);

  const handleComposerDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      resetComposerDragState();
      if (!canPost || composerLocked || isAppUpdateInProgress()) return;
      const file = firstMediaFileFromDataTransfer(e.dataTransfer);
      if (file) onDropFile(file);
    },
    [canPost, composerLocked, onDropFile, resetComposerDragState],
  );

  return {
    composerDragOver,
    resetComposerDragState,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
  };
}

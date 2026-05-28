"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComposerAttachMenu } from "@/components/ComposerAttachMenu";
import { ComposerGiphyPicker } from "@/components/ComposerGiphyPicker";
import { ComposerPendingMedia } from "@/components/ComposerPendingMedia";
import {
  ComposerMentionInput,
  type ComposerMentionInputHandle,
} from "@/components/ComposerMentionInput";
import { MentionSuggestions, type MentionMember } from "@/components/MentionSuggestions";
import { fetchGiphyEnabled } from "@/lib/api";
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
  mediaFilesFromDataTransfer,
  revokePendingComposerMedia,
  revokePendingComposerMediaList,
  validateComposerMediaFile,
  type PendingComposerMedia,
} from "@/lib/composer-media";

type Member = MentionMember;

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
  /** Panel layout shows send errors in a floating banner above messages. */
  hideSendErrorBanner?: boolean;
  onSendError: (error: string | null) => void;
  onSend: (payload: { text: string; media: PendingComposerMedia[] }) => Promise<void>;
  onSendGiphy: (importUrl: string) => Promise<void>;
  onComposerLayout?: () => void;
  onMountStageMedia?: (stageMedia: (files: File | File[]) => void) => void;
  appUpdateBlocked: boolean;
};

export function ChatComposer({
  conversationId,
  canPost,
  composerLocked,
  readOnlyReason,
  coarsePointer,
  composerPlaceholder,
  members,
  resolvedUserId,
  sendError,
  hideSendErrorBanner = false,
  onSendError,
  onSend,
  onSendGiphy,
  onComposerLayout,
  onMountStageMedia,
  appUpdateBlocked,
}: Props) {
  const [body, setBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingComposerMedia[]>([]);
  const [composerDragOver, setComposerDragOver] = useState(false);
  const [giphyOpen, setGiphyOpen] = useState(false);
  const [giphyEnabled, setGiphyEnabled] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendInFlightRef = useRef(false);
  const composerDragDepthRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ComposerMentionInputHandle>(null);

  const composerReadOnly = !canPost;
  const composerInputLocked = composerLocked || composerReadOnly;

  useEffect(() => {
    if (!conversationId) return;
    const draft = readComposerDraft(conversationId);
    setBody(draft ?? "");
    setMentionQuery(null);
    setPendingMedia((current) => {
      revokePendingComposerMediaList(current);
      return [];
    });
    setGiphyOpen(false);
    onSendError(null);
  }, [conversationId, onSendError]);

  useEffect(() => {
    if (!appUpdateBlocked || !conversationId) return;
    saveComposerDraft(conversationId, body);
  }, [appUpdateBlocked, body, conversationId]);

  useEffect(() => {
    return () => revokePendingComposerMediaList(pendingMedia);
  }, [pendingMedia]);

  useEffect(() => {
    void fetchGiphyEnabled().then(setGiphyEnabled);
  }, []);

  useEffect(() => {
    if (canPost) return;
    composerRef.current?.blur();
  }, [canPost]);

  const resetComposerDragState = useCallback(() => {
    composerDragDepthRef.current = 0;
    setComposerDragOver(false);
  }, []);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }, []);

  const clearPendingMedia = useCallback(() => {
    setPendingMedia((current) => {
      revokePendingComposerMediaList(current);
      return [];
    });
  }, []);

  const removePendingMedia = useCallback((id: string) => {
    setPendingMedia((current) => {
      const removed = current.find((item) => item.id === id);
      revokePendingComposerMedia(removed ?? null);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const stageComposerMedia = useCallback(
    (files: File | File[]) => {
      if (!canPost || composerLocked || sendInFlightRef.current || isAppUpdateInProgress()) return;

      const fileList = Array.isArray(files) ? files : [files];
      if (fileList.length === 0) return;

      const nextItems: PendingComposerMedia[] = [];
      let lastError: string | null = null;

      for (const file of fileList) {
        const validationError = validateComposerMediaFile(file);
        if (validationError) {
          lastError = validationError;
          continue;
        }

        const next = createPendingComposerMedia(file);
        if (!next) {
          lastError = "Unsupported file type. Use an image or video.";
          continue;
        }

        nextItems.push(next);
      }

      if (nextItems.length === 0) {
        if (lastError) onSendError(lastError);
        return;
      }

      onSendError(lastError);
      setPendingMedia((current) => [...current, ...nextItems]);
      resetComposerDragState();
      focusComposer();
    },
    [canPost, composerLocked, focusComposer, onSendError, resetComposerDragState],
  );

  useEffect(() => {
    onMountStageMedia?.(stageComposerMedia);
  }, [onMountStageMedia, stageComposerMedia]);

  const insertMention = useCallback((member: Member) => {
    if (!memberCanMention(member) || !member.id) return;
    composerRef.current?.insertMention(member.displayName, member.id);
    setMentionQuery(null);
    composerRef.current?.focus();
  }, []);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = body.trim();
      const media = pendingMedia;
      if (
        !conversationId ||
        (!text && media.length === 0) ||
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
          revokePendingComposerMediaList(current);
          return [];
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
    },
    [canPost],
  );

  const mentionCandidates =
    mentionQuery === null
      ? []
      : members
          .filter(
            (m) =>
              m.id !== resolvedUserId &&
              m.displayName.toLowerCase().includes(mentionQuery),
          )
          .sort((a, b) => {
            const query = mentionQuery;
            const aStarts = a.displayName.toLowerCase().startsWith(query);
            const bStarts = b.displayName.toLowerCase().startsWith(query);
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            return a.displayName.localeCompare(b.displayName);
          });

  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        if (mentionQuery !== null) {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
        if (pendingMedia.length > 0) {
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
    Boolean(body.trim() || pendingMedia.length > 0) && canPost && !composerLocked && !isSending;

  return (
    <>
      {mentionQuery !== null ? (
        <MentionSuggestions
          members={mentionCandidates}
          onSelect={insertMention}
        />
      ) : null}

      {pendingMedia.length > 0 ? (
        <ComposerPendingMedia
          items={pendingMedia.map((item) => ({
            id: item.id,
            previewUrl: item.previewUrl,
            kind: item.kind,
          }))}
          coarsePointer={coarsePointer}
          onRemove={removePendingMedia}
        />
      ) : null}

      {sendError && !hideSendErrorBanner ? (
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
          pendingMedia.length > 0 ? "composer--has-pending-media" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-disabled={composerReadOnly || undefined}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.mp4,.webm,.mov"
          hidden
          disabled={composerInputLocked}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) stageComposerMedia(files);
            e.target.value = "";
          }}
        />
        <ComposerAttachMenu
          disabled={composerInputLocked}
          giphyEnabled={giphyEnabled}
          onPickMedia={() => fileRef.current?.click()}
          onPickGiphy={() => setGiphyOpen(true)}
        />
        <ComposerMentionInput
          ref={composerRef}
          value={body}
          onChange={handleBodyChange}
          onMentionQueryChange={setMentionQuery}
          onKeyDown={handleComposerKeyDown}
          placeholder={
            composerReadOnly
              ? (readOnlyReason ?? "You cannot post in this conversation.")
              : composerPlaceholder
          }
          disabled={composerInputLocked}
          readOnly={composerReadOnly}
          aria-label="Message"
          onLayout={onComposerLayout}
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
export type { ComposerPendingMediaItem } from "@/components/ComposerPendingMedia";

export function useComposerDragHandlers(params: {
  canPost: boolean;
  composerLocked: boolean;
  onDropFiles: (files: File[]) => void;
}) {
  const { canPost, composerLocked, onDropFiles } = params;
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
      const files = mediaFilesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) onDropFiles(files);
    },
    [canPost, composerLocked, onDropFiles, resetComposerDragState],
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

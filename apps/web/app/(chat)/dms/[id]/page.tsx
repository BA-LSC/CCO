"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import { ConversationCallKit } from "@/components/calls/ConversationCallKit";
import { ChannelSettingsPanel, ConversationMuteSetting } from "@/components/ChannelSettingsPanel";
import { PresenceMembersSection } from "@/components/PresenceMembersSection";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { PanelSettingsButton } from "@/components/PanelSettingsButton";
import { ChatThread } from "@/components/ChatThread";
import { ErrorState } from "@/components/PageStates";
import { useLoadConversationMessages } from "@/hooks/useLoadConversationMessages";
import { apiFetch, type DmDetail } from "@/lib/api";

export default function DmChatPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const { session } = useChatLayout();

  const [detail, setDetail] = useState<DmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const {
    threadMessages,
    threadHasMore,
    firstUnreadMessageId,
    messagesLoading,
    loadError,
    peerLastReadAt,
    peerUser,
  } = useLoadConversationMessages(conversationId);

  useEffect(() => {
    setDetailLoading(true);
    setError(null);

    apiFetch<DmDetail>(`/api/v1/dms/${conversationId}`)
      .then((dmData) => setDetail(dmData))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load conversation"))
      .finally(() => setDetailLoading(false));
  }, [conversationId]);

  const displayError = error ?? loadError;

  async function toggleMute(muted: boolean) {
    if (!detail) return;
    await apiFetch(`/api/v1/dms/${conversationId}/mute`, {
      method: "PATCH",
      body: JSON.stringify({ muted }),
    });
    setDetail({ ...detail, muted });
  }

  const members = detail
    ? [
        { id: detail.participant.id, displayName: detail.participant.displayName, avatarUrl: detail.participant.avatarUrl },
        ...(session?.userId && session.displayName
          ? [
              {
                id: session.userId,
                displayName: session.displayName,
                avatarUrl: session.avatarUrl ?? null,
              },
            ]
          : []),
      ]
    : [];

  const settingsMembers = detail
    ? [
        {
          id: detail.participant.id,
          displayName: detail.participant.displayName,
          avatarUrl: detail.participant.avatarUrl,
        },
        ...(session?.userId
          ? [
              {
                id: session.userId,
                displayName: session.displayName ?? "You",
                avatarUrl: session.avatarUrl ?? null,
              },
            ]
          : []),
      ]
    : [];

  if (!detailLoading && displayError && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="" subtitle="Direct message" loading />
        <div className="chat-panel-content">
          <ErrorState message={displayError} backHref="/dms" backLabel="Back to messages" />
        </div>
      </div>
    );
  }

  if (!detailLoading && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="" subtitle="Direct message" loading />
        <div className="chat-panel-content">
          <ErrorState message="Conversation not found" backHref="/dms" backLabel="Back to messages" />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <ChatPanelHeader
        title={detail?.participant.displayName ?? ""}
        subtitle="Direct message"
        avatarUrl={detail?.participant.avatarUrl ?? null}
        loading={detailLoading}
      >
        <ConversationCallKit conversationId={conversationId} disabled={detailLoading} />
        <PanelSettingsButton
          expanded={showOptions}
          label="Conversation settings"
          disabled={detailLoading}
          onClick={() => setShowOptions((v) => !v)}
        />
      </ChatPanelHeader>

      {detail && (
        <ChannelSettingsPanel open={showOptions}>
          <ConversationMuteSetting
            muted={detail.muted}
            onChange={toggleMute}
          />
          <PresenceMembersSection members={settingsMembers} enabled={showOptions} />
        </ChannelSettingsPanel>
      )}

      <div className="chat-panel-content">
        {displayError ? (
          <div className="chat-panel-banner-slot">
            <ChatHomeBanner
              key={displayError}
              variant="error"
              placement="panel"
              autoDismissMs={CHAT_PANEL_BANNER_AUTO_DISMISS_MS}
            >
              {displayError}
            </ChatHomeBanner>
          </div>
        ) : null}
        <ChatThread
          key={conversationId}
          conversationId={conversationId}
          initialMessages={threadMessages}
          hasMore={threadHasMore}
          firstUnreadMessageId={firstUnreadMessageId}
          members={members}
          currentUserId={session?.userId}
          layout="panel"
          composerPlaceholder="Message…"
          messagesLoading={messagesLoading || detailLoading}
          composerDisabled={detailLoading || messagesLoading}
          isDirectMessage
          initialPeerLastReadAt={peerLastReadAt}
          peerUser={peerUser ?? (detail ? {
            id: detail.participant.id,
            displayName: detail.participant.displayName,
            avatarUrl: detail.participant.avatarUrl,
          } : null)}
        />
      </div>
    </div>
  );
}

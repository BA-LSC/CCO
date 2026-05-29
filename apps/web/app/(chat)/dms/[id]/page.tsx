"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import {
  ConversationCallHeaderButton,
  ConversationCallShell,
} from "@/components/calls/ConversationCallContext";
import { ChannelSettingsPanel, ConversationMuteSetting } from "@/components/ChannelSettingsPanel";
import { DmGroupSettings } from "@/components/DmGroupSettings";
import { PresenceMembersSection } from "@/components/PresenceMembersSection";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { PanelSettingsButton } from "@/components/PanelSettingsButton";
import { ChatThread } from "@/components/ChatThread";
import { ErrorState } from "@/components/PageStates";
import { useLoadConversationMessages } from "@/hooks/useLoadConversationMessages";
import { apiFetch, type DmDetail } from "@/lib/api";
import { dispatchConversationUpdated } from "@/lib/sidebar-events";

export default function DmChatPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const { session, subscribeRealtime } = useChatLayout();

  const [detail, setDetail] = useState<DmDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const {
    threadMessages,
    threadCallEvents,
    threadHasMore,
    firstUnreadMessageId,
    messagesLoading,
    loadError,
    peerLastReadAt,
    peerUser,
    memberReadReceipts,
  } = useLoadConversationMessages(conversationId);

  useEffect(() => {
    setDetailLoading(true);
    setError(null);

    apiFetch<DmDetail>(`/api/v1/dms/${conversationId}`)
      .then((dmData) => setDetail(dmData))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load conversation"))
      .finally(() => setDetailLoading(false));
  }, [conversationId]);

  useEffect(() => {
    return subscribeRealtime((event) => {
      if (event.type !== "conversation.updated" || event.conversationId !== conversationId) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              ...(event.title !== undefined ? { title: event.title } : {}),
              ...(event.imageUrl !== undefined ? { imageUrl: event.imageUrl } : {}),
            }
          : prev,
      );
    });
  }, [conversationId, subscribeRealtime]);

  const displayError = error ?? loadError;
  const isGroup = detail?.kind === "group";
  const headerTitle = detail?.title ?? "";
  const headerSubtitle = isGroup
    ? `${detail?.participants.length ?? 0} members`
    : "Direct message";

  const members = useMemo(
    () =>
      detail?.participants.map((participant) => ({
        id: participant.id,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl ?? null,
      })) ?? [],
    [detail?.participants],
  );

  const settingsMembers = members;

  async function toggleMute(muted: boolean) {
    if (!detail) return;
    await apiFetch(`/api/v1/dms/${conversationId}/mute`, {
      method: "PATCH",
      body: JSON.stringify({ muted }),
    });
    setDetail({ ...detail, muted });
  }

  function applyGroupUpdates(updates: { title?: string; imageUrl?: string | null }) {
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.imageUrl !== undefined ? { imageUrl: updates.imageUrl } : {}),
      };
    });
    dispatchConversationUpdated({ conversationId, ...updates });
  }

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
    <ConversationCallShell conversationId={conversationId} disabled={detailLoading}>
      <div className="chat-panel">
        <ChatPanelHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          avatarUrl={
            isGroup ? detail?.imageUrl ?? null : detail?.participant?.avatarUrl ?? null
          }
          avatarUserId={!isGroup ? detail?.participant?.id : null}
          loading={detailLoading}
        >
          <ConversationCallHeaderButton disabled={detailLoading} />
          <PanelSettingsButton
            expanded={showOptions}
            label="Conversation settings"
            disabled={detailLoading}
            onClick={() => setShowOptions((v) => !v)}
          />
        </ChatPanelHeader>

        <div className="chat-panel-content">
        {detail && (
          <ChannelSettingsPanel open={showOptions} onClose={() => setShowOptions(false)}>
            <ConversationMuteSetting muted={detail.muted} onChange={toggleMute} />
            {isGroup ? (
              <DmGroupSettings
                conversationId={conversationId}
                title={detail.title}
                imageUrl={detail.imageUrl}
                onUpdated={applyGroupUpdates}
              />
            ) : null}
            <PresenceMembersSection members={settingsMembers} enabled={showOptions} />
          </ChannelSettingsPanel>
        )}
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
          initialCallEvents={threadCallEvents}
          hasMore={threadHasMore}
          firstUnreadMessageId={firstUnreadMessageId}
          members={members}
          currentUserId={session?.userId}
          layout="panel"
          composerPlaceholder={isGroup ? "Message group…" : "Message…"}
          messagesLoading={messagesLoading || detailLoading}
          composerDisabled={detailLoading || messagesLoading}
          isDirectMessage={!isGroup}
          initialPeerLastReadAt={peerLastReadAt}
          peerUser={
            !isGroup
              ? peerUser ??
                (detail?.participant
                  ? {
                      id: detail.participant.id,
                      displayName: detail.participant.displayName,
                      avatarUrl: detail.participant.avatarUrl,
                    }
                  : null)
              : null
          }
          initialMemberReadReceipts={isGroup ? memberReadReceipts : []}
        />
        </div>
      </div>
    </ConversationCallShell>
  );
}

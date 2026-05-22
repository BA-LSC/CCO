"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import { ChannelSettingsPanel, ConversationMuteSetting } from "@/components/ChannelSettingsPanel";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { PanelSettingsButton } from "@/components/PanelSettingsButton";
import { ChatThread } from "@/components/ChatThread";
import { ErrorState } from "@/components/PageStates";
import { apiFetch, type DmDetail, type Message, type MessageListResponse } from "@/lib/api";
import { getCachedMessages, setCachedMessages } from "@/lib/message-cache";
import { conversationMessagesPath } from "@/lib/messages";

export default function DmChatPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const { session } = useChatLayout();

  const [detail, setDetail] = useState<DmDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [messagesForConversationId, setMessagesForConversationId] = useState<string | null>(
    null,
  );
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const threadMessages =
    messagesForConversationId === conversationId ? messages : [];
  const threadHasMore = messagesForConversationId === conversationId ? hasMore : false;

  useEffect(() => {
    setDetailLoading(true);
    setError(null);

    apiFetch<DmDetail>(`/api/v1/dms/${conversationId}`)
      .then((dmData) => setDetail(dmData))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load conversation"))
      .finally(() => setDetailLoading(false));
  }, [conversationId]);

  useEffect(() => {
    const cached = getCachedMessages(conversationId);
    if (cached) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setFirstUnreadMessageId(cached.firstUnreadMessageId ?? null);
      setMessagesForConversationId(conversationId);
      setMessagesLoading(false);
    } else {
      setMessages([]);
      setHasMore(false);
      setMessagesForConversationId(null);
      setMessagesLoading(true);
    }

    let cancelled = false;
    apiFetch<MessageListResponse>(
      conversationMessagesPath(conversationId),
    )
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setFirstUnreadMessageId(data.firstUnreadMessageId);
        setMessagesForConversationId(conversationId);
        setCachedMessages(conversationId, {
          messages: data.messages,
          hasMore: data.hasMore,
          firstUnreadMessageId: data.firstUnreadMessageId,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load messages");
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

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
        { id: detail.participant.id, displayName: detail.participant.displayName },
        ...(session?.userId && session.displayName
          ? [{ id: session.userId, displayName: session.displayName }]
          : []),
      ]
    : [];

  if (!detailLoading && error && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="" subtitle="Direct message" loading />
        <div className="chat-panel-content">
          <ErrorState message={error} backHref="/dms" backLabel="Back to messages" />
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
        <PanelSettingsButton
          expanded={showOptions}
          label="Conversation settings"
          disabled={detailLoading}
          onClick={() => setShowOptions((v) => !v)}
        />
      </ChatPanelHeader>

      {showOptions && detail && (
        <ChannelSettingsPanel>
          <ConversationMuteSetting
            muted={detail.muted}
            onChange={toggleMute}
          />
        </ChannelSettingsPanel>
      )}

      {error && (
        <div className="alert alert-error" role="alert" style={{ margin: "8px 20px 0" }}>
          {error}
        </div>
      )}

      <div className="chat-panel-content">
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
        />
      </div>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import { ChannelSettingsPanel, ConversationMuteSetting } from "@/components/ChannelSettingsPanel";
import { ChannelMembersSection, type ChannelMember } from "@/components/ChannelMembersSection";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { ChatThread } from "@/components/ChatThread";
import { ErrorState } from "@/components/PageStates";
import { PanelSettingsButton } from "@/components/PanelSettingsButton";
import { apiFetch, type Message, type MessageListResponse } from "@/lib/api";
import { getCachedMessages, setCachedMessages } from "@/lib/message-cache";
import { conversationMessagesPath } from "@/lib/messages";

type TeamDetail = {
  team: { id: string; name: string; pcoTeamId: string };
  conversation: { id: string; title: string; slug: string; muted: boolean } | null;
  membershipRole: string;
  serviceTypeNames?: string[];
  members?: ChannelMember[];
};

function formatServiceTypeSubtitle(serviceTypeNames?: string[]): string | undefined {
  if (!serviceTypeNames?.length) return undefined;
  return serviceTypeNames.join(" · ");
}

export default function TeamChatPage() {
  const params = useParams();
  const teamId = params.id as string;
  const { session } = useChatLayout();

  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const conversationId = detail?.conversation?.id ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [messagesForConversationId, setMessagesForConversationId] = useState<string | null>(
    null,
  );
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const isLeader =
    detail?.membershipRole === "leader" || detail?.membershipRole === "admin";

  const threadMessages =
    messagesForConversationId === conversationId ? messages : [];
  const threadHasMore = messagesForConversationId === conversationId ? hasMore : false;

  async function reloadDetail() {
    const data = await apiFetch<TeamDetail>(`/api/v1/services/teams/${teamId}`);
    setDetail(data);
    return data;
  }

  useEffect(() => {
    setDetail(null);
    setDetailLoading(true);
    setError(null);

    apiFetch<TeamDetail>(`/api/v1/services/teams/${teamId}`)
      .then((teamData) => setDetail(teamData))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load team"))
      .finally(() => setDetailLoading(false));
  }, [teamId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(false);
      setMessagesLoading(false);
      return;
    }

    const cached = getCachedMessages(conversationId);
    if (cached) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setFirstUnreadMessageId(cached.firstUnreadMessageId ?? null);
      setMessagesForConversationId(conversationId);
      setMessagesLoading(true);
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
    if (!detail?.conversation) return;
    await apiFetch(`/api/v1/conversations/${detail.conversation.id}/mute`, {
      method: "PATCH",
      body: JSON.stringify({ muted }),
    });
    setDetail({
      ...detail,
      conversation: { ...detail.conversation, muted },
    });
  }

  async function removeFromTeam(userId: string, displayName: string) {
    if (!confirm(`Remove ${displayName} from this team in Planning Center?`)) return;
    setRemovingMemberId(userId);
    setError(null);
    try {
      await apiFetch(`/api/v1/services/teams/${teamId}/members/${userId}`, { method: "DELETE" });
      await reloadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  function inviteMember(member: ChannelMember) {
    const url = `${window.location.origin}/auth/sign-in?next=${encodeURIComponent(`/teams/${teamId}`)}`;
    const message = `${member.displayName}, join our team chat on CCO: ${url}`;
    const hasEmail = member.email && !member.email.includes("@placeholder.local");

    if (hasEmail) {
      window.location.href = `mailto:${encodeURIComponent(member.email!)}?subject=${encodeURIComponent("Join team chat on CCO")}&body=${encodeURIComponent(message)}`;
      return;
    }

    void navigator.clipboard.writeText(message).then(() => {
      setInviteFeedback(`Invite link copied for ${member.displayName}`);
      window.setTimeout(() => setInviteFeedback(null), 3000);
    });
  }

  const mentionMembers =
    detail?.members?.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      onCco: member.onCco,
    })) ?? [];

  if (!detailLoading && error && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="Loading" loading />
        <div className="chat-panel-content">
          <ErrorState message={error} backHref="/teams" backLabel="Back to teams" />
        </div>
      </div>
    );
  }

  if (!detailLoading && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="Loading" loading />
        <div className="chat-panel-content">
          <ErrorState message="Team not found" backHref="/teams" backLabel="Back to teams" />
        </div>
      </div>
    );
  }

  if (!detailLoading && detail && !detail.conversation) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title={detail.team.name} subtitle={formatServiceTypeSubtitle(detail.serviceTypeNames) ?? "Services team"} />
        <div className="empty-chat-pane">
          <h2>No chat yet</h2>
          <p>
            No chat conversation is available for this team yet. Try syncing teams from the sidebar,
            or contact your church admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <ChatPanelHeader
        title={detail?.team.name ?? ""}
        subtitle={formatServiceTypeSubtitle(detail?.serviceTypeNames) ?? "Services team"}
        loading={detailLoading}
      >
        <PanelSettingsButton
          expanded={showSettings}
          label="Team settings"
          disabled={detailLoading || !detail?.conversation}
          onClick={() => setShowSettings((v) => !v)}
        />
      </ChatPanelHeader>

      {error && (
        <div className="alert alert-error" role="alert" style={{ margin: "8px 20px 0" }}>
          {error}
        </div>
      )}

      {showSettings && detail?.conversation && (
        <ChannelSettingsPanel>
          <ConversationMuteSetting
            muted={detail.conversation.muted}
            onChange={toggleMute}
          />

          <ChannelMembersSection
            title="Team members"
            members={detail.members ?? []}
            isLeader={isLeader}
            sessionUserId={session?.userId}
            inviteFeedback={inviteFeedback}
            removingMemberId={removingMemberId}
            onInvite={isLeader ? inviteMember : undefined}
            onRemove={isLeader ? removeFromTeam : undefined}
          />
        </ChannelSettingsPanel>
      )}

      <div className="chat-panel-content">
        <ChatThread
          key={conversationId ?? "team"}
          conversationId={detail?.conversation?.id ?? null}
          initialMessages={threadMessages}
          hasMore={threadHasMore}
          firstUnreadMessageId={firstUnreadMessageId}
          members={mentionMembers}
          currentUserId={session?.userId}
          isGroupLeader={isLeader}
          layout="panel"
          composerPlaceholder="Message your team…"
          messagesLoading={messagesLoading || detailLoading}
          composerDisabled={detailLoading || messagesLoading || !detail?.conversation?.id}
        />
      </div>
    </div>
  );
}

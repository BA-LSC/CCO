"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import { ConversationCallKit } from "@/components/calls/ConversationCallKit";
import { CallActionButtonPlaceholder } from "@/components/calls/CallControls";
import { ChannelSettingsPanel, ConversationMuteSetting } from "@/components/ChannelSettingsPanel";
import { ChannelMembersSection, type ChannelMember } from "@/components/ChannelMembersSection";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { ChatThread } from "@/components/ChatThread";
import { ErrorState } from "@/components/PageStates";
import { PanelSettingsButton } from "@/components/PanelSettingsButton";
import { dispatchSidebarReload } from "@/lib/sidebar-events";
import { useLoadConversationMessages } from "@/hooks/useLoadConversationMessages";
import { apiFetch, getErrorMessage } from "@/lib/api";

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

export default function TeamConversationPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const conversationId = params.conversationId as string;
  const { session } = useChatLayout();

  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const {
    threadMessages,
    threadHasMore,
    firstUnreadMessageId,
    messagesLoading,
    loadError,
    memberReadReceipts,
  } = useLoadConversationMessages(conversationId);

  const isLeader =
    detail?.membershipRole === "leader" || detail?.membershipRole === "admin";
  const displayError = error ?? loadError;

  async function reloadDetail(options?: { sync?: boolean }) {
    const query = options?.sync ? "?sync=1" : "";
    const data = await apiFetch<TeamDetail>(`/api/v1/services/teams/${teamId}${query}`);
    setDetail(data);
    return data;
  }

  useEffect(() => {
    setDetail(null);
    setDetailLoading(true);
    setError(null);

    apiFetch<TeamDetail>(`/api/v1/services/teams/${teamId}`)
      .then((teamData) => setDetail(teamData))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setDetailLoading(false));
  }, [teamId]);

  useEffect(() => {
    if (!detail?.conversation) return;
    if (detail.conversation.id !== conversationId) {
      router.replace(`/teams/${teamId}/c/${detail.conversation.id}`);
    }
  }, [detail, conversationId, teamId, router]);

  useEffect(() => {
    if (!showSettings || !isLeader) return;
    void reloadDetail({ sync: true }).catch((err) =>
      setError(getErrorMessage(err)),
    );
  }, [showSettings, isLeader, teamId]);

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
      await reloadDetail({ sync: true });
      dispatchSidebarReload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemovingMemberId(null);
    }
  }

  function inviteMember(member: ChannelMember) {
    const nextPath = `/teams/${teamId}/c/${conversationId}`;
    const url = `${window.location.origin}/auth/sign-in?next=${encodeURIComponent(nextPath)}`;
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
      avatarUrl: member.avatarUrl,
    })) ?? [];

  if (!detailLoading && displayError && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="Loading" loading />
        <div className="chat-panel-content">
          <ErrorState message={displayError} backHref="/teams" backLabel="Back to teams" />
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
        <ChatPanelHeader
          title={detail.team.name}
          subtitle={formatServiceTypeSubtitle(detail.serviceTypeNames) ?? "Services team"}
        />
        <div className="empty-chat-pane">
          <h2>No chat yet</h2>
          <p>
            No chat conversation is available for this team yet. Try syncing teams from Admin
            Settings, or contact your church admin.
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
        {conversationId ? (
          <ConversationCallKit conversationId={conversationId} disabled={detailLoading} />
        ) : detailLoading ? (
          <CallActionButtonPlaceholder />
        ) : null}
        <PanelSettingsButton
          expanded={showSettings}
          label="Team settings"
          disabled={detailLoading || !detail?.conversation}
          onClick={() => setShowSettings((v) => !v)}
        />
      </ChatPanelHeader>

      {detail?.conversation && (
        <ChannelSettingsPanel open={showSettings}>
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
          members={mentionMembers}
          currentUserId={session?.userId}
          isGroupLeader={isLeader}
          layout="panel"
          composerPlaceholder="Message your team…"
          messagesLoading={messagesLoading}
          composerDisabled={detailLoading || messagesLoading}
          initialMemberReadReceipts={memberReadReceipts}
        />
      </div>
    </div>
  );
}

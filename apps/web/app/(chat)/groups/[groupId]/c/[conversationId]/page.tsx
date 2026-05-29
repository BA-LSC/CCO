"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import { ConversationCallKit } from "@/components/calls/ConversationCallKit";
import { ChannelSettingsPanel, ConversationMuteSetting } from "@/components/ChannelSettingsPanel";
import { ChannelMembersSection, type ChannelMember } from "@/components/ChannelMembersSection";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { PanelSettingsButton } from "@/components/PanelSettingsButton";
import { ChatThread } from "@/components/ChatThread";
import { ErrorState } from "@/components/PageStates";
import { useLoadConversationMessages } from "@/hooks/useLoadConversationMessages";
import { apiFetch, getErrorMessage, type GroupDetail } from "@/lib/api";
import { canPostInGroupChannel } from "@/lib/group-permissions";
import { dispatchConversationUpdated, subscribeConversationUpdated } from "@/lib/sidebar-events";

type ConversationMember = { id: string; displayName: string; role: string };

export default function GroupConversationPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;
  const conversationId = params.conversationId as string;
  const { session } = useChatLayout();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [channelAccessIds, setChannelAccessIds] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editLeaderOnly, setEditLeaderOnly] = useState(false);
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [conversationCanPost, setConversationCanPost] = useState<boolean | null>(null);

  const {
    threadMessages,
    threadHasMore,
    firstUnreadMessageId,
    messagesLoading,
    canPost: messagesCanPost,
    loadError,
    memberReadReceipts,
  } = useLoadConversationMessages(conversationId);

  const isLeader =
    detail?.membershipRole === "leader" || detail?.membershipRole === "admin";
  const displayError = error ?? loadError;

  async function reloadDetail(options?: { sync?: boolean }) {
    const query = options?.sync ? "?sync=1" : "";
    const data = await apiFetch<GroupDetail>(`/api/v1/groups/${groupId}${query}`);
    setDetail(data);
    return data;
  }

  useEffect(() => {
    setDetail(null);
    setDetailLoading(true);
    setError(null);

    apiFetch<GroupDetail>(`/api/v1/groups/${groupId}`)
      .then((groupData) => setDetail(groupData))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setDetailLoading(false));
  }, [groupId]);

  useEffect(() => {
    if (!detail) return;
    const exists = detail.conversations.some((c) => c.id === conversationId);
    if (!exists && detail.conversations[0]) {
      router.replace(`/groups/${groupId}/c/${detail.conversations[0].id}`);
    }
  }, [detail, conversationId, groupId, router]);

  useEffect(() => {
    setConversationCanPost(null);
  }, [conversationId]);

  useEffect(() => {
    if (typeof messagesCanPost === "boolean") {
      setConversationCanPost(messagesCanPost);
    }
  }, [messagesCanPost, conversationId]);

  useEffect(() => {
    return subscribeConversationUpdated(({ conversationId: updatedId, leaderOnly, title }) => {
      setDetail((prev) => {
        if (!prev) return prev;
        if (!prev.conversations.some((conversation) => conversation.id === updatedId)) return prev;

        const nextCanPost =
          leaderOnly !== undefined
            ? canPostInGroupChannel({
                membershipRole: prev.membershipRole,
                leaderOnly,
              })
            : undefined;

        if (updatedId === conversationId && nextCanPost !== undefined) {
          setConversationCanPost(nextCanPost);
        }

        return {
          ...prev,
          conversations: prev.conversations.map((conversation) =>
            conversation.id === updatedId
              ? {
                  ...conversation,
                  ...(leaderOnly !== undefined ? { leaderOnly } : {}),
                  ...(title !== undefined ? { title } : {}),
                  ...(nextCanPost !== undefined ? { canPost: nextCanPost } : {}),
                }
              : conversation,
          ),
        };
      });
      if (updatedId !== conversationId) return;
      if (leaderOnly !== undefined) setEditLeaderOnly(leaderOnly);
      if (title !== undefined) setEditTitle(title);
    });
  }, [conversationId]);

  useEffect(() => {
    if (!showChannelSettings || !isLeader) return;
    void reloadDetail({ sync: true }).catch((err) => setError(getErrorMessage(err)));
    apiFetch<{ members: ConversationMember[] }>(
      `/api/v1/conversations/${conversationId}/members?groupId=${encodeURIComponent(groupId)}`,
    )
      .then((data) => setChannelAccessIds(data.members.map((m) => m.id)))
      .catch(() => setChannelAccessIds([]));
  }, [showChannelSettings, conversationId, groupId, isLeader]);

  function toggleChannelAccess(userId: string, hasAccess: boolean) {
    const nextIds = hasAccess
      ? channelAccessIds.includes(userId)
        ? channelAccessIds
        : [...channelAccessIds, userId]
      : channelAccessIds.filter((id) => id !== userId);
    setChannelAccessIds(nextIds);
    void saveChannelMembersAccess(nextIds);
  }

  async function patchConversationSettings(options: {
    title?: string;
    leaderOnly?: boolean;
  }) {
    if (!activeConversation) return;

    const isGeneral = activeConversation.slug === "general";
    const payload = isGeneral
      ? { leaderOnly: options.leaderOnly ?? editLeaderOnly }
      : {
          ...(options.title !== undefined ? { title: options.title.trim() } : {}),
          ...(options.leaderOnly !== undefined ? { leaderOnly: options.leaderOnly } : {}),
        };

    if (!isGeneral && "title" in payload && !payload.title) return;

    setError(null);
    try {
      await apiFetch(
        `/api/v1/conversations/${conversationId}?groupId=${encodeURIComponent(groupId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save channel settings");
      await reloadDetail().catch(() => undefined);
      if (activeConversation) {
        setEditTitle(activeConversation.title);
        setEditLeaderOnly(activeConversation.leaderOnly);
      }
    }
  }

  function applyConversationUpdate(updates: { leaderOnly?: boolean; title?: string }) {
    setDetail((prev) => {
      if (!prev) return prev;

      const nextCanPost =
        updates.leaderOnly !== undefined
          ? canPostInGroupChannel({
              membershipRole: prev.membershipRole,
              leaderOnly: updates.leaderOnly,
            })
          : undefined;

      if (nextCanPost !== undefined) {
        setConversationCanPost(nextCanPost);
      }

      return {
        ...prev,
        conversations: prev.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                ...updates,
                ...(nextCanPost !== undefined ? { canPost: nextCanPost } : {}),
              }
            : conversation,
        ),
      };
    });
    if (updates.leaderOnly !== undefined) setEditLeaderOnly(updates.leaderOnly);
    if (updates.title !== undefined) setEditTitle(updates.title);
    dispatchConversationUpdated({ conversationId, ...updates });
  }

  async function saveChannelMembersAccess(userIds: string[]) {
    setError(null);
    try {
      await apiFetch(
        `/api/v1/conversations/${conversationId}/members?groupId=${encodeURIComponent(groupId)}`,
        {
          method: "PUT",
          body: JSON.stringify({ userIds }),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save channel access");
      const data = await apiFetch<{ members: ConversationMember[] }>(
        `/api/v1/conversations/${conversationId}/members?groupId=${encodeURIComponent(groupId)}`,
      ).catch(() => null);
      if (data) setChannelAccessIds(data.members.map((member) => member.id));
    }
  }

  function handleLeaderOnlyChange(leaderOnly: boolean) {
    applyConversationUpdate({ leaderOnly });
    void patchConversationSettings({ leaderOnly });
  }

  function handleTitleChange(value: string) {
    setEditTitle(value);
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === activeConversation?.title) return;
      void patchConversationSettings({ title: trimmed });
    }, 500);
  }

  function handleTitleBlur() {
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === activeConversation?.title) return;
    void patchConversationSettings({ title: trimmed });
  }

  useEffect(() => {
    return () => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    };
  }, []);

  async function toggleMute(muted: boolean) {
    await apiFetch(`/api/v1/conversations/${conversationId}/mute`, {
      method: "PATCH",
      body: JSON.stringify({ muted }),
    });
    await reloadDetail();
  }

  async function removeFromGroup(userId: string, displayName: string) {
    if (!confirm(`Remove ${displayName} from this group in Planning Center?`)) return;
    setRemovingMemberId(userId);
    setError(null);
    try {
      await apiFetch(`/api/v1/groups/${groupId}/members/${userId}`, { method: "DELETE" });
      await reloadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  function inviteMember(member: ChannelMember) {
    const url = `${window.location.origin}/auth/sign-in?next=${encodeURIComponent(`/groups/${groupId}/c/${conversationId}`)}`;
    const message = `${member.displayName}, join our group chat on CCO: ${url}`;
    const hasEmail = member.email && !member.email.includes("@placeholder.local");

    if (hasEmail) {
      window.location.href = `mailto:${encodeURIComponent(member.email!)}?subject=${encodeURIComponent("Join group chat on CCO")}&body=${encodeURIComponent(message)}`;
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

  async function archiveConversation() {
    if (!confirm("Archive this channel? It will be hidden from the list.")) return;
    try {
      await apiFetch(
        `/api/v1/conversations/${conversationId}/archive?groupId=${encodeURIComponent(groupId)}`,
        { method: "POST" },
      );
      const data = await reloadDetail();
      const remaining = data.conversations.filter((c) => c.id !== conversationId);
      const general = remaining.find((c) => c.slug === "general");
      const next = general ?? remaining[0];
      if (next) {
        router.push(`/groups/${groupId}/c/${next.id}`);
      } else {
        router.push("/groups");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive channel");
    }
  }

  const activeConversation = detail?.conversations.find((c) => c.id === conversationId);
  const showChannelHiddenAccess =
    isLeader && activeConversation?.slug !== "general";
  const canPostInActive =
    conversationCanPost ??
    activeConversation?.canPost ??
    (activeConversation
      ? canPostInGroupChannel({
          membershipRole: detail?.membershipRole,
          leaderOnly: activeConversation.leaderOnly,
        })
      : false);
  const composerDisabled = detailLoading || messagesLoading;

  function openChannelSettings() {
    setShowChannelSettings((open) => {
      if (!open && isLeader && activeConversation) {
        setEditTitle(activeConversation.title);
        setEditLeaderOnly(activeConversation.leaderOnly);
      }
      return !open;
    });
  }

  if (!detailLoading && displayError && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="Loading" loading />
        <div className="chat-panel-content">
          <ErrorState message={displayError} backHref="/groups" backLabel="Back to groups" />
        </div>
      </div>
    );
  }

  if (!detailLoading && !detail) {
    return (
      <div className="chat-panel">
        <ChatPanelHeader title="Loading" loading />
        <div className="chat-panel-content">
          <ErrorState message="Group not found" backHref="/groups" backLabel="Back to groups" />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <ChatPanelHeader
        title={detail?.group.name ?? ""}
        subtitle={activeConversation ? `#${activeConversation.title}` : undefined}
        avatarUrl={detail?.group.imageUrl ?? null}
        loading={detailLoading}
      >
        <ConversationCallKit conversationId={conversationId} disabled={detailLoading} />
        <PanelSettingsButton
          expanded={showChannelSettings}
          disabled={detailLoading || !activeConversation}
          onClick={openChannelSettings}
        />
      </ChatPanelHeader>

      {activeConversation && detail && (
        <ChannelSettingsPanel open={showChannelSettings}>
          <ConversationMuteSetting
            muted={activeConversation.muted ?? false}
            onChange={toggleMute}
          />

          {isLeader && activeConversation.slug !== "general" && (
            <section className="channel-settings-group" aria-label="Channel settings">
              <label className="channel-settings-field">
                <span className="channel-settings-field-label">Channel name</span>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onBlur={handleTitleBlur}
                  aria-label="Channel name"
                />
              </label>
            </section>
          )}

          {isLeader && (
            <section className="channel-settings-group" aria-label="Channel permissions">
              <div className="channel-settings-group-intro">
                <h3 className="channel-settings-group-label">Channel permissions</h3>
                {activeConversation.slug === "general" && (
                  <p className="channel-settings-group-desc">
                    All group members always have access to the general channel.
                  </p>
                )}
              </div>

              <div className="channel-settings-card">
                <label className="channel-settings-row channel-settings-toggle">
                  <span className="channel-settings-row-label">Leaders only can post</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={editLeaderOnly}
                    onChange={(e) => handleLeaderOnlyChange(e.target.checked)}
                    aria-label="Leaders only can post"
                  />
                  <span className="toggle-switch" aria-hidden="true" />
                </label>
              </div>
            </section>
          )}

          <ChannelMembersSection
            title="Group members"
            members={detail.members ?? []}
            isLeader={isLeader}
            sessionUserId={session?.userId}
            inviteFeedback={inviteFeedback}
            removingMemberId={removingMemberId}
            onInvite={isLeader ? inviteMember : undefined}
            onRemove={isLeader ? removeFromGroup : undefined}
            channelAccess={
              showChannelHiddenAccess
                ? {
                    channelAccessIds,
                    onToggleAccess: toggleChannelAccess,
                  }
                : undefined
            }
          />

          {isLeader && activeConversation.slug !== "general" && (
            <section className="channel-settings-group channel-settings-group-danger" aria-label="Danger zone">
              <div className="channel-settings-card">
                <button
                  type="button"
                  className="channel-settings-danger-action"
                  onClick={() => void archiveConversation()}
                >
                  Archive channel
                </button>
              </div>
            </section>
          )}
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
          canPost={canPostInActive}
          readOnlyReason={
            !canPostInActive
              ? "Only group leaders can post in this channel."
              : undefined
          }
          onConversationSettingsChange={applyConversationUpdate}
          layout="panel"
          messagesLoading={messagesLoading}
          composerDisabled={composerDisabled}
          initialMemberReadReceipts={memberReadReceipts}
        />
      </div>
    </div>
  );
}

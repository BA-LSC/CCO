"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { GroupSidebarSection } from "@/components/GroupSidebarSection";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { usePlanningCenterSync } from "@/components/PlanningCenterSyncContext";
import { UserAvatarWithPresence } from "@/components/UserAvatarWithPresence";
import { DmSidebarSubtitle } from "@/components/DmSidebarSubtitle";
import { usePresenceWatch } from "@/components/PresenceProvider";
import {
  SidebarCrownIcon,
} from "@/components/PanelHeaderIcons";
import { SidebarSectionHeader } from "@/components/SidebarSectionHeader";
import { UserMenu } from "@/components/UserMenu";
import {
  apiFetch,
  getErrorMessage,
  type DmSummary,
  type GroupSidebarItem,
  type Message,
  type ServiceTeamSummary,
} from "@/lib/api";
import { requestComposerFocus } from "@/lib/composer-events";
import { formatSidebarMessagePreview } from "@/lib/message-preview";
import { subscribeUnreadChanged } from "@/lib/sidebar-events";
import { fetchSetupStatus } from "@/lib/setup";
import {
  groupTeamsByServiceType,
  shouldShowTeamServiceSections,
} from "@/lib/service-team-sidebar";

function sortDmsByActivity(dms: DmSummary[]): DmSummary[] {
  return [...dms].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}

function previewFromMessage(
  message: Message,
  currentUserId: string | undefined,
  otherParticipantDisplayName?: string,
): string | null {
  const authorIsSelf = message.authorId === currentUserId;
  return formatSidebarMessagePreview({
    body: message.body,
    attachmentUrl: message.attachmentUrl,
    messageType: message.messageType,
    authorIsSelf,
    authorDisplayName: authorIsSelf
      ? undefined
      : (otherParticipantDisplayName ?? message.authorName),
  });
}

function applyDmMessagePreview(
  dms: DmSummary[],
  conversationId: string,
  preview: string | null,
  activityAt: string,
  hasUnread?: boolean,
): DmSummary[] {
  const next = dms.map((dm) => {
    if (dm.id !== conversationId) return dm;
    return {
      ...dm,
      lastMessagePreview: preview,
      lastActivityAt: activityAt,
      ...(hasUnread !== undefined ? { hasUnread } : {}),
    };
  });
  return sortDmsByActivity(next);
}

export function ChatSidebar() {
  const pathname = usePathname();
  const { sidebarOpen, closeSidebar, subscribeRealtime, session, activeConversationId } =
    useChatLayout();

  const [groups, setGroups] = useState<GroupSidebarItem[]>([]);
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [teams, setTeams] = useState<ServiceTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pcoSync = usePlanningCenterSync();

  const [setupChurchName, setSetupChurchName] = useState<string | null>(null);

  const loadSidebar = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [groupsData, dmsData, teamsData] = await Promise.all([
        apiFetch<{ groups: GroupSidebarItem[] }>("/api/v1/groups/sidebar"),
        apiFetch<{ conversations: DmSummary[] }>("/api/v1/dms"),
        apiFetch<{ teams: ServiceTeamSummary[] }>("/api/v1/services/teams"),
      ]);
      setGroups(groupsData.groups);
      setDms(dmsData.conversations);
      setTeams(teamsData.teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sidebar");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSidebar();
  }, [loadSidebar]);

  useEffect(() => {
    void fetchSetupStatus().then((status) => {
      if (status.churchName) setSetupChurchName(status.churchName);
    });
  }, []);

  const churchName = session?.organizationName?.trim() || setupChurchName;

  useEffect(() => {
    if (!pcoSync) return;
    return pcoSync.registerSidebarReload(() => loadSidebar({ silent: true }));
  }, [pcoSync, loadSidebar]);

  useEffect(() => {
    const onReload = () => void loadSidebar({ silent: true });
    window.addEventListener("cco:sidebar-reload", onReload);
    return () => window.removeEventListener("cco:sidebar-reload", onReload);
  }, [loadSidebar]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadSidebar({ silent: true });
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [loadSidebar]);

  useEffect(() => {
    return subscribeUnreadChanged(({ conversationId, hasUnread }) => {
      setDms((prev) =>
        prev.map((dm) => (dm.id === conversationId ? { ...dm, hasUnread } : dm)),
      );
      setTeams((prev) =>
        prev.map((team) =>
          team.conversationId === conversationId ? { ...team, hasUnread } : team,
        ),
      );
    });
  }, []);

  useEffect(() => {
    return subscribeRealtime((event) => {
      if (!activeConversationId) return;

      if (event.type === "message.created" && event.message) {
        setDms((prev) => {
          const dm = prev.find((row) => row.id === activeConversationId);
          const preview = previewFromMessage(
            event.message,
            session?.userId,
            dm?.participant.displayName,
          );
          return applyDmMessagePreview(
            prev,
            activeConversationId,
            preview,
            event.message.createdAt,
          );
        });
        return;
      }

      if (event.type === "message.updated" && event.message) {
        setDms((prev) => {
          const dm = prev.find((row) => row.id === activeConversationId);
          const preview = previewFromMessage(
            event.message,
            session?.userId,
            dm?.participant.displayName,
          );
          return applyDmMessagePreview(
            prev,
            activeConversationId,
            preview,
            event.message.createdAt,
          );
        });
        return;
      }

      if (event.type === "message.deleted") {
        void loadSidebar({ silent: true });
      }
    });
  }, [activeConversationId, loadSidebar, session?.userId, subscribeRealtime]);

  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  const activeDmId = pathname.match(/^\/dms\/([^/]+)/)?.[1] ?? null;
  const activeTeamId = pathname.match(/^\/teams\/([^/]+)/)?.[1] ?? null;

  const teamGroups = useMemo(() => groupTeamsByServiceType(teams), [teams]);
  const showTeamServiceSections = useMemo(
    () => shouldShowTeamServiceSections(teamGroups),
    [teamGroups],
  );

  function renderTeamItem(team: ServiceTeamSummary) {
    return (
      <Link
        href={`/teams/${team.id}`}
        className={`sidebar-item sidebar-team-item ${
          activeTeamId === team.id ? "sidebar-item-active" : ""
        }`}
      >
        <div className="sidebar-team-row">
          <span className="sidebar-channel-prefix sidebar-channel-prefix-hash">#</span>
          <span className="sidebar-item-label sidebar-team-name">{team.name}</span>
          <span className="sidebar-nested-trailing">
            {team.role === "leader" && (
              <span className="sidebar-team-leader" title="Team leader">
                <SidebarCrownIcon className="sidebar-team-crown-glyph" />
              </span>
            )}
            {team.hasUnread && activeTeamId !== team.id && (
              <span className="sidebar-unread-dot" aria-label="Unread messages" />
            )}
          </span>
        </div>
      </Link>
    );
  }

  usePresenceWatch(
    dms.map((dm) => dm.participant.id),
    dms.length > 0,
  );

  useEffect(() => {
    if (!activeDmId) return;
    setDms((prev) =>
      prev.map((dm) => (dm.id === activeDmId ? { ...dm, hasUnread: false } : dm)),
    );
  }, [activeDmId]);

  useEffect(() => {
    if (!activeTeamId) return;
    setTeams((prev) =>
      prev.map((team) => (team.id === activeTeamId ? { ...team, hasUnread: false } : team)),
    );
  }, [activeTeamId]);

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          className="chat-sidebar-overlay"
          aria-label="Close sidebar"
          onClick={closeSidebar}
        />
      )}

      <aside className={`chat-sidebar ${sidebarOpen ? "chat-sidebar-open" : ""}`} aria-label="Chat navigation">
        {churchName ? (
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">{churchName}</span>
          </div>
        ) : null}
        <div className="sidebar-scroll">
        {(error || pcoSync?.syncError) && (
          <div className="sidebar-alert" role="alert">
            {error ?? pcoSync?.syncError}
          </div>
        )}

        {loading ? (
          <SidebarSkeleton />
        ) : (
          <>
            <GroupSidebarSection groups={groups} onGroupsReload={loadSidebar} />

            <section className="sidebar-section sidebar-section-messages" aria-label="Messages">
              <SidebarSectionHeader title="Messages" />

              {dms.length === 0 ? (
                <p className="sidebar-empty">No direct messages yet.</p>
              ) : (
                <ul className="sidebar-list">
                  {dms.map((dm) => (
                    <li key={dm.id}>
                      <Link
                        href={`/dms/${dm.id}`}
                        className={`sidebar-item sidebar-dm-item ${
                          activeDmId === dm.id ? "sidebar-item-active" : ""
                        }`}
                      >
                        <div className="sidebar-dm-row">
                          <UserAvatarWithPresence
                            userId={dm.participant.id}
                            displayName={dm.participant.displayName}
                            avatarUrl={dm.participant.avatarUrl}
                            className="sidebar-dm-avatar"
                            size="xs"
                          />
                          <span className="sidebar-item-label sidebar-dm-name">
                            {dm.participant.displayName}
                          </span>
                          <DmSidebarSubtitle
                            userId={dm.participant.id}
                            preview={dm.lastMessagePreview}
                          />
                          {dm.hasUnread && activeDmId !== dm.id && (
                            <span className="sidebar-unread-dot" aria-label="Unread messages" />
                          )}
                          {dm.muted && <span className="sidebar-badge" title="Muted">🔕</span>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                className="sidebar-item sidebar-dm-item sidebar-new-message-btn"
                aria-label="Focus message input"
                title="Focus message input"
                onClick={() => {
                  closeSidebar();
                  requestComposerFocus();
                }}
              >
                <div className="sidebar-dm-row">
                  <span className="sidebar-item-label sidebar-new-message-label">New message</span>
                </div>
              </button>
            </section>

            <section className="sidebar-section sidebar-section-teams" aria-label="Teams">
              <SidebarSectionHeader title="Teams" />

              {teams.length === 0 ? (
                <p className="sidebar-empty">No teams yet.</p>
              ) : showTeamServiceSections ? (
                <div className="sidebar-team-groups">
                  {teamGroups.map((group) => (
                    <div key={group.serviceType} className="sidebar-team-service-block">
                      <h3 className="sidebar-team-service-heading">{group.serviceType}</h3>
                      <ul className="sidebar-list">
                        {group.teams.map((team) => (
                          <li key={team.id}>{renderTeamItem(team)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="sidebar-list">
                  {teams.map((team) => (
                    <li key={team.id}>{renderTeamItem(team)}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        </div>

        <div className="sidebar-footer">
          <UserMenu variant="sidebar" />
        </div>
      </aside>
    </>
  );
}

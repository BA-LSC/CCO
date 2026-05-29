"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { GroupSidebarSection } from "@/components/GroupSidebarSection";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { usePlanningCenterSync } from "@/components/PlanningCenterSyncContext";
import { UserAvatar } from "@/components/UserAvatar";
import { UserAvatarWithPresence } from "@/components/UserAvatarWithPresence";
import { DmSidebarSubtitle } from "@/components/DmSidebarSubtitle";
import { usePresenceWatch } from "@/components/PresenceProvider";
import {
  SidebarCloseIcon,
  SidebarComposeIcon,
  SidebarCrownIcon,
} from "@/components/PanelHeaderIcons";
import { SidebarSectionHeader } from "@/components/SidebarSectionHeader";
import { UserMenu } from "@/components/UserMenu";
import {
  apiFetch,
  getErrorMessage,
  type DmParticipant,
  type DmSummary,
  type GroupSidebarItem,
  type Message,
  type ServiceTeamSummary,
} from "@/lib/api";
import { formatSidebarMessagePreview } from "@/lib/message-preview";
import { subscribeUnreadChanged } from "@/lib/sidebar-events";
import { fetchSetupStatus } from "@/lib/setup";
import {
  groupTeamsByServiceType,
  shouldShowTeamServiceSections,
} from "@/lib/service-team-sidebar";
import { useOptionalActiveCall } from "@/components/calls/ConversationCallContext";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";
import { resolveSidebarActiveCall } from "@/lib/sidebar-active-call";
import { SidebarCallIndicator } from "@/components/calls/SidebarCallIndicator";

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

function collectSidebarConversationIds(
  dms: DmSummary[],
  groups: GroupSidebarItem[],
  teams: ServiceTeamSummary[],
): string[] {
  const ids = new Set<string>();
  for (const dm of dms) ids.add(dm.id);
  for (const group of groups) {
    for (const conv of group.conversations) ids.add(conv.id);
  }
  for (const team of teams) {
    if (team.conversationId) ids.add(team.conversationId);
  }
  return [...ids];
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
  const router = useRouter();
  const { sidebarOpen, closeSidebar, subscribeRealtime, session, activeConversationId } =
    useChatLayout();
  const { getActiveCall, hydrateActiveCalls } = useActiveCallsMap();
  const callCtx = useOptionalActiveCall();
  const sessionCall = callCtx?.activeCall;
  const resolveActiveCall = useCallback(
    (conversationId: string) =>
      resolveSidebarActiveCall(conversationId, getActiveCall(conversationId), sessionCall),
    [getActiveCall, sessionCall],
  );

  const [groups, setGroups] = useState<GroupSidebarItem[]>([]);
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [teams, setTeams] = useState<ServiceTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pcoSync = usePlanningCenterSync();

  const [showNewDm, setShowNewDm] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmPeople, setDmPeople] = useState<DmParticipant[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [dmPeopleError, setDmPeopleError] = useState<string | null>(null);
  const [creatingDm, setCreatingDm] = useState<string | null>(null);
  const [selectedDmUserIds, setSelectedDmUserIds] = useState<Set<string>>(() => new Set());
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
      void hydrateActiveCalls(
        collectSidebarConversationIds(
          dmsData.conversations,
          groupsData.groups,
          teamsData.teams,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sidebar");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [hydrateActiveCalls]);

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
      const conversationId =
        "conversationId" in event && typeof event.conversationId === "string"
          ? event.conversationId
          : null;
      if (!conversationId) return;

      if (event.type === "message.created" && event.message) {
        setDms((prev) => {
          const dm = prev.find((row) => row.id === conversationId);
          const preview = previewFromMessage(
            event.message,
            session?.userId,
            dm?.kind === "direct" ? dm.participant?.displayName : event.message.authorName,
          );
          return applyDmMessagePreview(
            prev,
            conversationId,
            preview,
            event.message.createdAt,
            conversationId !== activeConversationId,
          );
        });
        return;
      }

      if (event.type === "message.updated" && event.message) {
        setDms((prev) => {
          const dm = prev.find((row) => row.id === conversationId);
          const preview = previewFromMessage(
            event.message,
            session?.userId,
            dm?.kind === "direct" ? dm.participant?.displayName : event.message.authorName,
          );
          return applyDmMessagePreview(
            prev,
            conversationId,
            preview,
            event.message.createdAt,
          );
        });
        return;
      }

      if (event.type === "message.deleted") {
        void loadSidebar({ silent: true });
        return;
      }

      if (event.type === "conversation.updated") {
        setDms((prev) =>
          prev.map((dm) =>
            dm.id === conversationId
              ? {
                  ...dm,
                  ...(event.title !== undefined ? { title: event.title } : {}),
                  ...(event.imageUrl !== undefined ? { imageUrl: event.imageUrl } : {}),
                }
              : dm,
          ),
        );
      }
    });
  }, [activeConversationId, loadSidebar, session?.userId, subscribeRealtime]);

  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  const activeDmId = pathname.match(/^\/dms\/([^/]+)/)?.[1] ?? null;
  const activeTeamId = pathname.match(/^\/teams\/([^/]+)/)?.[1] ?? null;

  const newDmPeople = dmPeople;

  const teamGroups = useMemo(() => groupTeamsByServiceType(teams), [teams]);
  const showTeamServiceSections = useMemo(
    () => shouldShowTeamServiceSections(teamGroups),
    [teamGroups],
  );

  function teamChatHref(team: ServiceTeamSummary): string {
    if (team.conversationId) return `/teams/${team.id}/c/${team.conversationId}`;
    return `/teams/${team.id}`;
  }

  function renderTeamItem(team: ServiceTeamSummary) {
    const activeCall = team.conversationId
      ? resolveActiveCall(team.conversationId)
      : undefined;
    return (
      <Link
        href={teamChatHref(team)}
        className={`sidebar-item sidebar-team-item ${
          activeTeamId === team.id ? "sidebar-item-active" : ""
        }`}
      >
        <div className="sidebar-team-row">
          <span className="sidebar-channel-prefix sidebar-channel-prefix-hash">#</span>
          <span className="sidebar-item-label sidebar-team-name">{team.name}</span>
          <span className="sidebar-nested-trailing">
            {activeCall && (
              <SidebarCallIndicator
                conversationId={team.conversationId!}
                participantCount={activeCall.participantCount}
                hostUserId={activeCall.hostUserId}
              />
            )}
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
    dms
      .filter((dm) => dm.kind === "direct" && dm.participant)
      .map((dm) => dm.participant!.id),
    dms.length > 0,
  );

  usePresenceWatch(newDmPeople.map((person) => person.id), showNewDm && newDmPeople.length > 0);

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

  useEffect(() => {
    if (!showNewDm) return;

    const q = dmSearch.trim();
    if (!q) {
      setDmPeople([]);
      setDmPeopleError(null);
      setDmSearching(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setDmSearching(true);
      setDmPeopleError(null);
      try {
        const data = await apiFetch<{ people: DmParticipant[] }>(
          `/api/v1/dms/people?q=${encodeURIComponent(q)}`,
        );
        if (cancelled) return;
        setDmPeople(data.people);
      } catch (err) {
        if (cancelled) return;
        setDmPeople([]);
        setDmPeopleError(getErrorMessage(err));
      } finally {
        if (!cancelled) setDmSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showNewDm, dmSearch]);

  async function startDm(userId: string) {
    setCreatingDm(userId);
    setError(null);
    try {
      const result = await apiFetch<{ id: string }>("/api/v1/dms", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setShowNewDm(false);
      setDmSearch("");
      setSelectedDmUserIds(new Set());
      closeSidebar();
      await loadSidebar();
      router.push(`/dms/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation");
    } finally {
      setCreatingDm(null);
    }
  }

  async function startDmGroup(userIds: string[]) {
    setCreatingDm("group");
    setError(null);
    try {
      const result = await apiFetch<{ id: string }>("/api/v1/dms", {
        method: "POST",
        body: JSON.stringify({ userIds }),
      });
      setShowNewDm(false);
      setDmSearch("");
      setSelectedDmUserIds(new Set());
      closeSidebar();
      await loadSidebar();
      router.push(`/dms/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group");
    } finally {
      setCreatingDm(null);
    }
  }

  function toggleDmSelection(userId: string) {
    setSelectedDmUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <>
      <aside
        className={[
          "chat-sidebar",
          sidebarOpen ? "chat-sidebar-open" : "",
          !loading ? "chat-sidebar--ready" : "",
          process.env.NEXT_PUBLIC_SIDEBAR_VIDEO_URL?.trim()
            ? "chat-sidebar--has-video"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Chat navigation"
      >
        {process.env.NEXT_PUBLIC_SIDEBAR_VIDEO_URL?.trim() ? (
          <video
            className="chat-sidebar-video"
            src={process.env.NEXT_PUBLIC_SIDEBAR_VIDEO_URL.trim()}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden
          />
        ) : null}
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
                          {dm.kind === "direct" && dm.participant ? (
                            <UserAvatarWithPresence
                              userId={dm.participant.id}
                              displayName={dm.participant.displayName}
                              avatarUrl={dm.participant.avatarUrl}
                              className="sidebar-dm-avatar"
                              size="xs"
                            />
                          ) : (
                            <UserAvatar
                              displayName={dm.title}
                              avatarUrl={dm.imageUrl}
                              className="sidebar-dm-avatar"
                            />
                          )}
                          <span className="sidebar-item-label sidebar-dm-name">{dm.title}</span>
                          {dm.kind === "direct" && dm.participant ? (
                            <DmSidebarSubtitle
                              userId={dm.participant.id}
                              preview={dm.lastMessagePreview}
                            />
                          ) : (
                            <span className="sidebar-dm-status">
                              {dm.lastMessagePreview ??
                                `${dm.participantCount ?? 0} members`}
                            </span>
                          )}
                          {(() => {
                            const activeCall = resolveActiveCall(dm.id);
                            const showTrailing =
                              activeCall ||
                              (dm.hasUnread && activeDmId !== dm.id) ||
                              dm.muted;
                            if (!showTrailing) return null;
                            return (
                              <span className="sidebar-nested-trailing">
                                {activeCall && (
                                  <SidebarCallIndicator
                                    conversationId={dm.id}
                                    participantCount={activeCall.participantCount}
                                    hostUserId={activeCall.hostUserId}
                                    iconOnly
                                  />
                                )}
                                {dm.hasUnread && activeDmId !== dm.id && (
                                  <span className="sidebar-unread-dot" aria-label="Unread messages" />
                                )}
                                {dm.muted && (
                                  <span className="sidebar-badge" title="Muted">
                                    🔕
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {showNewDm && (
                <div className="sidebar-new-dm">
                  <input
                    type="search"
                    className="sidebar-search"
                    placeholder="Search by name…"
                    value={dmSearch}
                    onChange={(e) => setDmSearch(e.target.value)}
                    aria-label="Search people"
                    autoFocus
                  />
                  {dmSearch.trim() ? (
                    dmSearching ? (
                      <p className="sidebar-empty">Searching…</p>
                    ) : dmPeopleError ? (
                      <p className="sidebar-empty">{dmPeopleError}</p>
                    ) : newDmPeople.length === 0 ? (
                      <p className="sidebar-empty">No matches found.</p>
                    ) : (
                      <ul className="sidebar-list sidebar-new-dm-list">
                        {newDmPeople.map((p) => {
                          const selected = selectedDmUserIds.has(p.id);
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                className={[
                                  "sidebar-item sidebar-dm-item",
                                  selected ? "sidebar-item-active" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                disabled={creatingDm !== null}
                                onClick={() => toggleDmSelection(p.id)}
                              >
                                <div className="sidebar-dm-row sidebar-new-dm-row">
                                  <span
                                    className={[
                                      "sidebar-new-dm-check",
                                      selected ? "sidebar-new-dm-check--selected" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    aria-hidden="true"
                                  />
                                  <UserAvatarWithPresence
                                    userId={p.id}
                                    displayName={p.displayName}
                                    avatarUrl={p.avatarUrl}
                                    className="sidebar-dm-avatar"
                                    size="xs"
                                  />
                                  <span className="sidebar-item-label sidebar-dm-name">
                                    {p.displayName}
                                  </span>
                                  <DmSidebarSubtitle userId={p.id} />
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : (
                    <p className="sidebar-empty">Type a name to search.</p>
                  )}
                  {newDmPeople.length > 0 || selectedDmUserIds.size > 0 ? (
                    <div className="sidebar-new-dm-actions">
                      <button
                        type="button"
                        className="sidebar-new-dm-submit"
                        disabled={creatingDm !== null || selectedDmUserIds.size === 0}
                        onClick={() => {
                          const ids = [...selectedDmUserIds];
                          if (ids.length === 1) void startDm(ids[0]!);
                          else if (ids.length >= 2) void startDmGroup(ids);
                        }}
                      >
                        {creatingDm === "group"
                          ? "Creating group…"
                          : creatingDm
                            ? "Opening…"
                            : selectedDmUserIds.size <= 1
                              ? "Message"
                              : `Create group (${selectedDmUserIds.size})`}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <button
                type="button"
                className={`sidebar-item sidebar-dm-item sidebar-new-message-btn ${
                  showNewDm ? "sidebar-item-active" : ""
                }`}
                aria-label={showNewDm ? "Cancel new message" : "New message"}
                aria-expanded={showNewDm}
                title={showNewDm ? "Cancel" : "New message"}
                onClick={() => {
                  setShowNewDm((v) => {
                    const next = !v;
                    if (!next) {
                      setSelectedDmUserIds(new Set());
                      setDmSearch("");
                      setDmPeople([]);
                    }
                    return next;
                  });
                }}
              >
                <div className="sidebar-dm-row">
                  <span className="sidebar-new-message-icon" aria-hidden>
                    {showNewDm ? <SidebarCloseIcon /> : <SidebarComposeIcon />}
                  </span>
                  <span
                    className={`sidebar-item-label sidebar-new-message-label${
                      showNewDm ? " sidebar-new-message-label-cancel" : ""
                    }`}
                  >
                    {showNewDm ? "Cancel" : "New message"}
                  </span>
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

      {sidebarOpen ? (
        <button
          type="button"
          className="chat-sidebar-overlay"
          aria-label="Close sidebar"
          onClick={closeSidebar}
        />
      ) : null}
    </>
  );
}

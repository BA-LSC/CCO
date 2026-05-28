"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { GroupSidebarSection } from "@/components/GroupSidebarSection";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { usePlanningCenterSync } from "@/components/PlanningCenterSyncContext";
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
  const router = useRouter();
  const { sidebarOpen, closeSidebar, subscribeRealtime, session, activeConversationId } =
    useChatLayout();

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

  const existingDmUserIds = useMemo(
    () => new Set(dms.map((dm) => dm.participant.id)),
    [dms],
  );

  const newDmPeople = useMemo(
    () => dmPeople.filter((person) => !existingDmUserIds.has(person.id)),
    [dmPeople, existingDmUserIds],
  );

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

    let cancelled = false;

    const timer = setTimeout(async () => {
      setDmSearching(true);
      setDmPeopleError(null);
      try {
        const q = dmSearch.trim();
        const path = q ? `/api/v1/dms/people?q=${encodeURIComponent(q)}` : "/api/v1/dms/people";
        const data = await apiFetch<{ people: DmParticipant[] }>(path);
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
      closeSidebar();
      await loadSidebar();
      router.push(`/dms/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation");
    } finally {
      setCreatingDm(null);
    }
  }

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

      <aside
        className={[
          "chat-sidebar",
          sidebarOpen ? "chat-sidebar-open" : "",
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
                  {dmSearching ? (
                    <p className="sidebar-empty">Searching…</p>
                  ) : dmPeopleError ? (
                    <p className="sidebar-empty">{dmPeopleError}</p>
                  ) : newDmPeople.length === 0 ? (
                    <p className="sidebar-empty">
                      {dmSearch.trim()
                        ? "No matches found."
                        : existingDmUserIds.size > 0
                          ? "You're already messaging everyone available."
                          : "No one in your groups or teams has joined CCO yet."}
                    </p>
                  ) : (
                    <ul className="sidebar-list sidebar-new-dm-list">
                      {newDmPeople.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="sidebar-item sidebar-dm-item"
                            disabled={creatingDm === p.id}
                            onClick={() => void startDm(p.id)}
                          >
                            <div className="sidebar-dm-row">
                              <UserAvatarWithPresence
                                userId={p.id}
                                displayName={p.displayName}
                                avatarUrl={p.avatarUrl}
                                className="sidebar-dm-avatar"
                                size="xs"
                              />
                              <span className="sidebar-item-label sidebar-dm-name">
                                {creatingDm === p.id ? "Opening…" : p.displayName}
                              </span>
                              <DmSidebarSubtitle userId={p.id} />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  setShowNewDm((v) => !v);
                  setDmSearch("");
                  setDmPeople([]);
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
    </>
  );
}

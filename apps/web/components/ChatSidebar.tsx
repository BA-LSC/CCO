"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { GroupSidebarSection } from "@/components/GroupSidebarSection";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { usePlanningCenterSync } from "@/components/PlanningCenterSyncContext";
import { UserAvatarWithPresence } from "@/components/UserAvatarWithPresence";
import { UserStatusMessage } from "@/components/UserStatusMessage";
import { usePresenceWatch } from "@/components/PresenceProvider";
import { SidebarCloseIcon, SidebarPlusIcon } from "@/components/PanelHeaderIcons";
import { UserMenu } from "@/components/UserMenu";
import {
  apiFetch,
  getErrorMessage,
  type DmParticipant,
  type DmSummary,
  type GroupSidebarItem,
  type ServiceTeamSummary,
} from "@/lib/api";
import { subscribeUnreadChanged } from "@/lib/sidebar-events";
import { fetchSetupStatus } from "@/lib/setup";
import {
  groupTeamsByServiceType,
  shouldShowTeamServiceSections,
} from "@/lib/service-team-sidebar";

export function ChatSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useChatLayout();

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
  const [churchName, setChurchName] = useState<string | null>(null);

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
      if (status.churchName) setChurchName(status.churchName);
    });
  }, []);

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
        <span className="sidebar-team-leader-slot" aria-hidden>
          {team.role === "leader" && (
            <span className="sidebar-team-leader-star" title="Team leader">
              ★
            </span>
          )}
        </span>
        <span className="sidebar-item-label sidebar-team-name">{team.name}</span>
        {team.hasUnread && activeTeamId !== team.id && (
          <span className="sidebar-unread-dot" aria-label="Unread messages" />
        )}
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
              <div className="sidebar-section-header">
                <h2 className="sidebar-section-title">Messages</h2>
                <button
                  type="button"
                  className={`sidebar-add-channel-icon ${showNewDm ? "sidebar-add-channel-icon-active" : ""}`}
                  aria-label={showNewDm ? "Cancel new message" : "New message"}
                  aria-expanded={showNewDm}
                  title={showNewDm ? "Cancel" : "New message"}
                  onClick={() => {
                    setShowNewDm((v) => !v);
                    setDmSearch("");
                    setDmPeople([]);
                  }}
                >
                  {showNewDm ? <SidebarCloseIcon /> : <SidebarPlusIcon />}
                </button>
              </div>

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
                                <UserStatusMessage
                                  userId={p.id}
                                  className="sidebar-dm-status"
                                />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

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
                          <UserStatusMessage
                            userId={dm.participant.id}
                            className="sidebar-dm-status"
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
            </section>

            <section className="sidebar-section sidebar-section-teams" aria-label="Teams">
              <div className="sidebar-section-header">
                <h2 className="sidebar-section-title">Teams</h2>
              </div>

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

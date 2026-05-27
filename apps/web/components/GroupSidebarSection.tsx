"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import {
  SidebarAnnouncementIcon,
  SidebarChevronRightIcon,
  SidebarLockIcon,
} from "@/components/PanelHeaderIcons";
import { SidebarSectionHeader } from "@/components/SidebarSectionHeader";
import {
  apiFetch,
  slugify,
  type GroupDetail,
  type GroupSidebarItem,
  type GroupSidebarConversation,
} from "@/lib/api";
import { subscribeConversationUpdated, subscribeUnreadChanged } from "@/lib/sidebar-events";

type Props = {
  groups: GroupSidebarItem[];
  onGroupsReload?: (options?: { silent?: boolean }) => Promise<void>;
};

function isLeaderRole(role: string | undefined): boolean {
  return role === "leader" || role === "admin";
}

function SidebarChannelPrefix({ conv }: { conv: GroupSidebarConversation }) {
  if (conv.hasRestrictedAccess) {
    return (
      <span className="sidebar-channel-prefix" title="Restricted access">
        <SidebarLockIcon />
      </span>
    );
  }

  if (conv.leaderOnly) {
    return (
      <span className="sidebar-channel-prefix" title="Leaders only can post">
        <SidebarAnnouncementIcon />
      </span>
    );
  }

  return <span className="sidebar-channel-prefix sidebar-channel-prefix-hash">#</span>;
}

export function GroupSidebarSection({ groups: initialGroups, onGroupsReload }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [creatingForGroup, setCreatingForGroup] = useState<string | null>(null);
  const [menuOpenForGroup, setMenuOpenForGroup] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [channelMemberDetail, setChannelMemberDetail] = useState<GroupDetail | null>(null);
  const [loadingChannelMembers, setLoadingChannelMembers] = useState(false);

  const activeGroupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const activeGroupId = activeGroupMatch?.[1] ?? null;
  const activeConvMatch = pathname.match(/^\/groups\/[^/]+\/c\/([^/]+)/);
  const activeConversationId = activeConvMatch?.[1] ?? null;

  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  useEffect(() => {
    return subscribeUnreadChanged(({ conversationId, hasUnread }) => {
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          conversations: group.conversations.map((conv) =>
            conv.id === conversationId ? { ...conv, hasUnread } : conv,
          ),
        })),
      );
    });
  }, []);

  useEffect(() => {
    return subscribeConversationUpdated(({ conversationId, leaderOnly, title }) => {
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          conversations: group.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  ...(leaderOnly !== undefined ? { leaderOnly } : {}),
                  ...(title !== undefined ? { title } : {}),
                }
              : conv,
          ),
        })),
      );
    });
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        conversations: group.conversations.map((conv) =>
          conv.id === activeConversationId ? { ...conv, hasUnread: false } : conv,
        ),
      })),
    );
  }, [activeConversationId]);

  const loadGroupDetailForChannel = useCallback(async (groupId: string) => {
    setLoadingChannelMembers(true);
    try {
      const data = await apiFetch<GroupDetail>(`/api/v1/groups/${groupId}?sync=1`);
      setChannelMemberDetail(data);
      return data;
    } finally {
      setLoadingChannelMembers(false);
    }
  }, []);

  useEffect(() => {
    if (!creatingForGroup) {
      setChannelMemberDetail(null);
      return;
    }
    void loadGroupDetailForChannel(creatingForGroup);
  }, [creatingForGroup, loadGroupDetailForChannel]);

  useEffect(() => {
    if (!menuOpenForGroup) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".sidebar-group-menu")) return;
      setMenuOpenForGroup(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpenForGroup(null);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpenForGroup]);

  async function createChannel(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    const title = newChannelName.trim();
    if (!title) return;

    const slug = slugify(title);
    if (!slug) {
      setCreateError("Enter a valid channel name");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      let detail = channelMemberDetail?.group.id === groupId ? channelMemberDetail : null;
      if (!detail) {
        detail = await loadGroupDetailForChannel(groupId);
      }
      const memberUserIds = detail?.members.map((m) => m.id);

      const { id } = await apiFetch<{ id: string }>(`/api/v1/groups/${groupId}/conversations`, {
        method: "POST",
        body: JSON.stringify({
          title,
          slug,
          memberUserIds,
        }),
      });

      setCreatingForGroup(null);
      setNewChannelName("");
      setChannelMemberDetail(null);
      await onGroupsReload?.({ silent: true });
      router.push(`/groups/${groupId}/c/${id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create channel");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="sidebar-section sidebar-section-indented" aria-label="Groups">
      <SidebarSectionHeader title="Groups" />

      {createError && <p className="sidebar-alert">{createError}</p>}

      {groups.length === 0 ? (
        <p className="sidebar-empty">No groups yet.</p>
      ) : (
        <ul className="sidebar-list">
          {groups.map((group) => {
            const leader = isLeaderRole(group.membershipRole);

            return (
              <li key={group.id} className="sidebar-group">
                <div className="sidebar-group-block">
                  <div
                    className={`sidebar-group-header ${
                      activeGroupId === group.id ? "sidebar-group-header-active" : ""
                    }`}
                  >
                    <UserAvatar
                      displayName={group.name}
                      avatarUrl={group.imageUrl}
                      className="sidebar-group-avatar"
                    />
                    <span className="sidebar-item-label">{group.name}</span>
                    {leader ? (
                      <div className="sidebar-group-menu">
                        <button
                          type="button"
                          className={`sidebar-group-menu-trigger${
                            menuOpenForGroup === group.id ? " sidebar-group-menu-trigger-open" : ""
                          }`}
                          title="Group options"
                          aria-label="Group options"
                          aria-haspopup="menu"
                          aria-expanded={menuOpenForGroup === group.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenForGroup((current) =>
                              current === group.id ? null : group.id,
                            );
                          }}
                        >
                          <SidebarChevronRightIcon />
                        </button>
                        {menuOpenForGroup === group.id ? (
                          <div className="sidebar-group-menu-dropdown" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="sidebar-group-menu-item"
                              onClick={() => {
                                setMenuOpenForGroup(null);
                                setCreatingForGroup(group.id);
                                setNewChannelName("");
                                setCreateError(null);
                              }}
                            >
                              Add channel
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {creatingForGroup === group.id && (
                    <form
                      className="sidebar-add-channel-form"
                      onSubmit={(e) => void createChannel(e, group.id)}
                    >
                      <input
                        type="text"
                        placeholder="e.g. memes"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        aria-label="New channel name"
                        autoFocus
                        disabled={creating || loadingChannelMembers}
                      />
                      {newChannelName.trim() && (
                        <span className="sidebar-channel-preview">
                          #{slugify(newChannelName.trim()) || "…"}
                        </span>
                      )}
                      {createError && (
                        <span className="sidebar-create-error">{createError}</span>
                      )}
                      <div className="sidebar-add-channel-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={creating || loadingChannelMembers || !newChannelName.trim()}
                        >
                          {creating ? "…" : loadingChannelMembers ? "Loading…" : "Add"}
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          disabled={creating}
                          onClick={() => {
                            setCreatingForGroup(null);
                            setNewChannelName("");
                            setCreateError(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <ul className="sidebar-nested">
                  {group.conversations.length === 0 ? (
                    <li className="sidebar-nested-empty">No channels yet</li>
                  ) : (
                    group.conversations.map((conv) => (
                      <li key={conv.id}>
                        <Link
                          href={`/groups/${group.id}/c/${conv.id}`}
                          className={`sidebar-item sidebar-nested-item ${
                            activeConversationId === conv.id ? "sidebar-item-active" : ""
                          }`}
                        >
                          <div className="sidebar-channel-row">
                            <SidebarChannelPrefix conv={conv} />
                            <span className="sidebar-item-label">{conv.title}</span>
                            <span className="sidebar-nested-trailing">
                              {conv.muted && (
                                <span className="sidebar-badge" title="Muted">
                                  🔕
                                </span>
                              )}
                              {conv.hasUnread && activeConversationId !== conv.id && (
                                <span className="sidebar-unread-dot" aria-label="Unread messages" />
                              )}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

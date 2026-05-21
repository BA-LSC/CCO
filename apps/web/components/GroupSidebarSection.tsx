"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import {
  apiFetch,
  slugify,
  type GroupDetail,
  type GroupSidebarItem,
} from "@/lib/api";

type Props = {
  groups: GroupSidebarItem[];
  onGroupsReload?: (options?: { silent?: boolean }) => Promise<void>;
};

function isLeaderRole(role: string | undefined): boolean {
  return role === "leader" || role === "admin";
}

export function GroupSidebarSection({ groups, onGroupsReload }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [creatingForGroup, setCreatingForGroup] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [channelMemberDetail, setChannelMemberDetail] = useState<GroupDetail | null>(null);
  const [loadingChannelMembers, setLoadingChannelMembers] = useState(false);

  const activeGroupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const activeGroupId = activeGroupMatch?.[1] ?? null;
  const activeConvMatch = pathname.match(/^\/groups\/[^/]+\/c\/([^/]+)/);
  const activeConversationId = activeConvMatch?.[1] ?? null;

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
      <div className="sidebar-section-header">
        <h2 className="sidebar-section-title">Groups</h2>
      </div>

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
                  <div className="sidebar-group-name-row">
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
                    </div>
                    {leader && (
                      <div className="sidebar-group-actions">
                        <button
                          type="button"
                          className={`sidebar-add-channel-icon ${creatingForGroup === group.id ? "sidebar-add-channel-icon-active" : ""}`}
                          title="Add channel"
                          aria-label="Add channel"
                          aria-expanded={creatingForGroup === group.id}
                          onClick={() => {
                            if (creatingForGroup === group.id) {
                              setCreatingForGroup(null);
                              setNewChannelName("");
                              setCreateError(null);
                            } else {
                              setCreatingForGroup(group.id);
                              setNewChannelName("");
                              setCreateError(null);
                            }
                          }}
                        >
                          {creatingForGroup === group.id ? "×" : "+"}
                        </button>
                      </div>
                    )}
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
                          <span className="sidebar-hash">#</span>
                          <span className="sidebar-item-label">{conv.title}</span>
                          {conv.leaderOnly && (
                            <span className="sidebar-badge" title="Leaders only">
                              🔒
                            </span>
                          )}
                          {conv.muted && (
                            <span className="sidebar-badge" title="Muted">
                              🔕
                            </span>
                          )}
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

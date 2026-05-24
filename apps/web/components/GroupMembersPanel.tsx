"use client";

import { useEffect, useState } from "react";
import { UserAvatarWithPresence } from "@/components/UserAvatarWithPresence";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { usePresenceWatch } from "@/components/PresenceProvider";
import { apiFetch, type GroupDetail } from "@/lib/api";
import { resolveMemberAvatarUrl } from "@/lib/member-avatar";

type Props = {
  groupId: string;
};


export function GroupMembersPanel({ groupId }: Props) {
  const { session } = useChatLayout();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const isLeader =
    detail?.membershipRole === "leader" || detail?.membershipRole === "admin";

  usePresenceWatch(detail?.members.map((member) => member.id) ?? [], Boolean(detail));

  async function reload() {
    const data = await apiFetch<GroupDetail>(`/api/v1/groups/${groupId}`);
    setDetail(data);
    return data;
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<GroupDetail>(`/api/v1/groups/${groupId}`)
      .then((groupData) => setDetail(groupData))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load members"))
      .finally(() => setLoading(false));
  }, [groupId]);

  async function removeFromGroup(userId: string, displayName: string) {
    if (!confirm(`Remove ${displayName} from this group in Planning Center?`)) return;
    setRemovingMemberId(userId);
    setError(null);
    try {
      await apiFetch(`/api/v1/groups/${groupId}/members/${userId}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  if (loading) {
    return <p className="group-members-loading">Loading members…</p>;
  }

  if (!detail) {
    return <p className="group-members-loading">{error ?? "Group not found"}</p>;
  }

  return (
    <div className="group-members-panel">
      <div className="group-members-panel-header">
        <p className="group-members-panel-desc">
          Everyone in {detail.group.name}. Channel access is managed separately in each channel&apos;s
          settings.
        </p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <ul className="group-members-list">
        {detail.members.map((m) => (
          <li key={m.id} className="member-row member-row-actions">
            <UserAvatarWithPresence
              userId={m.id}
              displayName={m.displayName}
              avatarUrl={resolveMemberAvatarUrl(m, session)}
              className="member-avatar"
            />
            <span className="member-row-name">{m.displayName}</span>
            {m.role !== "member" && <span className="member-role">{m.role}</span>}
            {isLeader && m.id && m.id !== session?.userId && (
              <button
                type="button"
                className="link-btn danger"
                disabled={removingMemberId === m.id}
                onClick={() => void removeFromGroup(m.id!, m.displayName ?? "Member")}
              >
                {removingMemberId === m.id ? "Removing…" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

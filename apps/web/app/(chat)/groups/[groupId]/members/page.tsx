"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanelHeader } from "@/components/ChatPanelHeader";
import { GroupMembersPanel } from "@/components/GroupMembersPanel";
import { ErrorState, LoadingState } from "@/components/PageStates";
import { apiFetch, type GroupDetail } from "@/lib/api";

export default function GroupMembersPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const [groupName, setGroupName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<GroupDetail>(`/api/v1/groups/${groupId}`)
      .then((data) => setGroupName(data.group.name))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load group"))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) {
    return <LoadingState />;
  }

  if (error && !groupName) {
    return <ErrorState message={error} backHref="/groups" backLabel="Back to groups" />;
  }

  return (
    <div className="chat-panel">
      <ChatPanelHeader title={groupName ?? "Group"} subtitle="Group members" />
      <div className="chat-panel-details group-members-page">
        <GroupMembersPanel groupId={groupId} />
      </div>
    </div>
  );
}

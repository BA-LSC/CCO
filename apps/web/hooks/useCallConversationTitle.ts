"use client";

import { useEffect, useState } from "react";
import { apiFetch, type DmDetail, type GroupDetail } from "@/lib/api";

type TeamDetail = {
  team: { name: string };
};

export type CallChatPath =
  | { kind: "dm"; conversationId: string }
  | { kind: "group"; groupId: string; conversationId: string }
  | { kind: "team"; teamId: string; conversationId: string };

export function parseCallChatPath(path: string | null): CallChatPath | null {
  if (!path) return null;
  const dm = path.match(/^\/dms\/([^/]+)\/?$/);
  if (dm) return { kind: "dm", conversationId: dm[1]! };
  const group = path.match(/^\/groups\/([^/]+)\/c\/([^/]+)\/?$/);
  if (group) return { kind: "group", groupId: group[1]!, conversationId: group[2]! };
  const team = path.match(/^\/teams\/([^/]+)\/c\/([^/]+)\/?$/);
  if (team) return { kind: "team", teamId: team[1]!, conversationId: team[2]! };
  return null;
}

async function fetchTitleForPath(parsed: CallChatPath): Promise<string | null> {
  if (parsed.kind === "dm") {
    const detail = await apiFetch<DmDetail>(`/api/v1/dms/${parsed.conversationId}`);
    return detail.title?.trim() || null;
  }
  if (parsed.kind === "group") {
    const detail = await apiFetch<GroupDetail>(`/api/v1/groups/${parsed.groupId}`);
    return detail.group.name?.trim() || null;
  }
  const detail = await apiFetch<TeamDetail>(`/api/v1/services/teams/${parsed.teamId}`);
  return detail.team.name?.trim() || null;
}

export function useCallConversationTitle(
  conversationId: string | null,
  chatPath: string | null,
): string {
  const [title, setTitle] = useState("Call");

  useEffect(() => {
    if (!conversationId) {
      setTitle("Call");
      return;
    }

    let cancelled = false;
    const parsed = parseCallChatPath(chatPath);

    async function load() {
      try {
        if (parsed && parsed.conversationId === conversationId) {
          const resolved = await fetchTitleForPath(parsed);
          if (!cancelled && resolved) {
            setTitle(resolved);
            return;
          }
        }
        const dm = await apiFetch<DmDetail>(`/api/v1/dms/${conversationId}`);
        if (!cancelled && dm.title?.trim()) {
          setTitle(dm.title.trim());
          return;
        }
      } catch {
        // fall through to default
      }
      if (!cancelled) setTitle("Call");
    }

    setTitle("Call");
    void load();

    return () => {
      cancelled = true;
    };
  }, [chatPath, conversationId]);

  return title;
}

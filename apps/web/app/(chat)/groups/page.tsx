"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";
import { EmptyChatPane } from "@/components/EmptyChatPane";
import { apiFetch, type DmSummary, type GroupDetail, type GroupSummary, type ServiceTeamSummary } from "@/lib/api";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import { readLastChatPath } from "@/lib/last-chat-path";
import { useRouter } from "next/navigation";

export default function GroupsHomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justSynced = searchParams.get("synced") === "1";
  const syncErrorFromLogin = searchParams.get("sync_error");

  useEffect(() => {
    if (justSynced || syncErrorFromLogin) return;

    if (isStandaloneDisplay()) {
      const lastPath = readLastChatPath();
      if (lastPath) {
        router.replace(lastPath);
        return;
      }
    }

    async function redirectToFirst() {
      try {
        const [dmsData, groupsData, teamsData] = await Promise.all([
          apiFetch<{ conversations: DmSummary[] }>("/api/v1/dms"),
          apiFetch<{ groups: GroupSummary[] }>("/api/v1/groups"),
          apiFetch<{ teams: ServiceTeamSummary[] }>("/api/v1/services/teams"),
        ]);

        if (dmsData.conversations[0]) {
          router.replace(`/dms/${dmsData.conversations[0].id}`);
          return;
        }

        if (groupsData.groups[0]) {
          const detail = await apiFetch<GroupDetail>(`/api/v1/groups/${groupsData.groups[0].id}`);
          const general = detail.conversations.find((c) => c.slug === "general");
          const conv = general ?? detail.conversations[0];
          if (conv) {
            router.replace(`/groups/${groupsData.groups[0].id}/c/${conv.id}`);
            return;
          }
        }

        if (teamsData.teams[0]) {
          router.replace(`/teams/${teamsData.teams[0].id}`);
        }
      } catch {
        /* stay on empty pane */
      }
    }

    void redirectToFirst();
  }, [justSynced, syncErrorFromLogin, router]);

  const banner =
    justSynced && !syncErrorFromLogin ? (
      <ChatHomeBanner variant="success" autoDismissMs={7000}>
        Signed in with Planning Center.
      </ChatHomeBanner>
    ) : syncErrorFromLogin ? (
      <ChatHomeBanner variant="error">{syncErrorFromLogin}</ChatHomeBanner>
    ) : null;

  return <EmptyChatPane banner={banner} />;
}

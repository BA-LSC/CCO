"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";
import { EmptyChatPane } from "@/components/EmptyChatPane";
import { LoadingState } from "@/components/PageStates";
import { apiFetch, type DmSummary, type GroupDetail, type GroupSummary, type ServiceTeamSummary } from "@/lib/api";
import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import { hideAppBootOverlay } from "@/lib/app-update-overlay";
import { readLastChatPath } from "@/lib/last-chat-path";
import { hasWelcomeSeen } from "@/lib/welcome-seen";
import { useRouter } from "next/navigation";

function shouldShowIndexBootLoading(
  justSynced: boolean,
  syncErrorFromLogin: string | null,
): boolean {
  if (justSynced || syncErrorFromLogin) return false;
  return isStandaloneDisplay() && hasWelcomeSeen();
}

export default function GroupsHomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justSynced = searchParams.get("synced") === "1";
  const syncErrorFromLogin = searchParams.get("sync_error");
  const [indexBooting, setIndexBooting] = useState(() =>
    shouldShowIndexBootLoading(justSynced, syncErrorFromLogin),
  );

  useEffect(() => {
    if (justSynced || syncErrorFromLogin) {
      setIndexBooting(false);
      hideAppBootOverlay();
      return;
    }

    let cancelled = false;

    async function bootFromIndex() {
      if (isStandaloneDisplay()) {
        const lastPath = readLastChatPath();
        if (lastPath) {
          router.replace(lastPath);
          return;
        }
      }

      try {
        const [dmsData, groupsData, teamsData] = await Promise.all([
          apiFetch<{ conversations: DmSummary[] }>("/api/v1/dms"),
          apiFetch<{ groups: GroupSummary[] }>("/api/v1/groups"),
          apiFetch<{ teams: ServiceTeamSummary[] }>("/api/v1/services/teams"),
        ]);

        if (cancelled) return;

        if (dmsData.conversations[0]) {
          router.replace(`/dms/${dmsData.conversations[0].id}`);
          return;
        }

        if (groupsData.groups[0]) {
          const detail = await apiFetch<GroupDetail>(`/api/v1/groups/${groupsData.groups[0].id}`);
          if (cancelled) return;
          const general = detail.conversations.find((c) => c.slug === "general");
          const conv = general ?? detail.conversations[0];
          if (conv) {
            router.replace(`/groups/${groupsData.groups[0].id}/c/${conv.id}`);
            return;
          }
        }

        if (teamsData.teams[0]) {
          const firstTeam = teamsData.teams[0];
          if (firstTeam.conversationId) {
            router.replace(`/teams/${firstTeam.id}/c/${firstTeam.conversationId}`);
          } else {
            router.replace(`/teams/${firstTeam.id}`);
          }
        }
      } catch {
        /* stay on empty pane */
      } finally {
        if (!cancelled) {
          setIndexBooting(false);
          hideAppBootOverlay();
        }
      }
    }

    void bootFromIndex();

    return () => {
      cancelled = true;
    };
  }, [justSynced, syncErrorFromLogin, router]);

  if (indexBooting) {
    return <LoadingState variant="overlay" label="Loading CCO…" />;
  }

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

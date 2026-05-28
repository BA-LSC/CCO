"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/PageStates";
import { apiFetch, getErrorMessage } from "@/lib/api";

type TeamDetail = {
  team: { id: string; name: string };
  conversation: { id: string } | null;
};

/** Redirect legacy /teams/:id URLs to the team conversation. */
export default function TeamRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TeamDetail>(`/api/v1/services/teams/${teamId}`)
      .then((detail) => {
        if (detail.conversation?.id) {
          router.replace(`/teams/${teamId}/c/${detail.conversation.id}`);
        } else {
          router.replace("/teams");
        }
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, [teamId, router]);

  if (error) {
    return <ErrorState message={error} backHref="/teams" backLabel="Back to teams" />;
  }

  return <LoadingState />;
}

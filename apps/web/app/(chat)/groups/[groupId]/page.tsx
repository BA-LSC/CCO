"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/PageStates";
import { apiFetch, type GroupDetail } from "@/lib/api";

/** Redirect legacy /groups/:id URLs to the default conversation. */
export default function GroupRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<GroupDetail>(`/api/v1/groups/${groupId}`)
      .then((detail) => {
        const general = detail.conversations.find((c) => c.slug === "general");
        const conv = general ?? detail.conversations[0];
        if (conv) {
          router.replace(`/groups/${groupId}/c/${conv.id}`);
        } else {
          router.replace("/groups");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load group"));
  }, [groupId, router]);

  if (error) {
    return <ErrorState message={error} backHref="/groups" backLabel="Back to groups" />;
  }

  return <LoadingState />;
}

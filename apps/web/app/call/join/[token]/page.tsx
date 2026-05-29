"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { joinGuestCall, previewGuestCall } from "@/lib/calls-api";
import type { CallGuestPreview } from "@cco/shared/calls";

function GuestCallJoinContent() {
  const params = useParams();
  const token = params.token as string;
  const [displayName, setDisplayName] = useState("");
  const [preview, setPreview] = useState<CallGuestPreview | null>(null);
  const [joinedCall, setJoinedCall] = useState<{
    authToken: string;
    participantCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void previewGuestCall(token)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : "Invalid invite"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <main className="page guest-call-page">
        <p>Loading invite…</p>
      </main>
    );
  }

  if (!preview?.valid) {
    return (
      <main className="page guest-call-page">
        <h1>Call invite unavailable</h1>
        <p>{error ?? "This invite link is invalid or has expired."}</p>
      </main>
    );
  }

  if (joinedCall) {
    return (
      <CallOverlay
        authToken={joinedCall.authToken}
        sessionParticipantCount={joinedCall.participantCount}
        onLeave={() => {
          setJoinedCall(null);
        }}
        placement="guest"
        showSetupScreen={false}
      />
    );
  }

  return (
    <main className="page guest-call-page">
      <h1>Join call</h1>
      <p>
        {preview.hostDisplayName} invited you to <strong>{preview.callTitle}</strong>
      </p>
      <label className="integrations-field">
        <span className="integrations-field-label">Your name</span>
        <input
          className="integrations-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          maxLength={80}
        />
      </label>
      {error ? <p className="integrations-feedback integrations-feedback--error">{error}</p> : null}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!displayName.trim()}
        onClick={() => {
          setError(null);
          void joinGuestCall(token, displayName.trim())
            .then((res) =>
              setJoinedCall({
                authToken: res.authToken,
                participantCount: res.call.participantCount,
              }),
            )
            .catch((err) => setError(err instanceof Error ? err.message : "Could not join"));
        }}
      >
        Join call
      </button>
    </main>
  );
}

export default function GuestCallJoinPage() {
  return (
    <Suspense
      fallback={
        <main className="page guest-call-page">
          <p>Loading…</p>
        </main>
      }
    >
      <GuestCallJoinContent />
    </Suspense>
  );
}

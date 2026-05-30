"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupLoading } from "@/components/SetupLoading";
import { SetupUnavailable } from "@/components/SetupUnavailable";
import { SetupWelcome } from "@/components/SetupWelcome";
import { fetchSetupStatus } from "@/lib/setup";
import { readCachedSetupConfigured } from "@/lib/setup-status-cache";

type Props = {
  hasSession: boolean;
};

function isEffectivelyConfigured(
  configured: boolean,
  unavailable: boolean,
  hasSession: boolean,
): boolean {
  if (configured) return true;
  if (unavailable && (hasSession || readCachedSetupConfigured())) return true;
  return false;
}

/** Client gate: server render cannot always reach the API worker binding during RSC. */
export function SetupHomeGate({ hasSession }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSetupStatus()
      .then((status) => {
        if (cancelled) return;

        if (isEffectivelyConfigured(status.configured, Boolean(status.unavailable), hasSession)) {
          setRedirecting(true);
          router.replace(hasSession ? "/groups" : "/auth/sign-in?next=%2Fgroups");
          return;
        }

        if (status.unavailable) {
          setUnavailableMessage(
            status.errorMessage ??
              "CCO is temporarily unavailable. Check that the API is running, then try again.",
          );
          setReady(true);
          return;
        }

        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        if (hasSession || readCachedSetupConfigured()) {
          setRedirecting(true);
          router.replace(hasSession ? "/groups" : "/auth/sign-in?next=%2Fgroups");
          return;
        }
        setUnavailableMessage(
          "CCO is temporarily unavailable. Check that the API is running, then try again.",
        );
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasSession, router]);

  if (redirecting || !ready) {
    return <SetupLoading label={redirecting ? "Opening CCO" : "Loading"} />;
  }

  if (unavailableMessage) {
    return <SetupUnavailable message={unavailableMessage} hasSession={hasSession} />;
  }

  return <SetupWelcome />;
}

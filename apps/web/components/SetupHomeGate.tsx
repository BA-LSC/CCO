"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupLoading } from "@/components/SetupLoading";
import { SetupWelcome } from "@/components/SetupWelcome";
import { fetchSetupStatus } from "@/lib/setup";

type Props = {
  hasSession: boolean;
};

/** Client gate: server render cannot always reach the API worker binding during RSC. */
export function SetupHomeGate({ hasSession }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSetupStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.configured) {
          setConfigured(true);
          router.replace(hasSession ? "/groups" : "/auth/sign-in?next=%2Fgroups");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasSession, router]);

  if (configured || !ready) {
    return <SetupLoading label={configured ? "Opening CCO" : "Loading"} />;
  }

  return <SetupWelcome />;
}

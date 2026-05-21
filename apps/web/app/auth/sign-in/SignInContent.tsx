"use client";

import { useSearchParams } from "next/navigation";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import { SetupThemeShell } from "@/components/SetupThemeShell";

type Props = {
  churchName: string | null;
};

export function SignInContent({ churchName }: Props) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/groups";
  const startHref = `/auth/sign-in/start?next=${encodeURIComponent(next)}`;

  const title = churchName ? (
    <>
      {churchName} <span className="setup-headline-accent">CCO</span>
    </>
  ) : (
    <>
      Sign in to <span className="setup-headline-accent">CCO</span>
    </>
  );

  return (
    <SetupThemeShell>
      <div className="setup-form-card setup-form-card-centered">
        <h1 className="setup-page-title setup-sign-in-title">{title}</h1>
        <p className="setup-page-lede">
          Group chats, direct messages, and volunteer teams — synced with your Planning Center
          account.
        </p>
        {searchParams.get("reconnect") === "1" && (
          <p className="setup-page-lede">
            Reconnect to refresh your Planning Center access (for example, after enabling
            Groups).
          </p>
        )}
        <div className="setup-form-actions setup-form-actions-center">
          <PcoSignInButton href={startHref} className="setup-btn-primary">
            Sign in with Planning Center
          </PcoSignInButton>
        </div>
      </div>
    </SetupThemeShell>
  );
}

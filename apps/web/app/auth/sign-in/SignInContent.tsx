"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import { SetupThemeShell } from "@/components/SetupThemeShell";

type Props = {
  churchName: string | null;
  setupIncomplete?: boolean;
  apiUnavailable?: boolean;
  apiUnavailableMessage?: string;
};

export function SignInContent({
  churchName,
  setupIncomplete = false,
  apiUnavailable = false,
  apiUnavailableMessage,
}: Props) {
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
          {apiUnavailable ? (
            <p className="help-text state-error">
              {apiUnavailableMessage ??
                "CCO is temporarily unavailable. Check that the API is running, then try again."}
            </p>
          ) : null}
          {setupIncomplete ? (
            <>
              <Link href="/setup?step=credentials" className="setup-btn-primary">
                Continue setup
              </Link>
              <p className="help-text">
                OAuth credentials are saved but setup is not finished. Edit credentials or sign in
                below after fixing your Planning Center redirect URI.
              </p>
            </>
          ) : null}
          <PcoSignInButton
            href={startHref}
            className={setupIncomplete ? "setup-btn-secondary" : "setup-btn-primary"}
          >
            Sign in with Planning Center
          </PcoSignInButton>
        </div>
      </div>
    </SetupThemeShell>
  );
}

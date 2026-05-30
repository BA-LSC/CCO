"use client";

import Link from "next/link";
import { SetupThemeShell } from "@/components/SetupThemeShell";

type Props = {
  message?: string;
  hasSession?: boolean;
};

export function SetupUnavailable({
  message = "CCO is temporarily unavailable. Check that the API is running, then try again.",
  hasSession = false,
}: Props) {
  return (
    <SetupThemeShell>
      <div className="setup-form-card setup-form-card-centered">
        <h1 className="setup-page-title setup-sign-in-title">
          Cannot reach <span className="setup-headline-accent">CCO</span>
        </h1>
        <p className="setup-page-lede">{message}</p>
        <div className="setup-form-actions setup-form-actions-center">
          <button type="button" className="setup-btn-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
          {hasSession ? (
            <Link href="/groups" className="setup-btn-secondary">
              Open chats
            </Link>
          ) : (
            <Link href="/auth/sign-in" className="setup-btn-secondary">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </SetupThemeShell>
  );
}

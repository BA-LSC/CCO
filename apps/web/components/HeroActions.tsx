"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import { apiFetch } from "@/lib/api";

type Props = {
  variant?: "default" | "landing";
};

export function HeroActions({ variant = "default" }: Props) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const isLanding = variant === "landing";

  useEffect(() => {
    apiFetch<{ userId: string }>("/api/v1/session/me")
      .then((data) => setSignedIn(Boolean(data?.userId)))
      .catch(() => setSignedIn(false));
  }, []);

  if (signedIn === null) {
    return (
      <div
        className={isLanding ? "home-cta home-cta-loading" : "hero-actions"}
        aria-hidden
      />
    );
  }

  if (isLanding) {
    return (
      <div className="home-cta">
        {signedIn ? (
          <Link href="/groups" className="home-btn">
            Open Chats
          </Link>
        ) : (
          <PcoSignInButton className="home-btn">Sign in with Planning Center</PcoSignInButton>
        )}
        {!signedIn && (
          <p className="home-cta-hint">OAuth via Planning Center — no new account needed</p>
        )}
      </div>
    );
  }

  return (
    <div className="hero-actions">
      {signedIn ? (
        <Link href="/groups" className="btn btn-primary">
          Open Chats
        </Link>
      ) : (
        <PcoSignInButton />
      )}
    </div>
  );
}

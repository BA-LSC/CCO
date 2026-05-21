"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { fetchSetupRedirectUris } from "@/lib/setup";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import { LoadingState } from "@/components/PageStates";

function ErrorContent() {
  const params = useSearchParams();
  const message = params.get("message") ?? "Something went wrong during sign in.";
  const [redirectUri, setRedirectUri] = useState<string | null>(null);

  useEffect(() => {
    void fetchSetupRedirectUris().then((uris) => {
      if (uris?.signInRedirectUri) setRedirectUri(uris.signInRedirectUri);
    });
  }, []);

  return (
    <main className="page page-narrow">
      <div className="state-card state-error">
        <h1>Sign in failed</h1>
        <p>{message}</p>
        <div className="hero-actions">
          <PcoSignInButton>Try again</PcoSignInButton>
          <Link href="/" className="btn btn-secondary">
            Home
          </Link>
        </div>
        <p className="help-text">
          In Planning Center Developers, add this redirect URI:{" "}
          <code>{redirectUri ?? "Loading…"}</code>
        </p>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" />}>
      <ErrorContent />
    </Suspense>
  );
}

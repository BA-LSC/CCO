"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page page-narrow">
      <div className="state-card state-error">
        <h1>Something went wrong</h1>
        <p>{error.message || "An unexpected error occurred."}</p>
        <div className="dialog-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

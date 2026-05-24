"use client";

import Link from "next/link";
import { getErrorMessage } from "@/lib/api";
import { useAppUpdateGuard } from "@/hooks/useAppUpdateGuard";

type LoadingStateProps = {
  label?: string;
  /** Full-page layout for auth and standalone routes. */
  variant?: "panel" | "page";
};

export function LoadingState({ label = "Loading", variant = "panel" }: LoadingStateProps) {
  return (
    <div
      className={`loading-screen${variant === "page" ? " loading-screen-page" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="loading-screen-content">
        <div className="spinner" aria-hidden />
        <p className="loading-screen-label">{label}</p>
      </div>
    </div>
  );
}

function sanitizeDisplayMessage(message: string): string {
  return getErrorMessage(new Error(message));
}

export function ErrorState({
  title = "Something went wrong",
  message,
  backHref = "/groups",
  backLabel = "Back to groups",
  variant = "panel",
}: {
  title?: string;
  message: string;
  backHref?: string;
  backLabel?: string;
  variant?: "panel" | "page";
}) {
  const deployBlocked = useAppUpdateGuard();
  const safeMessage = sanitizeDisplayMessage(message);

  if (deployBlocked || safeMessage === "Updating CCO…") {
    return <LoadingState label="Updating CCO…" variant={variant} />;
  }

  const content = (
    <div className="state-card state-error state-card-compact">
      <h1>{title}</h1>
      <p>{safeMessage}</p>
      <Link href={backHref} className="btn btn-secondary">
        {backLabel}
      </Link>
    </div>
  );

  if (variant === "page") {
    return <main className="page">{content}</main>;
  }

  return (
    <div className="loading-screen error-screen" role="alert">
      {content}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

import Link from "next/link";
import { SetupThemeShell } from "@/components/SetupThemeShell";

export default function SetupDeniedPage() {
  return (
    <SetupThemeShell>
      <div className="setup-form-card setup-form-card-error">
        <p className="setup-eyebrow">First-time setup</p>
        <h1 className="setup-page-title">Administrator required</h1>
        <p className="setup-page-lede">
          Only a Planning Center organization administrator can complete the initial CCO
          setup. Ask your church admin to sign in at the home page and connect OAuth.
        </p>
        <div className="setup-form-actions">
          <Link href="/" className="setup-btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    </SetupThemeShell>
  );
}

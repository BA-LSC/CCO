import { Suspense } from "react";
import { SetupLoading } from "@/components/SetupLoading";
import { fetchSetupStatus } from "@/lib/setup";
import { SignInContent } from "./SignInContent";

export default async function SignInPage() {
  const status = await fetchSetupStatus();
  const churchName = status.churchName?.trim() || null;

  return (
    <Suspense fallback={<SetupLoading label="Loading sign in" />}>
      <SignInContent churchName={churchName} />
    </Suspense>
  );
}

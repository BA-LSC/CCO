import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SetupLoading } from "@/components/SetupLoading";
import { SetupWelcome } from "@/components/SetupWelcome";
import { fetchSetupStatus } from "@/lib/setup";

async function HomePageContent() {
  const session = (await cookies()).get("connect_session")?.value;
  const status = await fetchSetupStatus();

  if (status.configured) {
    if (session) redirect("/groups");
    redirect("/auth/sign-in");
  }

  return <SetupWelcome />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<SetupLoading />}>
      <HomePageContent />
    </Suspense>
  );
}

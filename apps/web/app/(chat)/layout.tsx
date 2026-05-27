import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatShell } from "@/components/ChatShell";
import { LoadingState } from "@/components/PageStates";
import {
  RETURN_PATH_HEADER,
  SESSION_COOKIE_NAME,
} from "@/lib/route-guard";
import { safeNextPath } from "@/lib/safe-next-path";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    const headerStore = await headers();
    const returnPath = safeNextPath(headerStore.get(RETURN_PATH_HEADER), "/groups");
    redirect(`/auth/sign-in?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <Suspense fallback={<LoadingState />}>
      <ChatShell>{children}</ChatShell>
    </Suspense>
  );
}

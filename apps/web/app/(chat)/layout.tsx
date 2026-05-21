import { Suspense } from "react";
import { ChatShell } from "@/components/ChatShell";
import { LoadingState } from "@/components/PageStates";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ChatShell>{children}</ChatShell>
    </Suspense>
  );
}

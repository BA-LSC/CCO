import { cookies } from "next/headers";
import { SetupHomeGate } from "@/components/SetupHomeGate";

/** Setup gate must run at request time — never bake SetupWelcome at build when org is already configured. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = (await cookies()).get("connect_session")?.value;
  return <SetupHomeGate hasSession={Boolean(session)} />;
}

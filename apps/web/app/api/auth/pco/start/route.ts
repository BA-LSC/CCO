import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy entry — redirects to OAuth start. */
export async function GET() {
  redirect("/auth/sign-in/start");
}

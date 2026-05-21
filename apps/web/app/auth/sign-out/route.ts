import { htmlRedirect } from "@/lib/html-redirect";
import { safeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"), "/");

  return htmlRedirect(`${url.origin}${next}`, [
    { name: "connect_session", delete: true },
    { name: "pco_access_token", delete: true },
    { name: "pco_oauth_state", delete: true },
  ]);
}

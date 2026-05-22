import { htmlRedirect, clearAuthCookies } from "@/lib/html-redirect";
import { safeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"), "/");

  const response = htmlRedirect(`${url.origin}${next}`);
  clearAuthCookies(response);
  return response;
}

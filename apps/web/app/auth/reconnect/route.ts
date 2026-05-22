import { htmlRedirect, clearAuthCookies } from "@/lib/html-redirect";

export const dynamic = "force-dynamic";

/** Clears CCO session cookies and starts a fresh Planning Center authorization. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = htmlRedirect(`${url.origin}/auth/sign-in?reconnect=1`);
  clearAuthCookies(response);
  return response;
}

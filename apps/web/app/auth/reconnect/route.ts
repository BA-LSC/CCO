import { htmlRedirect } from "@/lib/html-redirect";

export const dynamic = "force-dynamic";

/** Clears CCO session cookies and starts a fresh Planning Center authorization. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = htmlRedirect(`${url.origin}/auth/sign-in?reconnect=1`, [
    { name: "connect_session", delete: true },
    { name: "pco_access_token", delete: true },
    { name: "pco_oauth_state", delete: true },
  ]);
  return response;
}

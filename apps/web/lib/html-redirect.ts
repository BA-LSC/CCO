import { NextResponse } from "next/server";
import { isProduction } from "@/lib/safe-next-path";

type CookieOpts = {
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
  path?: string;
  secure?: boolean;
};

function clearCookie(response: NextResponse, name: string, options?: CookieOpts) {
  response.cookies.set(name, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    ...options,
  });
}

/** Browser navigation when NextResponse.redirect + cookies returns a blank/hung page. */
export function htmlRedirect(
  targetUrl: string,
  cookies?: Array<
    { name: string; value: string; options?: CookieOpts } | { name: string; delete: true }
  >,
): NextResponse {
  const safeUrl = targetUrl.replace(/"/g, "%22");
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Redirecting…</title>
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
  <script>location.replace(${JSON.stringify(targetUrl)})</script>
</head>
<body>
  <p>Redirecting… <a href="${safeUrl}">Continue</a></p>
</body>
</html>`;

  const response = new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });

  for (const cookie of cookies ?? []) {
    if ("delete" in cookie && cookie.delete) {
      clearCookie(response, cookie.name);
    } else if ("value" in cookie) {
      response.cookies.set(cookie.name, cookie.value, {
        secure: isProduction(),
        ...cookie.options,
      });
    }
  }

  return response;
}

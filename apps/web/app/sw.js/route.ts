import { APP_BUILD_VERSION } from "@/lib/build-version";
import { SW_TEMPLATE } from "@/lib/sw-template";

export const dynamic = "force-dynamic";

export function GET() {
  const body = `const SW_BUILD_ID = ${JSON.stringify(APP_BUILD_VERSION)};\n${SW_TEMPLATE}`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

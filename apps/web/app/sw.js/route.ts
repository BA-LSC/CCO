import { resolveAppBuildVersion } from "@/lib/build-version.server";
import { SW_TEMPLATE } from "@/lib/sw-template";

export const dynamic = "force-dynamic";

export function GET() {
  const buildVersion = resolveAppBuildVersion(process.env);
  const body = `const SW_BUILD_ID = ${JSON.stringify(buildVersion)};\n${SW_TEMPLATE}`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

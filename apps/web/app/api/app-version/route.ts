import { APP_BUILD_VERSION } from "@/lib/build-version";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: APP_BUILD_VERSION },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

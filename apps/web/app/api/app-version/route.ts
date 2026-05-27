import { resolveAppBuildVersion } from "@/lib/build-version.server";
import { fetchFromApi } from "@/lib/api-fetch-server";
import { isDeployDraining } from "@/lib/deploy-status.server";

export const dynamic = "force-dynamic";

async function readDeployUpdatingFromApi(): Promise<boolean | null> {
  try {
    const res = await fetchFromApi("/health", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { draining?: boolean };
    return Boolean(data.draining);
  } catch {
    return null;
  }
}

export async function GET() {
  const [apiDraining, version] = await Promise.all([
    readDeployUpdatingFromApi(),
    Promise.resolve(resolveAppBuildVersion(process.env)),
  ]);

  const updating =
    apiDraining === true || (apiDraining === null && (await isDeployDraining()));

  return Response.json(
    { version, updating },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

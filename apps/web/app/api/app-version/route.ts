import { resolveAppBuildVersion } from "@/lib/build-version.server";
import { fetchFromApi } from "@/lib/api-fetch-server";
import { isDeployDraining, readDeployPhase } from "@/lib/deploy-status.server";

export const dynamic = "force-dynamic";

type ApiDeployStatus = {
  draining: boolean;
  deployPhase: string | null;
};

async function readDeployStatusFromApi(): Promise<ApiDeployStatus | null> {
  try {
    const res = await fetchFromApi("/health", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { draining?: boolean; deployPhase?: string | null };
    return {
      draining: Boolean(data.draining),
      deployPhase: data.deployPhase?.trim() || null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [apiStatus, version, localDraining, localPhase] = await Promise.all([
    readDeployStatusFromApi(),
    Promise.resolve(resolveAppBuildVersion(process.env)),
    isDeployDraining(),
    readDeployPhase(),
  ]);

  const updating = apiStatus?.draining === true || (apiStatus === null && localDraining);
  const deployPhase = updating
    ? apiStatus?.deployPhase ?? localPhase
    : null;

  return Response.json(
    { version, updating, deployPhase },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

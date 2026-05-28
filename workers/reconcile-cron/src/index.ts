/** Keep in sync with @cco/shared and packages/cloudflare-provision worker-definitions. */
const CCO_UPDATE_CHECK_CRON = "*/10 * * * *";

type SecretsStoreSecretBinding = { get(): Promise<string> };

export interface Env {
  RECONCILE_INTERNAL_URL?: string;
  RECONCILE_INTERNAL_SECRET: SecretsStoreSecretBinding | string;
  CCO_API?: Fetcher;
}

async function resolveSecret(
  binding: SecretsStoreSecretBinding | string,
): Promise<string> {
  if (typeof binding === "string") return binding;
  return (await binding.get()) ?? "";
}

async function postInternal(env: Env, path: string, secret: string): Promise<Response> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  };
  if (env.CCO_API) {
    return env.CCO_API.fetch(new Request(path, init));
  }
  if (!env.RECONCILE_INTERNAL_URL) {
    throw new Error("RECONCILE_INTERNAL_URL is required when CCO_API binding is absent");
  }
  const url = reconcilePathToUrl(env.RECONCILE_INTERNAL_URL, path);
  return fetch(url, init);
}

function reconcilePathToUrl(reconcileUrl: string, path: string): string {
  if (path === "/internal/jobs/reconcile") {
    return reconcileUrl;
  }
  if (path === "/internal/jobs/check-updates") {
    return updateCheckUrl(reconcileUrl);
  }
  return reconcileUrl.replace(/\/jobs\/reconcile\/?$/, path.replace("/internal/jobs", "/jobs"));
}

function updateCheckUrl(reconcileUrl: string): string {
  if (reconcileUrl.includes("/jobs/reconcile")) {
    return reconcileUrl.replace("/jobs/reconcile", "/jobs/check-updates");
  }
  return reconcileUrl.replace(/\/reconcile\/?$/, "/check-updates");
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const auth = await resolveSecret(env.RECONCILE_INTERNAL_SECRET);

    if (controller.cron === CCO_UPDATE_CHECK_CRON) {
      const res = await postInternal(env, "/internal/jobs/check-updates", auth);
      if (!res.ok) {
        console.error("Update check failed:", res.status, await res.text());
        return;
      }
      console.log("Update check complete:", await res.text());
      return;
    }

    const res = await postInternal(env, "/internal/jobs/reconcile", auth);
    if (!res.ok) {
      console.error("Reconcile failed:", res.status, await res.text());
      return;
    }
    console.log("Reconcile complete:", await res.text());
  },
};

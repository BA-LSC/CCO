/** Keep in sync with @cco/shared and packages/cloudflare-provision worker-definitions. */
const CCO_UPDATE_CHECK_CRON = "*/10 * * * *";

type SecretsStoreSecretBinding = { get(): Promise<string> };

export interface Env {
  RECONCILE_INTERNAL_URL: string;
  RECONCILE_INTERNAL_SECRET: SecretsStoreSecretBinding | string;
}

async function resolveSecret(
  binding: SecretsStoreSecretBinding | string,
): Promise<string> {
  if (typeof binding === "string") return binding;
  return (await binding.get()) ?? "";
}

async function postInternal(url: string, secret: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
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
      const url = updateCheckUrl(env.RECONCILE_INTERNAL_URL);
      const res = await postInternal(url, auth);
      if (!res.ok) {
        console.error("Update check failed:", res.status, await res.text());
        return;
      }
      console.log("Update check complete:", await res.text());
      return;
    }

    const res = await postInternal(env.RECONCILE_INTERNAL_URL, auth);
    if (!res.ok) {
      console.error("Reconcile failed:", res.status, await res.text());
      return;
    }
    console.log("Reconcile complete:", await res.text());
  },
};

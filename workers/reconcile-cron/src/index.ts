export interface Env {
  RECONCILE_INTERNAL_URL: string;
  RECONCILE_INTERNAL_SECRET: string;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const res = await fetch(env.RECONCILE_INTERNAL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RECONCILE_INTERNAL_SECRET}`,
      },
    });
    if (!res.ok) {
      console.error("Reconcile failed:", res.status, await res.text());
      return;
    }
    console.log("Reconcile complete:", await res.text());
  },
};

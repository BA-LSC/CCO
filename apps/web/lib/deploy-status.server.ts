import Redis from "ioredis";

const DEPLOY_DRAINING_KEY = "cco:deploy:draining";
export const DEPLOY_SIGNAL_CHANNEL = "cco:deploy:signal";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, {
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      commandTimeout: 1000,
      lazyConnect: true,
    });
  }
  return redis;
}

/** True while deploy/bootstrap has set the redis draining flag. */
export async function isDeployDraining(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    if (client.status !== "ready") {
      await client.connect().catch(() => null);
    }
    if (client.status !== "ready") return false;
    return (await client.get(DEPLOY_DRAINING_KEY)) === "1";
  } catch {
    return false;
  }
}

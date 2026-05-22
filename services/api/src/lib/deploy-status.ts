import Redis from "ioredis";

const DEPLOY_DRAINING_KEY = "cco:deploy:draining";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) redis = new Redis(url);
  return redis;
}

export async function isDeployDraining(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    return (await client.get(DEPLOY_DRAINING_KEY)) === "1";
  } catch {
    return false;
  }
}

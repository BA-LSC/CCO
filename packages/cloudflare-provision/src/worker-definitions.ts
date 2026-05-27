import type { ProvisionResources } from "./provision-pipeline";
import type { WorkerBinding } from "./workers-deploy";

export const CCO_WORKER_BUILD_SPECS = [
  { scriptName: "cco-realtime-fanout", buildDir: "workers/cco-realtime" },
  { scriptName: "cco-pco-webhook", buildDir: "workers/pco-webhook" },
  { scriptName: "cco-giphy-proxy", buildDir: "workers/giphy-proxy" },
  { scriptName: "cco-push-consumer", buildDir: "workers/push-consumer" },
  { scriptName: "cco-reconcile-cron", buildDir: "workers/reconcile-cron" },
  { scriptName: "cco-api", buildDir: "workers/cco-api" },
] as const;

export type CcoWorkerScriptName = (typeof CCO_WORKER_BUILD_SPECS)[number]["scriptName"];

export const CCO_PUSH_QUEUE_NAME = "cco-push-notifications";
export const CCO_RECONCILE_CRON = "0 3 * * *";
export const CCO_UPDATE_CHECK_CRON = "0 */6 * * *";
export const CCO_RECONCILE_WORKER_CRONS = [CCO_RECONCILE_CRON, CCO_UPDATE_CHECK_CRON] as const;

export type CcoApiWorkerRoute = {
  patternSuffix: string;
  script: CcoWorkerScriptName | "cco-pco-webhook" | "cco-giphy-proxy";
};

/** Most-specific routes first; catch-all last. */
export const CCO_API_WORKER_ROUTES: readonly CcoApiWorkerRoute[] = [
  { patternSuffix: "/webhooks/pco", script: "cco-pco-webhook" },
  { patternSuffix: "/v1/giphy/*", script: "cco-giphy-proxy" },
  { patternSuffix: "/v1/ws", script: "cco-realtime-fanout" },
  { patternSuffix: "/*", script: "cco-api" },
] as const;

export function resolveApiRoutePattern(apiHostname: string, patternSuffix: string): string {
  const host = apiHostname.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `${host}${patternSuffix}`;
}

export function apiInternalUrl(apiHostname: string, path: string): string {
  const host = apiHostname.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${host}${normalizedPath}`;
}

export type WorkerBindingsParams = {
  resources: ProvisionResources;
  apiHostname: string;
  chatHostname?: string;
};

function requireResource<T>(value: T | undefined, label: string): T {
  if (value == null || value === "") {
    throw new Error(`Missing provision resource: ${label}`);
  }
  return value;
}

function normalizeBindingHostname(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function buildWorkerBindings(
  scriptName: CcoWorkerScriptName,
  params: WorkerBindingsParams,
): WorkerBinding[] {
  const { resources, apiHostname } = params;
  const chatHostname = params.chatHostname ?? resources.chatHostname;
  const apiHost = normalizeBindingHostname(apiHostname);
  const d1Id = requireResource(resources.d1DatabaseId, "d1DatabaseId");
  const r2Bucket = requireResource(resources.r2BucketName, "r2BucketName");
  const presenceKv = requireResource(resources.kvPresenceNamespaceId, "kvPresenceNamespaceId");
  const deployKv = requireResource(resources.kvDeployNamespaceId, "kvDeployNamespaceId");

  switch (scriptName) {
    case "cco-api":
      return [
        { type: "d1", name: "DB", id: d1Id },
        { type: "r2_bucket", name: "UPLOADS", bucket_name: r2Bucket },
        { type: "kv_namespace", name: "PRESENCE_KV", namespace_id: presenceKv },
        { type: "kv_namespace", name: "DEPLOY_KV", namespace_id: deployKv },
        { type: "queue", name: "PUSH_QUEUE", queue_name: CCO_PUSH_QUEUE_NAME },
        { type: "service", name: "REALTIME_FANOUT", service: "cco-realtime-fanout" },
        { type: "plain_text", name: "UPLOAD_STORAGE", text: "r2" },
        { type: "plain_text", name: "CLOUDFLARE_R2_BUCKET", text: r2Bucket },
        { type: "plain_text", name: "API_DOMAIN", text: apiHost },
        { type: "plain_text", name: "CCO_DEPLOY_TARGET", text: "cloudflare" },
        ...(chatHostname
          ? [
              { type: "plain_text" as const, name: "WEB_URL", text: `https://${normalizeBindingHostname(chatHostname)}` },
              {
                type: "plain_text" as const,
                name: "PUBLIC_UPLOAD_URL",
                text: `https://${normalizeBindingHostname(chatHostname)}/api/v1/uploads`,
              },
            ]
          : []),
      ];
    case "cco-realtime-fanout":
      return [
        { type: "d1", name: "DB", id: d1Id },
        {
          type: "durable_object_namespace",
          name: "CONVERSATION_ROOM",
          class_name: "ConversationRoom",
          script_name: "cco-realtime-fanout",
        },
      ];
    case "cco-pco-webhook":
      return [
        {
          type: "plain_text",
          name: "INTERNAL_FORWARD_URL",
          text: apiInternalUrl(apiHostname, "/internal/webhooks/pco"),
        },
      ];
    case "cco-giphy-proxy":
      return [];
    case "cco-push-consumer":
      return [
        {
          type: "plain_text",
          name: "PUSH_INTERNAL_URL",
          text: apiInternalUrl(apiHostname, "/internal/push/deliver"),
        },
      ];
    case "cco-reconcile-cron":
      return [
        {
          type: "plain_text",
          name: "RECONCILE_INTERNAL_URL",
          text: apiInternalUrl(apiHostname, "/internal/jobs/reconcile"),
        },
      ];
    default: {
      const exhaustive: never = scriptName;
      throw new Error(`Unknown worker script: ${exhaustive}`);
    }
  }
}

export function defaultWorkerBundleDir(): string {
  return "deploy/cloudflare/bundles";
}

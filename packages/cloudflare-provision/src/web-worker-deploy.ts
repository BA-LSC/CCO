import { CloudflareApiError, parseCloudflareJsonText, readCloudflareJson } from "./cloudflare-api";
import { buildWebWorkerSecretsStoreBindings } from "./secrets-store";
import {
  CCO_WORKER_COMPATIBILITY_DATE,
  CCO_WORKER_NODEJS_COMPAT_FLAGS,
  deployWorkerScript,
  type WorkerBinding,
} from "./workers-deploy";
import { normalizeWebAssetManifestPath } from "./web-asset-path";

const CF_API = "https://api.cloudflare.com/client/v4";

export const CCO_WEB_SCRIPT_NAME = "cco-web";

export type WebAssetManifestEntry = {
  hash: string;
  size: number;
};

export type WebAssetManifest = Record<string, WebAssetManifestEntry>;

export type DeployCcoWebWorkerParams = {
  accountId: string;
  apiToken: string;
  chatHostname: string;
  apiHostname: string;
  secretsStoreId: string;
  workerModuleUrl: string;
  assetsBaseUrl: string;
  assetsManifest: WebAssetManifest;
  /** Git SHA stamped into the worker so /api/app-version reflects the deployed release. */
  releaseVersion?: string;
  /** Deploy KV namespace — lets cco-web read drain/signal flags without calling cco-api. */
  kvDeployNamespaceId?: string;
};

type UploadSessionResponse = {
  jwt?: string;
  buckets?: string[][];
};

async function createAssetsUploadSession(
  accountId: string,
  apiToken: string,
  scriptName: string,
  manifest: WebAssetManifest,
): Promise<UploadSessionResponse> {
  const uploadManifest: WebAssetManifest = {};
  for (const [path, entry] of Object.entries(manifest)) {
    uploadManifest[normalizeWebAssetManifestPath(path)] = entry;
  }

  const res = await fetch(
    `${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ manifest: uploadManifest }),
    },
  );
  const parsed = await readCloudflareJson(res);
  const json = parsed as {
    success?: boolean;
    result?: UploadSessionResponse;
    errors?: Array<{ message: string }>;
  };
  if (!res.ok || json.success === false || !json.result?.jwt) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new CloudflareApiError(detail || "Assets upload session failed", res.status);
  }
  return json.result;
}

async function uploadAssetBucket(
  accountId: string,
  uploadJwt: string,
  bucket: Record<string, string>,
): Promise<string | undefined> {
  const form = new FormData();
  for (const [hash, base64] of Object.entries(bucket)) {
    form.append(hash, base64);
  }

  const res = await fetch(
    `${CF_API}/accounts/${accountId}/workers/assets/upload?base64=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${uploadJwt}` },
      body: form,
    },
  );
  const parsed = await readCloudflareJson(res);
  const json = parsed as {
    success?: boolean;
    result?: { jwt?: string };
    errors?: Array<{ message: string }>;
  };
  if (!res.ok || json.success === false) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new CloudflareApiError(detail || "Asset bucket upload failed", res.status);
  }
  return json.result?.jwt;
}

async function uploadAssetsFromManifest(
  accountId: string,
  apiToken: string,
  scriptName: string,
  assetsBaseUrl: string,
  manifest: WebAssetManifest,
): Promise<string> {
  const session = await createAssetsUploadSession(accountId, apiToken, scriptName, manifest);
  const uploadJwt = session.jwt!;
  const buckets = session.buckets ?? [];
  const pendingHashes = buckets.flat();

  if (pendingHashes.length === 0) {
    return uploadJwt;
  }

  const hashToPath = new Map<string, string>();
  for (const [path, entry] of Object.entries(manifest)) {
    hashToPath.set(entry.hash, path);
  }

  const base = assetsBaseUrl.replace(/\/+$/, "");
  let completionJwt: string | undefined;

  for (const bucket of buckets) {
    const payload: Record<string, string> = {};
    for (const hash of bucket) {
      const path = hashToPath.get(hash);
      if (!path) {
        throw new CloudflareApiError(`Asset manifest missing hash ${hash}`, 400);
      }
      const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const res = await fetch(`${base}/${encodedPath}`);
      if (!res.ok) {
        throw new CloudflareApiError(`Failed to fetch asset ${path}: HTTP ${res.status}`, res.status);
      }
      payload[hash] = Buffer.from(await res.arrayBuffer()).toString("base64");
    }

    const jwt = await uploadAssetBucket(accountId, uploadJwt, payload);
    if (jwt) {
      completionJwt = jwt;
    }
  }

  if (!completionJwt) {
    throw new CloudflareApiError("Asset upload finished without completion token", 500);
  }

  return completionJwt;
}

function normalizeHostname(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function buildCcoWebBindings(
  chatHostname: string,
  apiHostname: string,
  secretsStoreId: string,
  releaseVersion?: string,
  kvDeployNamespaceId?: string,
): WorkerBinding[] {
  const chatHost = normalizeHostname(chatHostname);
  const apiHost = normalizeHostname(apiHostname);
  const release = releaseVersion?.trim();
  const deployKv = kvDeployNamespaceId?.trim();
  return [
    { type: "assets", name: "ASSETS" },
    { type: "service", name: "CCO_API", service: "cco-api" },
    ...(deployKv
      ? [{ type: "kv_namespace" as const, name: "DEPLOY_KV", namespace_id: deployKv }]
      : []),
    { type: "plain_text", name: "CCO_DEPLOY_TARGET", text: "cloudflare" },
    { type: "plain_text", name: "CF_DEPLOY_KV", text: "1" },
    { type: "plain_text", name: "NEXT_PUBLIC_DIRECT_UPLOADS", text: "1" },
    { type: "plain_text", name: "WEB_URL", text: `https://${chatHost}` },
    { type: "plain_text", name: "NEXT_PUBLIC_WEB_URL", text: `https://${chatHost}` },
    { type: "plain_text", name: "API_DOMAIN", text: apiHost },
    { type: "plain_text", name: "API_URL", text: `https://${apiHost}` },
    { type: "plain_text", name: "NEXT_PUBLIC_WS_URL", text: `wss://${apiHost}` },
    {
      type: "plain_text",
      name: "PUBLIC_UPLOAD_URL",
      text: `https://${chatHost}/api/v1/uploads`,
    },
    {
      type: "plain_text",
      name: "PCO_WEB_REDIRECT_URI",
      text: `https://${chatHost}/api/auth/pco/callback`,
    },
    ...(release
      ? [
          { type: "plain_text" as const, name: "CCO_BUILD_ID", text: release },
          { type: "plain_text" as const, name: "GITHUB_SHA", text: release },
        ]
      : []),
    ...buildWebWorkerSecretsStoreBindings(secretsStoreId),
  ];
}

export async function deployCcoWebWorker(params: DeployCcoWebWorkerParams): Promise<void> {
  const workerRes = await fetch(params.workerModuleUrl);
  if (!workerRes.ok) {
    throw new CloudflareApiError(
      `Failed to fetch web worker module: HTTP ${workerRes.status}`,
      workerRes.status,
    );
  }
  const workerModule = await workerRes.arrayBuffer();

  const assetsJwt = await uploadAssetsFromManifest(
    params.accountId,
    params.apiToken,
    CCO_WEB_SCRIPT_NAME,
    params.assetsBaseUrl,
    params.assetsManifest,
  );

  const moduleFileName = `${CCO_WEB_SCRIPT_NAME}.mjs`;
  const metadata = {
    main_module: moduleFileName,
    compatibility_date: CCO_WORKER_COMPATIBILITY_DATE,
    compatibility_flags: [...CCO_WORKER_NODEJS_COMPAT_FLAGS],
    assets: { jwt: assetsJwt },
    bindings: buildCcoWebBindings(
      params.chatHostname,
      params.apiHostname,
      params.secretsStoreId,
      params.releaseVersion,
      params.kvDeployNamespaceId,
    ),
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  form.append(
    moduleFileName,
    new Blob([workerModule], { type: "application/javascript+module" }),
    moduleFileName,
  );

  const res = await fetch(
    `${CF_API}/accounts/${params.accountId}/workers/scripts/${CCO_WEB_SCRIPT_NAME}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${params.apiToken}` },
      body: form,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new CloudflareApiError(
      text.slice(0, 300) || `Web worker deploy failed (${res.status})`,
      res.status,
    );
  }
}

export async function fetchWebReleaseManifest(manifestUrl: string): Promise<WebAssetManifest> {
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    throw new CloudflareApiError(`Failed to fetch web manifest: HTTP ${res.status}`, res.status);
  }
  const parsed = parseCloudflareJsonText(await res.text(), res.status);
  if (parsed === null || typeof parsed !== "object" || parsed === null) {
    throw new CloudflareApiError(
      `Web manifest is empty or invalid JSON (${manifestUrl})`,
      res.status,
    );
  }
  return parsed as WebAssetManifest;
}

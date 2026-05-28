import type { Context } from "hono";
import { tryAuth } from "../middleware/auth";
import { getWorkerBindings, isCloudflareRuntime } from "../runtime/worker-context";
import { parseByteRangeHeader } from "./upload-range";
import {
  getUploadDir,
  safeUploadPath,
  uploadContentTypeForFilename,
  verifyUploadSignature,
} from "./uploads";
import { serveR2UploadObject, resolveR2Config } from "./r2-uploads";

export { parseByteRangeHeader } from "./upload-range";

function uploadCacheControl(sig: string | undefined, expRaw: string | undefined): string | undefined {
  if (!sig || !expRaw) return undefined;
  const exp = Number.parseInt(expRaw, 10);
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  if (maxAge <= 0) return undefined;
  return `private, max-age=${maxAge}, immutable`;
}

function usesR2UploadStorage(): boolean {
  return isCloudflareRuntime() || Boolean(getWorkerBindings()?.UPLOADS);
}

async function serveUploadFromR2(
  filename: string,
  method: string,
  sig: string | undefined,
  expRaw: string | undefined,
  rangeHeader: string | undefined,
): Promise<Response | null> {
  const r2 = await resolveR2Config();
  if (!r2) return null;

  const r2Res = await serveR2UploadObject({
    config: r2,
    objectKey: filename,
    method,
    rangeHeader,
  });
  if (!r2Res) return null;

  const headers = new Headers(r2Res.headers);
  const contentType = uploadContentTypeForFilename(filename);
  if (contentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Accept-Ranges", "bytes");
  const cacheControl = uploadCacheControl(sig, expRaw);
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  if (method === "HEAD") {
    return new Response(null, { status: r2Res.status, headers });
  }
  return new Response(r2Res.body, { status: r2Res.status, headers });
}

/** Serve a stored upload after signed-URL or session auth. */
export async function serveUploadFile(c: Context): Promise<Response> {
  const filename = c.req.param("filename");
  const filePath = safeUploadPath(getUploadDir(), filename);
  if (!filePath) return c.text("Forbidden", 403);

  const sig = c.req.query("sig");
  const expRaw = c.req.query("exp");
  let authorized = false;

  if (sig && expRaw) {
    const exp = Number.parseInt(expRaw, 10);
    if (verifyUploadSignature(filename, sig, exp)) {
      authorized = true;
    }
  }

  if (!authorized && (await tryAuth(c))) {
    authorized = true;
  }

  if (!authorized) return c.json({ error: "Unauthorized" }, 401);

  const method = c.req.method.toUpperCase();

  const rangeHeader = c.req.header("range");

  if (usesR2UploadStorage()) {
    const r2Response = await serveUploadFromR2(filename, method, sig, expRaw, rangeHeader);
    return r2Response ?? c.notFound();
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    const r2Response = await serveUploadFromR2(filename, method, sig, expRaw, rangeHeader);
    return r2Response ?? c.notFound();
  }

  const size = file.size;
  const contentType = file.type || uploadContentTypeForFilename(filename);
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Length": String(size),
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const cacheControl = uploadCacheControl(sig, expRaw);
  if (cacheControl) {
    headers["Cache-Control"] = cacheControl;
  }

  const byteRange = parseByteRangeHeader(rangeHeader, size);

  if (byteRange === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  if (byteRange) {
    const { start, end } = byteRange;
    const length = end - start + 1;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(length);

    if (method === "HEAD") {
      return new Response(null, { status: 206, headers });
    }

    const chunk = await file.slice(start, end + 1).arrayBuffer();
    return new Response(chunk, { status: 206, headers });
  }

  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(file, { status: 200, headers });
}

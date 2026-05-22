import type { Context } from "hono";
import { tryAuth } from "../middleware/auth";
import {
  getUploadDir,
  safeUploadPath,
  uploadContentTypeForFilename,
  verifyUploadSignature,
} from "./uploads";

type ByteRange = { start: number; end: number };

export function parseByteRangeHeader(
  rangeHeader: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!rangeHeader || size <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  let start = match[1] ? Number.parseInt(match[1], 10) : 0;
  let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (match[1] === "" && match[2] !== "") {
    const suffixLength = end;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (start < 0 || start >= size || end < start) return "unsatisfiable";
  end = Math.min(end, size - 1);
  return { start, end };
}

function uploadCacheControl(sig: string | undefined, expRaw: string | undefined): string | undefined {
  if (!sig || !expRaw) return undefined;
  const exp = Number.parseInt(expRaw, 10);
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  if (maxAge <= 0) return undefined;
  return `private, max-age=${maxAge}, immutable`;
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

  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.notFound();

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

  const method = c.req.method.toUpperCase();
  const byteRange = parseByteRangeHeader(c.req.header("range"), size);

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

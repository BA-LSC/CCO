import type { Context } from "hono";
import { tryAuth } from "../middleware/auth";
import {
  getUploadDir,
  safeUploadPath,
  uploadContentTypeForFilename,
  verifyUploadSignature,
} from "./uploads";

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

  const contentType = file.type || uploadContentTypeForFilename(filename);
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (sig && expRaw) {
    const exp = Number.parseInt(expRaw, 10);
    const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
    if (maxAge > 0) {
      headers["Cache-Control"] = `private, max-age=${maxAge}, immutable`;
    }
  }

  if (Object.keys(headers).length > 0) {
    return c.body(file, 200, headers);
  }

  return new Response(file);
}

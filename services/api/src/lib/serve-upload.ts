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
  if (contentType) {
    return c.body(file, 200, { "Content-Type": contentType });
  }

  return new Response(file);
}

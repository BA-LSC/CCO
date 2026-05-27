import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { hash as blake3hash } from "blake3-wasm";

/** Match wrangler static asset hashing (blake3 of base64 bytes + extension, 32 hex chars). */
export function hashWebAssetFile(filepath: string): string {
  const contents = readFileSync(filepath);
  const base64Contents = contents.toString("base64");
  const extension = extname(filepath).substring(1);
  return blake3hash(base64Contents + extension).toString("hex").slice(0, 32);
}

#!/usr/bin/env bun
/**
 * CI gate: setup-c.co releases match the pushed commit and all artifacts are reachable.
 */
import {
  RELEASE_REQUIRED_ARTIFACTS,
  verifyReleaseArtifactsReady,
} from "../../packages/shared/src/release-artifacts.ts";

const releasesBase =
  process.env.CCO_RELEASES_BASE_URL?.trim().replace(/\/+$/, "") ||
  "https://setup-c.co/releases";
const expectedSha = process.env.GITHUB_SHA?.trim();
const maxAttempts = Number(process.env.CCO_RELEASE_VERIFY_ATTEMPTS ?? "24");
const delayMs = Number(process.env.CCO_RELEASE_VERIFY_DELAY_MS ?? "5000");

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchReleaseIndex(): Promise<{ version: string }> {
  const res = await fetch(`${releasesBase}/release-index.json`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`release-index.json HTTP ${res.status}`);
  }
  const json = (await res.json()) as { version?: string };
  if (!json.version?.trim()) {
    throw new Error("release-index.json missing version");
  }
  return { version: json.version.trim() };
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    const index = await fetchReleaseIndex();
    if (expectedSha && index.version !== expectedSha) {
      throw new Error(
        `release-index version ${index.version.slice(0, 12)} != GITHUB_SHA ${expectedSha.slice(0, 12)}`,
      );
    }

    const artifacts = await verifyReleaseArtifactsReady(releasesBase);
    if (!artifacts.ready) {
      throw new Error(`missing artifacts: ${artifacts.missing.join(", ")}`);
    }

    console.log(
      `Published release verified at ${releasesBase} (${index.version.slice(0, 12)}, ${RELEASE_REQUIRED_ARTIFACTS.length} artifacts)`,
    );
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[verify-published-releases] attempt ${attempt}/${maxAttempts}: ${message}`);
    if (attempt === maxAttempts) {
      console.error("::error::Release artifacts are not ready on setup-c.co");
      process.exit(1);
    }
    await sleep(delayMs);
  }
}

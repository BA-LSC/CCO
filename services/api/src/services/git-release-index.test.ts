import { afterEach, describe, expect, test } from "bun:test";
import { CCO_DEFAULT_GIT_REPO_URL } from "@cco/shared";
import { fetchGitReleaseIndex, resolveOrgGitRepoUrl } from "./git-release-index";

describe("git-release-index", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN;
    delete process.env.CCO_GITHUB_TOKEN;
  });

  test("resolveOrgGitRepoUrl defaults to BA-LSC/CCO", () => {
    expect(resolveOrgGitRepoUrl(null)).toBe(CCO_DEFAULT_GIT_REPO_URL);
    expect(resolveOrgGitRepoUrl("")).toBe(CCO_DEFAULT_GIT_REPO_URL);
  });

  test("fetchGitReleaseIndex reads main commit from configured GitHub repo", async () => {
    let githubCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("setup-c.co/releases/release-index.json")) {
        return new Response("not found", { status: 404 });
      }
      if (url.includes("api.github.com")) {
        githubCalls += 1;
        if (url.includes("/releases/latest")) {
          return new Response("not found", { status: 404 });
        }
        if (url.includes("/commits/main")) {
          return new Response(
            JSON.stringify({
              sha: "github-main-sha",
              commit: { committer: { date: "2026-05-27T13:00:00.000Z" } },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const index = await fetchGitReleaseIndex(null);
    expect(index.version).toBe("github-main-sha");
    expect(index.releasesBaseUrl).toBe("https://setup-c.co/releases");
    expect(githubCalls).toBeGreaterThan(0);
  });

  test("fetchGitReleaseIndex uses setup-c.co catalog for default repo", async () => {
    let githubCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.github.com")) {
        githubCalls += 1;
        throw new Error("GitHub should not be required when setup-c.co catalog is available");
      }
      if (url.includes("setup-c.co/releases/release-index.json")) {
        return new Response(
          JSON.stringify({
            version: "catalog-main-sha",
            gitRef: "main",
            publishedAt: "2026-05-27T14:00:00.000Z",
            releasesBaseUrl: "https://setup-c.co/releases",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const index = await fetchGitReleaseIndex(CCO_DEFAULT_GIT_REPO_URL);
    expect(index.version).toBe("catalog-main-sha");
    expect(index.releasesBaseUrl).toBe("https://setup-c.co/releases");
    expect(githubCalls).toBe(0);
  });

  test("fetchGitReleaseIndex sends GitHub token when configured", async () => {
    process.env.GITHUB_TOKEN = "ghp_test_token";
    let authHeader: string | null = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("setup-c.co/releases/release-index.json")) {
        return new Response("not found", { status: 404 });
      }
      if (url.includes("/releases/latest")) {
        return new Response("not found", { status: 404 });
      }
      if (url.includes("/commits/main")) {
        authHeader =
          (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
        return new Response(
          JSON.stringify({
            sha: "authed-sha",
            commit: { committer: { date: "2026-05-27T13:00:00.000Z" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const index = await fetchGitReleaseIndex(CCO_DEFAULT_GIT_REPO_URL);
    expect(index.version).toBe("authed-sha");
    expect(authHeader).toBe("Bearer ghp_test_token");
  });
});

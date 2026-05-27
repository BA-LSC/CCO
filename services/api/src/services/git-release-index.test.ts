import { afterEach, describe, expect, test } from "bun:test";
import { CCO_DEFAULT_GIT_REPO_URL, CCO_RELEASE_INDEX_URL } from "@cco/shared";
import { fetchGitReleaseIndex, resolveOrgGitRepoUrl } from "./git-release-index";

describe("git-release-index", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN;
    delete process.env.CCO_GITHUB_TOKEN;
    delete process.env.CCO_RELEASE_INDEX_URL;
  });

  test("resolveOrgGitRepoUrl defaults to BA-LSC/CCO", () => {
    expect(resolveOrgGitRepoUrl(null)).toBe(CCO_DEFAULT_GIT_REPO_URL);
    expect(resolveOrgGitRepoUrl("")).toBe(CCO_DEFAULT_GIT_REPO_URL);
  });

  test("fetchGitReleaseIndex prefers setup-c.co for default repo without GitHub", async () => {
    const catalog = {
      version: "abc123def456",
      gitRef: "main",
      publishedAt: "2026-05-27T12:00:00.000Z",
      releasesBaseUrl: "https://setup-c.co/releases",
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe(CCO_RELEASE_INDEX_URL);
      return new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const index = await fetchGitReleaseIndex(null);
    expect(index).toEqual(catalog);
  });

  test("fetchGitReleaseIndex does not call GitHub when setup-c.co succeeds", async () => {
    let githubCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.github.com")) {
        githubCalls += 1;
        return new Response("rate limited", { status: 403 });
      }
      return new Response(
        JSON.stringify({
          version: "published-sha",
          gitRef: "main",
          publishedAt: "2026-05-27T12:00:00.000Z",
          releasesBaseUrl: "https://setup-c.co/releases",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const index = await fetchGitReleaseIndex(CCO_DEFAULT_GIT_REPO_URL);
    expect(index.version).toBe("published-sha");
    expect(githubCalls).toBe(0);
  });

  test("fetchGitReleaseIndex falls back to GitHub when setup-c.co fails", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === CCO_RELEASE_INDEX_URL) {
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
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const index = await fetchGitReleaseIndex(null);
    expect(index.version).toBe("github-main-sha");
    expect(index.releasesBaseUrl).toBe("https://setup-c.co/releases");
  });

  test("fetchGitReleaseIndex sends GitHub token when configured", async () => {
    process.env.GITHUB_TOKEN = "ghp_test_token";
    let authHeader: string | null = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === CCO_RELEASE_INDEX_URL) {
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

    const index = await fetchGitReleaseIndex(null);
    expect(index.version).toBe("authed-sha");
    expect(authHeader).toBe("Bearer ghp_test_token");
  });
});

import {
  CCO_DEFAULT_GIT_REF,
  CCO_DEFAULT_GIT_REPO_URL,
  CCO_RELEASE_INDEX_URL,
  CCO_RELEASES_ORIGIN,
  isDefaultGitRepo,
  normalizeGitRepoUrl,
  parseGitHubRepoUrl,
  type ReleaseIndex,
} from "@cco/shared";

const GITHUB_API = "https://api.github.com";
const GITHUB_USER_AGENT = "cco-org-updates";

type GithubCommitResponse = {
  sha: string;
  commit?: { committer?: { date?: string } };
};

type GithubReleaseResponse = {
  tag_name: string;
  published_at: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
};

function resolveGithubToken(): string | null {
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.CCO_GITHUB_TOKEN?.trim() ||
    null;
  return token || null;
}

function resolveGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": GITHUB_USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = resolveGithubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchGithubJson<T>(url: string): Promise<{ ok: true; json: T } | { ok: false; status: number }> {
  const res = await fetch(url, { headers: resolveGithubHeaders() });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  return { ok: true, json: (await res.json()) as T };
}

function resolveArtifactReleasesBaseUrl(repoUrl: string): string {
  const explicit = process.env.CCO_RELEASES_BASE_URL?.trim()?.replace(/\/+$/, "");
  if (explicit) return explicit;
  if (isDefaultGitRepo(repoUrl)) {
    return `${CCO_RELEASES_ORIGIN}/releases`;
  }
  throw new Error(
    "Custom git repositories must set CCO_RELEASES_BASE_URL to a URL hosting CCO release artifacts (worker bundles, cco-web-manifest.json, assets/).",
  );
}

async function fetchGithubMainCommitSha(owner: string, repo: string): Promise<{
  sha: string;
  publishedAt: string;
}> {
  const ref = process.env.CCO_GIT_REF?.trim() || CCO_DEFAULT_GIT_REF;
  const result = await fetchGithubJson<GithubCommitResponse>(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  if (!result.ok) {
    throw new Error(`GitHub commit lookup failed (HTTP ${result.status})`);
  }
  const json = result.json;
  if (!json.sha?.trim()) {
    throw new Error("GitHub commit response missing sha");
  }
  const publishedAt = json.commit?.committer?.date ?? new Date().toISOString();
  return { sha: json.sha.trim(), publishedAt };
}

async function fetchGithubLatestReleaseAsset(
  owner: string,
  repo: string,
  assetName: string,
): Promise<{ baseUrl: string; downloadUrl: string } | null> {
  const result = await fetchGithubJson<GithubReleaseResponse>(
    `${GITHUB_API}/repos/${owner}/${repo}/releases/latest`,
  );
  if (!result.ok) return null;
  const asset = result.json.assets?.find((entry) => entry.name === assetName);
  if (!asset?.browser_download_url) return null;
  const url = new URL(asset.browser_download_url);
  return {
    downloadUrl: asset.browser_download_url,
    baseUrl: url.href.slice(0, url.href.lastIndexOf("/")),
  };
}

async function fetchGithubLatestReleaseIndex(owner: string, repo: string): Promise<ReleaseIndex | null> {
  const asset = await fetchGithubLatestReleaseAsset(owner, repo, "release-index.json");
  if (!asset) return null;
  const res = await fetch(asset.downloadUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": GITHUB_USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as ReleaseIndex;
  if (!json.version?.trim()) return null;
  return {
    ...json,
    version: json.version.trim(),
    releasesBaseUrl: json.releasesBaseUrl?.trim() || asset.baseUrl,
  };
}

async function fetchSetupCoReleaseIndex(): Promise<ReleaseIndex | null> {
  const res = await fetch(CCO_RELEASE_INDEX_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": GITHUB_USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as ReleaseIndex;
  if (!json.version?.trim()) return null;
  return {
    ...json,
    version: json.version.trim(),
    releasesBaseUrl: json.releasesBaseUrl?.trim() || `${CCO_RELEASES_ORIGIN}/releases`,
  };
}

async function fetchCustomGitReleaseIndex(
  repoUrl: string,
  owner: string,
  repo: string,
): Promise<ReleaseIndex> {
  if (isDefaultGitRepo(repoUrl)) {
    const catalog = await fetchSetupCoReleaseIndex();
    if (catalog) {
      return catalog;
    }

    const { sha, publishedAt } = await fetchGithubMainCommitSha(owner, repo);
    return {
      version: sha,
      gitRef: CCO_DEFAULT_GIT_REF,
      publishedAt,
      releasesBaseUrl: resolveArtifactReleasesBaseUrl(repoUrl),
    };
  }

  const { sha, publishedAt } = await fetchGithubMainCommitSha(owner, repo);
  const releaseIndex = await fetchGithubLatestReleaseIndex(owner, repo);
  if (releaseIndex) {
    return {
      ...releaseIndex,
      version: sha,
      publishedAt,
    };
  }

  const releaseAsset = await fetchGithubLatestReleaseAsset(owner, repo, "release-index.json");
  return {
    version: sha,
    gitRef: CCO_DEFAULT_GIT_REF,
    publishedAt,
    releasesBaseUrl:
      releaseAsset?.baseUrl ?? resolveArtifactReleasesBaseUrl(repoUrl),
  };
}

/**
 * Resolve the release catalog for Admin Updates from the org git repository URL.
 * Default repo (BA-LSC/CCO) uses the setup-c.co release catalog when available, then GitHub main.
 * Custom forks use GitHub main for version and release assets for bundle URLs.
 */
export async function fetchGitReleaseIndex(gitRepoUrl: string | null | undefined): Promise<ReleaseIndex> {
  const repoUrl = normalizeGitRepoUrl(gitRepoUrl);
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error("Git repository URL must be a GitHub repository");
  }

  return fetchCustomGitReleaseIndex(repoUrl, parsed.owner, parsed.repo);
}

export function resolveOrgGitRepoUrl(gitRepoUrl: string | null | undefined): string {
  return normalizeGitRepoUrl(gitRepoUrl ?? CCO_DEFAULT_GIT_REPO_URL);
}

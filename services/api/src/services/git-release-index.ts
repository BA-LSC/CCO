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

type GithubCommitResponse = {
  sha: string;
  commit?: { committer?: { date?: string } };
};

type GithubReleaseResponse = {
  tag_name: string;
  published_at: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
};

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
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cco-org-updates",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub commit lookup failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as GithubCommitResponse;
  if (!json.sha?.trim()) {
    throw new Error("GitHub commit response missing sha");
  }
  const publishedAt = json.commit?.committer?.date ?? new Date().toISOString();
  return { sha: json.sha.trim(), publishedAt };
}

async function fetchSetupCReleaseIndex(): Promise<ReleaseIndex> {
  const url = process.env.CCO_RELEASE_INDEX_URL?.trim() || CCO_RELEASE_INDEX_URL;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Release index unavailable (HTTP ${res.status})`);
  }
  const json = (await res.json()) as ReleaseIndex;
  if (!json.version?.trim()) {
    throw new Error("Release index missing version");
  }
  return json;
}

async function fetchGithubLatestReleaseBase(
  owner: string,
  repo: string,
): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cco-org-updates",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const json = (await res.json()) as GithubReleaseResponse;
  const asset = json.assets?.find((entry) => entry.name === "release-index.json");
  if (!asset?.browser_download_url) return null;
  const url = new URL(asset.browser_download_url);
  return url.href.slice(0, url.href.lastIndexOf("/"));
}

/**
 * Resolve the release catalog for Admin Updates from a git repository URL.
 * Version checks use GitHub main (or CCO_GIT_REF); artifacts load from setup-c.co for the default repo
 * or CCO_RELEASES_BASE_URL / GitHub release assets for forks.
 */
export async function fetchGitReleaseIndex(gitRepoUrl: string | null | undefined): Promise<ReleaseIndex> {
  const repoUrl = normalizeGitRepoUrl(gitRepoUrl);
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error("Git repository URL must be a GitHub repository");
  }

  const { sha, publishedAt } = await fetchGithubMainCommitSha(parsed.owner, parsed.repo);

  if (isDefaultGitRepo(repoUrl)) {
    try {
      const catalog = await fetchSetupCReleaseIndex();
      if (catalog.version === sha) {
        return catalog;
      }
    } catch {
      // setup-c.co catalog may lag main; fall through to git-derived index.
    }
    return {
      version: sha,
      gitRef: CCO_DEFAULT_GIT_REF,
      publishedAt,
      releasesBaseUrl: resolveArtifactReleasesBaseUrl(repoUrl),
    };
  }

  const releaseBase = await fetchGithubLatestReleaseBase(parsed.owner, parsed.repo);
  return {
    version: sha,
    gitRef: CCO_DEFAULT_GIT_REF,
    publishedAt,
    releasesBaseUrl: releaseBase ?? resolveArtifactReleasesBaseUrl(repoUrl),
  };
}

export function resolveOrgGitRepoUrl(gitRepoUrl: string | null | undefined): string {
  return normalizeGitRepoUrl(gitRepoUrl ?? CCO_DEFAULT_GIT_REPO_URL);
}

/** Default upstream repository for BYO Cloudflare Admin Updates. */
export const CCO_DEFAULT_GIT_REPO_URL = "https://github.com/BA-LSC/CCO";

export const CCO_DEFAULT_GIT_REF = "main";

export type ParsedGitHubRepo = {
  owner: string;
  repo: string;
  /** Normalized HTTPS URL without trailing slash. */
  repoUrl: string;
};

/**
 * Parse a GitHub repository URL (HTTPS or git@github.com:owner/repo.git).
 * Returns null when the URL is not a GitHub repo.
 */
export function parseGitHubRepoUrl(input: string): ParsedGitHubRepo | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (sshMatch) {
    const owner = sshMatch[1]!;
    const repo = sshMatch[2]!.replace(/\.git$/i, "");
    return {
      owner,
      repo,
      repoUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0]!;
    const repo = parts[1]!.replace(/\.git$/i, "");
    return {
      owner,
      repo,
      repoUrl: `https://github.com/${owner}/${repo}`,
    };
  } catch {
    return null;
  }
}

export function normalizeGitRepoUrl(input: string | null | undefined): string {
  const value = input?.trim() || CCO_DEFAULT_GIT_REPO_URL;
  const parsed = parseGitHubRepoUrl(value);
  return parsed?.repoUrl ?? CCO_DEFAULT_GIT_REPO_URL;
}

export function isDefaultGitRepo(repoUrl: string): boolean {
  const normalized = normalizeGitRepoUrl(repoUrl);
  return normalized.toLowerCase() === CCO_DEFAULT_GIT_REPO_URL.toLowerCase();
}

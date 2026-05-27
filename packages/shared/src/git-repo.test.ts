import { describe, expect, test } from "bun:test";
import {
  CCO_DEFAULT_GIT_REPO_URL,
  isDefaultGitRepo,
  normalizeGitRepoUrl,
  parseGitHubRepoUrl,
} from "./git-repo.js";

describe("git-repo", () => {
  test("parseGitHubRepoUrl accepts HTTPS URLs", () => {
    expect(parseGitHubRepoUrl("https://github.com/BA-LSC/CCO")).toEqual({
      owner: "BA-LSC",
      repo: "CCO",
      repoUrl: "https://github.com/BA-LSC/CCO",
    });
  });

  test("parseGitHubRepoUrl accepts git@ URLs", () => {
    expect(parseGitHubRepoUrl("git@github.com:BA-LSC/CCO.git")).toEqual({
      owner: "BA-LSC",
      repo: "CCO",
      repoUrl: "https://github.com/BA-LSC/CCO",
    });
  });

  test("normalizeGitRepoUrl falls back to default", () => {
    expect(normalizeGitRepoUrl("")).toBe(CCO_DEFAULT_GIT_REPO_URL);
    expect(normalizeGitRepoUrl(null)).toBe(CCO_DEFAULT_GIT_REPO_URL);
  });

  test("isDefaultGitRepo matches canonical default", () => {
    expect(isDefaultGitRepo(CCO_DEFAULT_GIT_REPO_URL)).toBe(true);
    expect(isDefaultGitRepo("https://github.com/my-org/cco-fork")).toBe(false);
  });
});

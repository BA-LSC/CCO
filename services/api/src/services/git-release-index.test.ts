import { describe, expect, test } from "bun:test";
import { resolveOrgGitRepoUrl } from "./git-release-index";
import { CCO_DEFAULT_GIT_REPO_URL } from "@cco/shared";

describe("git-release-index", () => {
  test("resolveOrgGitRepoUrl defaults to BA-LSC/CCO", () => {
    expect(resolveOrgGitRepoUrl(null)).toBe(CCO_DEFAULT_GIT_REPO_URL);
    expect(resolveOrgGitRepoUrl("")).toBe(CCO_DEFAULT_GIT_REPO_URL);
  });
});

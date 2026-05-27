-- Git repository URL for Admin Updates (BYO Cloudflare).
ALTER TABLE "organizations" ADD COLUMN "git_repo_url" TEXT;

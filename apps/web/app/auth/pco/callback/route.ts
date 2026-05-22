import type { NextRequest } from "next/server";
import { handlePcoOAuthCallback } from "@/lib/pco-callback";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handlePcoOAuthCallback(request);
}

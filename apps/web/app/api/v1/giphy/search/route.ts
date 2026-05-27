import { proxyToApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  return proxyToApi(request, ["giphy", "search"]);
}

import { proxyToApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyToApi(request, ["giphy", "import"]);
}

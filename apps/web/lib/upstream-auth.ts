/** Headers for proxying browser requests to the CCO API with session auth. */
export function readSessionTokenFromRequest(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "connect_session") {
      const value = rest.join("=").trim();
      if (!value) return undefined;
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return undefined;
}

export function buildUpstreamAuthHeaders(request: Request): Headers {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
    return headers;
  }

  const session = readSessionTokenFromRequest(request);
  if (session) {
    headers.set("authorization", `Bearer ${session}`);
  }

  return headers;
}

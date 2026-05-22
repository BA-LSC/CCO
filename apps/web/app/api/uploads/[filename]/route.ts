import { NextResponse, type NextRequest } from "next/server";

type RouteContext = { params: Promise<{ filename: string }> };

/** Legacy path kept for older attachment URLs — forwards to the v1 upload proxy. */
export async function GET(request: NextRequest, context: RouteContext) {
  const { filename } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(incoming);
  target.pathname = `/api/v1/uploads/${filename}`;
  return NextResponse.redirect(target, 307);
}

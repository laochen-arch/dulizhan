import { cookies } from "next/headers";
import { revokeEmailSession } from "../../../../../db/email-auth";
import { EMAIL_SESSION_COOKIE } from "../../../../email-auth";
import { clearedSessionCookie, safeReturnTo } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(EMAIL_SESSION_COOKIE)?.value || "";
  await revokeEmailSession(raw);
  const response = new Response(null, { status: 302, headers: { Location: new URL(safeReturnTo(new URL(request.url).searchParams.get("return_to")), request.url).toString(), "Cache-Control": "no-store" } });
  response.headers.set("Set-Cookie", clearedSessionCookie());
  return response;
}

export async function POST(request: Request) { return GET(request); }

import { cookies } from "next/headers";
import { revokeEmailSession } from "../../../../../db/email-auth";
import { EMAIL_SESSION_COOKIE } from "../../../../email-auth";
import { safeReturnTo } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(EMAIL_SESSION_COOKIE)?.value || "";
  await revokeEmailSession(raw);
  const response = Response.redirect(new URL(safeReturnTo(new URL(request.url).searchParams.get("return_to")), request.url));
  response.headers.append("Set-Cookie", `${EMAIL_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
  return response;
}

export async function POST(request: Request) { return GET(request); }

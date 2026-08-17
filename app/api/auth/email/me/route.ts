import { getEmailSessionUser } from "../../../../email-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ user: await getEmailSessionUser() }, { headers: { "Cache-Control": "no-store" } });
}

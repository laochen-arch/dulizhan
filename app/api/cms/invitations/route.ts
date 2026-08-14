import { acceptInvitation, readInvitation } from "../../../../db/cms";
import { currentUser, errorResponse } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) return Response.json({ error: "Invitation token is required.", code: "INVALID_INVITATION" }, { status: 400 });
    return Response.json({ invitation: await readInvitation(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Sign in with ChatGPT to accept this invitation.", code: "AUTH_REQUIRED" }, { status: 401 });
    const payload = await request.json() as { token?: string };
    if (!payload.token) return Response.json({ error: "Invitation token is required.", code: "INVALID_INVITATION" }, { status: 400 });
    return Response.json({ invitation: await acceptInvitation(payload.token, user.userId, user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

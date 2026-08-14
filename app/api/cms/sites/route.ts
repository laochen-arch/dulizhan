import { createSite, listSites } from "../../../../db/cms";
import { errorResponse, currentUser } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Sign in with ChatGPT to manage client sites.", code: "AUTH_REQUIRED" }, { status: 401 });
    return Response.json({ sites: await listSites(user.userId, user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Sign in with ChatGPT to create client sites.", code: "AUTH_REQUIRED" }, { status: 401 });
    const payload = await request.json() as { name?: string; slug?: string };
    const name = payload.name?.trim() ?? "";
    const slug = payload.slug?.trim().toLowerCase() ?? "";
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return Response.json({ error: "Provide a client name and a lowercase URL slug.", code: "INVALID_SITE" }, { status: 400 });
    const site = await createSite(name, slug, user.userId, user.email);
    return Response.json({ site }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

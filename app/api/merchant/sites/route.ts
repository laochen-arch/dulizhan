import { getChatGPTUser } from "../../../chatgpt-auth";
import { listMerchantSites } from "../../../../db/v25";
import { merchantErrorResponse } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in with ChatGPT to manage your storefronts.", code: "AUTH_REQUIRED" }, { status: 401 });
    return Response.json({ sites: await listMerchantSites(user.userId, user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

import { getAccountContext, accountErrorResponse } from "../helpers";
import { updateCustomerProfile } from "../../../../db/v25";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { customer } = await getAccountContext(request);
    return Response.json({ profile: customer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    const payload = await request.json().catch(() => ({})) as { displayName?: string; phone?: string };
    return Response.json({ profile: await updateCustomerProfile(site.id, user, payload) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

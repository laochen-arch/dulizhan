import { getAccountContext, accountErrorResponse } from "../helpers";
import { createCustomerAddress, listCustomerAddresses } from "../../../../db/v25";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    return Response.json({ addresses: await listCustomerAddresses(site.id, user.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    const payload = await request.json().catch(() => ({}));
    const address = await createCustomerAddress(site.id, user.userId, payload);
    return Response.json({ address }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

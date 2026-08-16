import { getAccountContext, accountErrorResponse } from "../../helpers";
import { deleteCustomerAddress, updateCustomerAddress } from "../../../../../db/v25";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ addressId: string }> }) {
  try {
    const { site, user } = await getAccountContext(request);
    const { addressId } = await context.params;
    const payload = await request.json().catch(() => ({}));
    return Response.json({ address: await updateCustomerAddress(site.id, user.userId, addressId, payload) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ addressId: string }> }) {
  try {
    const { site, user } = await getAccountContext(request);
    const { addressId } = await context.params;
    return Response.json(await deleteCustomerAddress(site.id, user.userId, addressId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

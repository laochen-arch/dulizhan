import { getMerchantCustomer, listMerchantCustomers } from "../../../../db/v59-merchant";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "customers.read");
    const email = new URL(request.url).searchParams.get("email");
    const payload = email ? await getMerchantCustomer(access.site.id, email) : { customers: await listMerchantCustomers(access.site.id) };
    return Response.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

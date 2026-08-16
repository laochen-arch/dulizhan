import { accountErrorResponse, getAccountContext, AccountApiError } from "../helpers";
import { clearCustomerCart, listCustomerCart, mergeCustomerCart, replaceCustomerCart, type StoreCartLine } from "../../../../db/v31";

export const dynamic = "force-dynamic";

async function readItems(request: Request) {
  const payload = await request.json().catch(() => ({})) as { items?: unknown };
  if (!Array.isArray(payload.items) || payload.items.length > 100) throw new AccountApiError("Your saved bag could not be read.", 400, "INVALID_CART");
  return payload.items as StoreCartLine[];
}

export async function GET(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    return Response.json({ items: await listCustomerCart(site.id, user.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    return Response.json({ items: await mergeCustomerCart(site.id, user.userId, await readItems(request)) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    return Response.json({ items: await replaceCustomerCart(site.id, user.userId, await readItems(request)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    return Response.json({ items: await clearCustomerCart(site.id, user.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

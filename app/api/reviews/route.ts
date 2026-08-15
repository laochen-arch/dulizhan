import { createReview, listPublishedReviews } from "../../../db/v21";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const site = await resolveSiteByHost(request.headers.get("host"));
  const productId = new URL(request.url).searchParams.get("productId") || "";
  return Response.json({ reviews: productId ? await listPublishedReviews(site.id, productId) : [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const site = await resolveSiteByHost(request.headers.get("host"));
    const payload = await request.json() as { productId?: string; orderNumber?: string; email?: string; rating?: number; title?: string; body?: string };
    return Response.json(await createReview(site.id, { productId: payload.productId || "", orderNumber: payload.orderNumber, email: payload.email || "", rating: payload.rating || 0, title: payload.title, body: payload.body || "" }), { status: 201 });
  } catch { return Response.json({ error: "Review could not be submitted. Include a verified order and product." }, { status: 400 }); }
}

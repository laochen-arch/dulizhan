import { probeCommerceProvider, type CommerceProvider } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; provider?: CommerceProvider | "all" };
    const siteId = getSiteId(request, payload.siteId);
    await requireMember(siteId, "editor");
    const provider = payload.provider || "all";
    if (provider !== "all" && provider !== "paypal" && provider !== "resend") return Response.json({ error: "provider must be paypal, resend, or all.", code: "INVALID_PROVIDER" }, { status: 400 });
    const providers: CommerceProvider[] = provider === "all" ? ["paypal", "resend"] : [provider];
    const probes = await Promise.all(providers.map((item) => probeCommerceProvider(item)));
    return Response.json({ siteId, probes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

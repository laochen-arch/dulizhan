import { listPlatformPlans } from "../../../../db/v34";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ plans: await listPlatformPlans() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load platform plans.", code: "PLANS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

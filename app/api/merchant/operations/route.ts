import { getV24LaunchCenter } from "../../../../db/v24";
import { getAnalyticsSummary } from "../../../../db/v21";
import { getMerchantOperationalTasks } from "../../../../db/v59-merchant";
import { merchantRoleCapabilities } from "../../../../db/v25";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.read");
    const [launch, analytics, allTasks] = await Promise.all([getV24LaunchCenter(access.site.id, access.user!.userId, access.user!.email, true), getAnalyticsSummary(access.site.id, Number(new URL(request.url).searchParams.get("days") || 30)), getMerchantOperationalTasks(access.site.id)]);
    const capabilities = new Set(merchantRoleCapabilities[access.member.role]);
    const tasks = allTasks.filter((task) => task.section === "operations" || task.section === "orders" && capabilities.has("orders.read") || task.section === "inventory" && capabilities.has("inventory.read") || task.section === "after-sales" && capabilities.has("after-sales.read") || task.section === "integrations" && capabilities.has("merchant.settings.read"));
    return Response.json({ ...launch, analytics, tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

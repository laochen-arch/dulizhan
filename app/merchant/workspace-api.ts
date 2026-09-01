export async function workspaceRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok || !payload) {
    const messages: Record<string, string> = { AUTH_REQUIRED: "登录已过期，请重新登录。", FORBIDDEN: "当前账号没有操作此商户数据的权限。", PRODUCT_NOT_FOUND: "商品不存在，请返回列表刷新。", ORDER_NOT_FOUND: "订单不存在或不属于当前店铺。", INVALID_INVENTORY: "库存必须是 0 到 1000000 的整数。", INVENTORY_BELOW_RESERVED: "总库存不能小于已锁定库存。", LAST_OWNER: "必须保留至少一名店铺所有者。", CANNOT_REMOVE_SELF: "不能移除当前登录账号。", PRODUCT_IN_USE: "商品仍有被订单锁定的库存，暂时不能删除。" };
    throw new Error(messages[payload?.code || ""] || payload?.error || `请求失败（${response.status}），请稍后重试。`);
  }
  return payload;
}

export function merchantWrite<T>(siteId: string, resource: string, method: "POST" | "PATCH" | "DELETE", fields: Record<string, unknown>) {
  return workspaceRequest<T>(`/api/merchant/${resource}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, siteId }) });
}

export const productStatus = (value: string) => value === "active" ? "上架内容" : "草稿";
export const fulfillmentLabel = (value: string) => ({ unfulfilled: "待处理", processing: "配货中", shipped: "已发货", delivered: "已送达", cancelled: "已取消" }[value] || value);
export const paymentLabel = (value: string) => ({ pending: "待付款", paid: "已付款", partially_refunded: "部分退款", refunded: "已退款", failed: "付款失败", cancelled: "已取消", expired: "已超时" }[value] || value);
export const memberRoleLabel = (value: string) => ({ merchant_owner: "店铺所有者", merchant_manager: "店铺管理员", merchant_staff: "订单与履约人员", merchant_support: "售后客服" }[value] || value);

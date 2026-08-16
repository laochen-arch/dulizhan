const paymentLabels: Record<string, string> = {
  pending: "Payment pending",
  processing: "Payment processing",
  paid: "Paid",
  failed: "Payment failed",
  cancelled: "Payment canceled",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

const fulfillmentLabels: Record<string, string> = {
  unfulfilled: "Preparing order",
  processing: "Preparing shipment",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Canceled",
};

export function formatPaymentStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || "pending";
  return paymentLabels[normalized] || normalized.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatFulfillmentStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || "unfulfilled";
  return fulfillmentLabels[normalized] || normalized.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatOrderEventStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || "";
  if (paymentLabels[normalized]) return paymentLabels[normalized];
  if (fulfillmentLabels[normalized]) return fulfillmentLabels[normalized];
  return normalized.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()) || "Order updated";
}

export function canReviewOrder(paymentStatus: string | null | undefined, fulfillmentStatus: string | null | undefined) {
  const paid = ["paid", "partially_refunded"].includes(paymentStatus?.trim().toLowerCase() || "");
  const fulfilled = ["shipped", "delivered"].includes(fulfillmentStatus?.trim().toLowerCase() || "");
  return paid && fulfilled;
}

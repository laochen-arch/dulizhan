const COUPON_PREFIX = "northline-coupon-v28";

function couponKey(siteId: string) {
  const host = typeof window === "undefined" ? "server" : window.location.hostname || "local";
  return `${COUPON_PREFIX}:${encodeURIComponent(siteId)}:${host}`;
}

export function readStoredCoupon(siteId: string) {
  if (typeof window === "undefined") return "";
  return (window.localStorage.getItem(couponKey(siteId)) || "").trim().toUpperCase();
}

export function writeStoredCoupon(siteId: string, code: string) {
  if (typeof window === "undefined") return;
  const normalized = code.trim().toUpperCase();
  if (normalized) window.localStorage.setItem(couponKey(siteId), normalized);
  else window.localStorage.removeItem(couponKey(siteId));
}

export function clearStoredCoupon(siteId: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(couponKey(siteId));
}

export type StorefrontAccess = {
  authenticated: boolean;
  user: { id: string; email: string; displayName: string } | null;
  customerRole: "customer" | null;
  merchantRole: "merchant_owner" | "merchant_manager" | "merchant_staff" | "merchant_support" | null;
  cmsRole: "owner" | "editor" | "viewer" | null;
  capabilities?: string[];
};

type SessionPayload = { access?: StorefrontAccess };

const sessionRequest = new Map<string, Promise<StorefrontAccess | undefined>>();

function sessionScope() {
  return typeof window === "undefined" ? "server" : window.location.host || "local";
}

/**
 * One session request is shared by the header, wishlist, checkout and mobile
 * navigation. It keeps the storefront responsive without making identity
 * checks the source of truth for authorization (the server still enforces it).
 */
export function loadStorefrontSession() {
  const scope = sessionScope();
  const existing = sessionRequest.get(scope);
  if (existing) return existing;
  const request = fetch("/api/account/session", { cache: "no-store" })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({})) as SessionPayload;
      return payload.access;
    })
    .catch(() => {
      sessionRequest.delete(scope);
      return undefined;
    });
  sessionRequest.set(scope, request);
  return request;
}

export function clearStorefrontSessionCache() {
  sessionRequest.delete(sessionScope());
}

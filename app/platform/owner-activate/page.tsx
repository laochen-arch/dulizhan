"use client";

import { useEffect, useMemo, useState } from "react";

export default function PlatformOwnerActivatePage() {
  const query = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const applicationId = query.get("application") || "";
  const token = query.get("token") || "";
  const invalidLink = !applicationId || !token;
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [siteId, setSiteId] = useState("");

  useEffect(() => {
    if (invalidLink) return;
    void fetch("/api/platform/applications/owner-invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId, token }) })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { error?: string; siteId?: string };
        if (response.status === 401) { window.location.assign(`/auth/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
        if (!response.ok) throw new Error(payload.error || "邀请激活失败。");
        setSiteId(payload.siteId || "");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "邀请激活失败。"))
      .finally(() => setBusy(false));
  }, [applicationId, invalidLink, token]);

  const shownError = invalidLink ? "邀请链接不完整，请联系平台方重新发送。" : error;
  return <main className="simple-page container section-pad"><section className="email-auth-card platform-owner-activate-card"><p className="eyebrow">Merchant owner access</p><h1>{busy && !invalidLink ? "Activating your workspace…" : shownError ? "Activation needs attention." : "Your merchant workspace is ready."}</h1>{busy && !invalidLink && <p>We are checking the invitation and applying owner access. Please keep this window open.</p>}{shownError && <div className="client-notice error" role="alert">{shownError}</div>}{!busy && !shownError && <><p className="client-notice success" role="status">商户负责人权限已激活，可以进入商家后台管理商品、订单和站点。</p>{siteId && <a className="button button-dark" href={`/merchant?siteId=${encodeURIComponent(siteId)}`}>进入商家工作台 →</a>}</>}</section></main>;
}

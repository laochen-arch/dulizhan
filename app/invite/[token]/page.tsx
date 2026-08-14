"use client";

import { useEffect, useState } from "react";

type Invitation = { siteId: string; email: string; role: string; status: string; expiresAt: string };

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState("Loading invitation...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void params.then(({ token: nextToken }) => {
      setToken(nextToken);
      void fetch(`/api/cms/invitations?token=${encodeURIComponent(nextToken)}`, { cache: "no-store" }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { invitation?: Invitation; error?: string };
        if (!response.ok || !payload.invitation) throw new Error(payload.error || "Invitation unavailable.");
        setInvitation(payload.invitation);
        setMessage(payload.invitation.status === "pending" ? "This invitation is ready to accept." : `This invitation is ${payload.invitation.status}.`);
      }).catch((error) => setMessage(error instanceof Error ? error.message : "Invitation unavailable."));
    });
  }, [params]);

  const accept = async () => {
    setBusy(true);
    const response = await fetch("/api/cms/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    setMessage(response.ok ? "Access granted. Open the CMS workspace to continue." : payload.error || "Unable to accept invitation.");
    if (response.ok) setInvitation((current) => current ? { ...current, status: "accepted" } : current);
  };

  return <main className="admin-shell"><div className="container"><section className="v6-auth"><p className="eyebrow">Client workspace invitation</p><h1>Join this storefront.</h1><p>{message}</p>{invitation?.status === "pending" && <button className="button button-dark" onClick={() => void accept()} disabled={busy}>{busy ? "Accepting..." : `Accept as ${invitation.role}`} <span>-&gt;</span></button>}{invitation?.status === "accepted" && <a className="button button-outline" href="/admin">Open CMS workspace <span>-&gt;</span></a>}{!invitation && <a className="text-link" href="/admin">Return to workspace</a>}</section></div></main>;
}

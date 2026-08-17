import Link from "../components/site-link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { listMerchantSites } from "../../db/v25";
import { listPlatformApplications } from "../../db/v32";
import { ClientPortal } from "../client/client-portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merchant workspace" };

export default async function MerchantPage() {
  const user = await requireChatGPTUser("/merchant");
  const sites = await listMerchantSites(user.userId, user.email);
  if (sites.length) return <ClientPortal userName={user.displayName} mode="merchant" />;
  const applications = await listPlatformApplications({ userId: user.userId, email: user.email });
  return <main className="client-portal"><header className="merchant-workspace-topbar"><div className="merchant-workspace-topbar-inner"><Link href="/merchant" className="merchant-workspace-brand"><span className="merchant-workspace-mark">N</span><span><strong>Merchant workspace</strong><small>Store assignment</small></span></Link><div className="merchant-workspace-actions"><Link href="/">View storefront ↗</Link><a href={"/signout-with-chatgpt?return_to=" + encodeURIComponent("/merchant")}>Sign out</a></div></div></header><section className="client-portal-card"><p className="eyebrow">Merchant workspace</p><h1>Your store starts here.</h1><p className="v6-muted">Your account is signed in, but no storefront has been assigned yet. Apply to join the platform or check the progress of an existing application.</p><div className="v6-actions"><a className="button button-dark" href="/platform/apply">Apply for merchant access →</a><a className="button button-outline" href="/platform/applications">View application status</a></div><div className="v6-divider"><p className="eyebrow">Your applications</p>{applications.map((application) => <div className="v6-inline-row" key={application.id}><span><strong>{application.brandName}</strong><small>{application.companyName} · {application.status} · {new Date(application.updatedAt).toLocaleString()}</small></span></div>)}{!applications.length && <div className="v6-empty">No application has been submitted from this account.</div>}</div></section></main>;
}

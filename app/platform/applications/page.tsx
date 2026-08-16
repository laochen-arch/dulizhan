import { requireChatGPTUser } from "../../chatgpt-auth";
import { listPlatformApplications } from "../../../db/v32";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application status" };

export default async function PlatformApplicationsPage() {
  const user = await requireChatGPTUser("/platform/applications");
  const applications = await listPlatformApplications({ userId: user.userId, email: user.email });
  return <main className="platform-portal"><section className="platform-form-shell"><div><p className="eyebrow">Merchant onboarding</p><h1>Application status.</h1><p className="v6-muted">Signed in as {user.email}. When a storefront is created, it will appear in your merchant workspace automatically.</p></div><div className="platform-application-list">{applications.map((application) => <article key={application.id}><div><p className="eyebrow">{application.status}</p><h2>{application.brandName}</h2><p>{application.companyName} · {application.category}</p></div><div><span>Updated</span><strong>{new Date(application.updatedAt).toLocaleString()}</strong>{application.assignedSiteId && <small>Storefront assigned: {application.assignedSiteId}</small>}</div></article>)}{!applications.length && <div className="v6-empty">No applications found for this account.</div>}<a className="button button-dark" href="/platform/apply">Start another application →</a></div></section></main>;
}

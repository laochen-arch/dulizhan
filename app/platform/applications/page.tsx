import { PlatformApplicationStatus } from "../application-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application status" };

export default function PlatformApplicationsPage() {
  return <main className="platform-portal"><section className="platform-form-shell platform-status-shell"><div><p className="eyebrow">Merchant onboarding</p><h1>Your launch workspace.</h1><p className="v6-muted">Track review decisions, supply missing materials, request a domain and keep the platform team in the loop from one secure workspace.</p></div><PlatformApplicationStatus /></section></main>;
}

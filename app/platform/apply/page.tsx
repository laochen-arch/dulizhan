import { PlatformApplicationForm } from "../platform-application-form";

export const metadata = { title: "Apply for merchant access" };

export default function PlatformApplyPage() {
  return <main className="platform-portal"><section className="platform-form-shell"><div><p className="eyebrow">Merchant onboarding</p><h1>Tell us what you are building.</h1><p className="v6-muted">Submit once. The platform team will review the details, create your storefront from the approved template and invite your merchant owner.</p></div><PlatformApplicationForm /></section></main>;
}

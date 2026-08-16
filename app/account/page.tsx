import { AccountPage } from "./account-page";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

export default function AccountRoute() {
  return <AccountPage />;
}

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = { title: "Merchant workspace" };

export default async function ClientPage() {
  redirect("/merchant");
}

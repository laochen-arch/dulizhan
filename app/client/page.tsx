import { requireChatGPTUser } from "../chatgpt-auth";
import { ClientPortal } from "./client-portal";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client self-service portal" };

export default async function ClientPage() {
  const user = await requireChatGPTUser("/client");
  return <ClientPortal userName={user.displayName} />;
}

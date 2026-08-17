import { cookies } from "next/headers";
import { getEmailUserBySessionToken } from "../db/email-auth";

export const EMAIL_SESSION_COOKIE = "northline_email_session";

export async function getEmailSessionUser() {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(EMAIL_SESSION_COOKIE)?.value || "";
    return rawToken ? await getEmailUserBySessionToken(rawToken) : null;
  } catch { return null; }
}

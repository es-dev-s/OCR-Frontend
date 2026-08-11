import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_FLAG_COOKIE } from "@/lib/auth-session";

/**
 * `/` is resolved by middleware using the session flag cookie.
 * This server fallback keeps behavior correct if middleware is bypassed.
 */
export default async function HomePage() {
  const jar = await cookies();
  const hasSession = jar.get(SESSION_FLAG_COOKIE)?.value === "1";
  redirect(hasSession ? "/documents" : "/login");
}

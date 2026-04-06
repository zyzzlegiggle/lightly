import { auth0 } from "@/lib/auth0";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Direct Notion OAuth — bypasses Auth0 entirely.
 * Uses Notion's public integration OAuth flow.
 */
export async function GET() {
  const session = await auth0.getSession();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!session?.user) {
    return Response.redirect(new URL("/api/auth/login", appUrl));
  }

  const clientId = process.env.NOTION_CLIENT_ID!;
  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("notion_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const callbackUrl = `${appUrl}/api/auth/notion/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    owner: "user",
    state,
  });

  console.log(`[Notion] Direct OAuth for user ${session.user.sub}`);
  return Response.redirect(`https://api.notion.com/v1/oauth/authorize?${params}`);
}

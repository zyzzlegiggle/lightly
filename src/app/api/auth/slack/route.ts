import { auth0 } from "@/lib/auth0";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Direct Slack OAuth v2 — bypasses Auth0 entirely.
 * Redirects user to Slack's authorize URL with user_scope for a user token.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get("returnTo") || "/settings";
  const session = await auth0.getSession();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!session?.user) {
    return Response.redirect(new URL("/api/auth/login", appUrl));
  }

  const clientId = process.env.SLACK_CLIENT_ID!;
  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("slack_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("slack_return_to", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const callbackUrl = `${appUrl}/api/auth/slack/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: "channels:read,channels:history,channels:write,chat:write,groups:read,groups:history,groups:write,team:read",
    redirect_uri: callbackUrl,
    state,
  });

  console.log(`[Slack] Direct OAuth for user ${session.user.sub}`);
  return Response.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
}

import { auth0 } from "@/lib/auth0";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Initiates Slack OAuth through Auth0.
 * Auth0 handles the OAuth with Slack, then redirects back to our callback.
 */
export async function GET() {
  const session = await auth0.getSession();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!session?.user) {
    return Response.redirect(new URL("/api/auth/login", appUrl));
  }

  const domain = process.env.AUTH0_DOMAIN!;
  const clientId = process.env.AUTH0_CLIENT_ID!;

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("slack_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const callbackUrl = `${appUrl}/api/auth/slack/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid profile email",
    connection: "sign-in-with-slack",
    state,
  });

  console.log(`[Slack] Initiating Slack connection for user ${session.user.sub}`);
  console.log(`[Slack] Callback URL: ${callbackUrl}`);

  return Response.redirect(`https://${domain}/authorize?${params}`);
}

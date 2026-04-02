import { auth0 } from "@/lib/auth0";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Initiates a service connection (Gmail, Notion, Calendar, etc.) through Auth0
 * WITHOUT replacing the user's main session.
 *
 * Unlike startInteractiveLogin (which replaces the session), this builds
 * the Auth0 /authorize URL manually and redirects the callback to our own
 * handler that only stores service tokens — same pattern as the Slack flow.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const connection = searchParams.get("connection");
  const returnTo = searchParams.get("returnTo") || "/";

  if (!connection) {
    return Response.json({ error: "Missing connection parameter" }, { status: 400 });
  }

  // Must be logged in already
  const session = await auth0.getSession();
  if (!session?.user) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return Response.redirect(`${appUrl}/api/auth/login`);
  }

  const domain = process.env.AUTH0_DOMAIN!;
  const clientId = process.env.AUTH0_CLIENT_ID!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Generate a CSRF state token
  const state = crypto.randomBytes(32).toString("hex");

  // Store connection + returnTo + state in a cookie so the callback knows which service
  const cookieStore = await cookies();
  cookieStore.set("connect_meta", JSON.stringify({ connection, returnTo, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty for OAuth round-trip
    path: "/",
  });

  const callbackUrl = `${appUrl}/api/auth/connect/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid profile email offline_access",
    connection,
    state,
  });

  console.log(`[Connect] Initiating ${connection} connection for user ${session.user.sub}`);
  console.log(`[Connect] Callback URL: ${callbackUrl}`);
  console.log(`[Connect] Full authorize URL: https://${domain}/authorize?${params}`);

  return Response.redirect(`https://${domain}/authorize?${params}`);
}

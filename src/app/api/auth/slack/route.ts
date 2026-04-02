import { auth0 } from "@/lib/auth0";

/**
 * Initiates Slack OAuth through Auth0.
 * Auth0 handles the HTTPS callback with Slack, then redirects back to us.
 */
export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect(new URL("/api/auth/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }

  const domain = process.env.AUTH0_DOMAIN!;
  const clientId = process.env.AUTH0_CLIENT_ID!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/slack/callback`,
    response_type: "code",
    scope: "openid profile email offline_access",
    connection: "sign-in-with-slack",
  });

  return Response.redirect(`https://${domain}/authorize?${params}`);
}

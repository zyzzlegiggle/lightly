import { auth0 } from "@/lib/auth0";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const connection = searchParams.get("connection");
  const returnTo = searchParams.get("returnTo") || "/";

  if (!connection) {
    return Response.json({ error: "Missing connection parameter" }, { status: 400 });
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    // Not logged in — send to login first, with returnTo preserved
    return Response.redirect(
      `/api/auth/login?returnTo=${encodeURIComponent(
        `/api/auth/connect?connection=${connection}&returnTo=${encodeURIComponent(returnTo)}`
      )}`
    );
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!domain || !clientId) {
    return Response.json({ error: "Auth0 config missing" }, { status: 500 });
  }

  // Redirect to Auth0's /authorize endpoint with the connection and prompt=login
  // to trigger account linking. We pass returnTo via state so the callback can redirect back.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/callback`,
    response_type: "code",
    scope: "openid profile email offline_access",
    connection,
    prompt: "login", // Force re-authentication to trigger linking
    state: encodeURIComponent(JSON.stringify({ returnTo })),
  });

  return Response.redirect(`https://${domain}/authorize?${params}`);
}

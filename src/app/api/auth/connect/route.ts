import { auth0 } from "@/lib/auth0";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const connection = searchParams.get("connection");

  if (!connection) {
    return Response.json({ error: "Missing connection parameter" }, { status: 400 });
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect("/api/auth/login");
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;

  if (!domain || !clientId) {
    return Response.json({ error: "Auth0 config missing" }, { status: 500 });
  }

  // Redirect to Auth0's /authorize endpoint with the connection and prompt=login
  // to trigger account linking
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/callback`,
    response_type: "code",
    scope: "openid profile email offline_access",
    connection,
    prompt: "login", // Force re-authentication to trigger linking
  });

  return Response.redirect(`https://${domain}/authorize?${params}`);
}

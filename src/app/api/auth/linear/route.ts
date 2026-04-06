import { auth0 } from "@/lib/auth0";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Direct Linear OAuth — bypasses Auth0 entirely.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get("returnTo") || "/settings";
  const session = await auth0.getSession();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!session?.user) {
    return Response.redirect(new URL("/api/auth/login", appUrl));
  }

  const clientId = process.env.LINEAR_CLIENT_ID!;
  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("linear_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("linear_return_to", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const callbackUrl = `${appUrl}/api/auth/linear/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "read,write",
    state,
    prompt: "consent",
  });

  console.log(`[Linear] Direct OAuth for user ${session.user.sub}`);
  return Response.redirect(`https://linear.app/oauth/authorize?${params}`);
}

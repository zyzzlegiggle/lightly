import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * Direct Linear OAuth callback — exchanges code with Linear's API.
 */
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("linear_state")?.value;
  cookieStore.delete("linear_state");

  const returnTo = cookieStore.get("linear_return_to")?.value || "/settings";
  cookieStore.delete("linear_return_to");

  if (error || !code) {
    console.error(`[Linear Callback] Denied: ${error}`);
    return Response.redirect(`${appUrl}/settings?error=linear_denied`);
  }

  if (expectedState && returnedState !== expectedState) {
    console.error("[Linear Callback] State mismatch");
    return Response.redirect(`${appUrl}/settings?error=linear_state_mismatch`);
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect(`${appUrl}/api/auth/login`);
  }

  const userId = session.user.sub;

  try {
    // Exchange code with Linear directly
    const tokenResp = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.LINEAR_CLIENT_ID!,
        client_secret: process.env.LINEAR_CLIENT_SECRET!,
        code,
        redirect_uri: `${appUrl}/api/auth/linear/callback`,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error("[Linear Callback] Token exchange failed:", err);
      return Response.redirect(`${appUrl}/settings?error=linear_exchange_failed`);
    }

    const data = await tokenResp.json();
    const linearToken = data.access_token;

    if (!linearToken) {
      console.error("[Linear Callback] No access token");
      return Response.redirect(`${appUrl}/settings?error=linear_no_token`);
    }

    // Fetch user/org info from Linear API
    let orgName = "Linear";
    let orgId = "linear";
    try {
      const meResp = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${linearToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "{ organization { id name } }" }),
      });
      const meData = await meResp.json();
      orgId = meData.data?.organization?.id || "linear";
      orgName = meData.data?.organization?.name || "Linear";
    } catch {
      console.warn("[Linear Callback] Could not fetch org info");
    }

    // Upsert in account table
    const existing = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.providerId, "linear")),
    });

    if (existing) {
      await db.update(account)
        .set({ accessToken: linearToken, accountId: orgId, idToken: orgName, updatedAt: new Date() })
        .where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId,
        providerId: "linear",
        accountId: orgId,
        accessToken: linearToken,
        idToken: orgName,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`[Linear Callback] ✓ Connected "${orgName}" for user ${userId}`);
    return Response.redirect(`${appUrl}${returnTo}`);

  } catch (e: any) {
    console.error("[Linear Callback] Error:", e);
    return Response.redirect(`${appUrl}/settings?error=linear_denied`);
  }
}

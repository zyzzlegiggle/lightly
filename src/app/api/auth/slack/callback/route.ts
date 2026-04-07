import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * Direct Slack OAuth v2 callback — exchanges code directly with Slack API.
 * No Auth0 involvement. Stores the user token in the account table.
 */
export async function GET(req: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");

  // Validate CSRF state
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("slack_state")?.value;
  cookieStore.delete("slack_state");

  const returnTo = cookieStore.get("slack_return_to")?.value || "/settings";
  cookieStore.delete("slack_return_to");

  if (error || !code) {
    console.error(`[Slack Callback] Denied: ${error}`);
    return Response.redirect(`${appUrl}/settings?error=slack_denied&reason=${encodeURIComponent(error || "unknown")}`);
  }

  if (expectedState && returnedState !== expectedState) {
    console.error("[Slack Callback] State mismatch");
    return Response.redirect(`${appUrl}/settings?error=slack_state_mismatch`);
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect(`${appUrl}/api/auth/login`);
  }

  const userId = session.user.sub;
  const clientId = process.env.SLACK_CLIENT_ID!;
  const clientSecret = process.env.SLACK_CLIENT_SECRET!;
  const callbackUrl = `${appUrl}/api/auth/slack/callback`;

  try {
    // ── Exchange code directly with Slack ──
    console.log("[Slack Callback] Exchanging code with Slack API directly");
    const tokenResp = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    const data = await tokenResp.json();

    if (!data.ok) {
      console.error("[Slack Callback] Slack token exchange failed:", data.error);
      return Response.redirect(`${appUrl}/settings?error=slack_exchange_failed&reason=${encodeURIComponent(data.error || "unknown")}`);
    }

    // Extract user token (from user_scope OAuth)
    const slackToken = data.authed_user?.access_token || data.access_token;
    if (!slackToken) {
      console.error("[Slack Callback] No access token in response:", JSON.stringify(data));
      return Response.redirect(`${appUrl}/settings?error=slack_no_token`);
    }

    const teamId = data.team?.id || "unknown";
    const teamName = data.team?.name || "Slack Workspace";

    console.log(`[Slack Callback] Got token for team "${teamName}" (${teamId})`);

    // ── Upsert in account table ──
    const existing = await db.query.account.findFirst({
      where: and(
        eq(account.userId, userId),
        eq(account.providerId, "slack"),
        eq(account.accountId, teamId),
      ),
    });

    if (existing) {
      await db.update(account)
        .set({ accessToken: slackToken, idToken: teamName, updatedAt: new Date() })
        .where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId,
        providerId: "slack",
        accountId: teamId,
        accessToken: slackToken,
        idToken: teamName,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`[Slack Callback] ✓ Connected workspace "${teamName}" for user ${userId}`);
    return Response.redirect(`${appUrl}${returnTo}`);

  } catch (e: any) {
    console.error("[Slack Callback] Error:", e);
    return Response.redirect(`${appUrl}/settings?error=slack_denied&reason=${encodeURIComponent(e.message || "unknown")}`);
  }
}

import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { ensureUserExists } from "@/lib/ensure-user";

/**
 * Handles the callback after Auth0 completes the Slack OAuth.
 * Exchanges the Auth0 code for tokens, then uses Token Vault
 * to get the Slack bot token and stores it in our DB.
 */
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    console.error("[Slack Callback] Error:", error, searchParams.get("error_description"));
    return Response.redirect(`${appUrl}/settings?error=slack_denied`);
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect(`${appUrl}/api/auth/login`);
  }

  await ensureUserExists(session.user);
  const userId = session.user.sub;
  const domain = process.env.AUTH0_DOMAIN!;
  const clientId = process.env.AUTH0_CLIENT_ID!;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET!;

  // 1. Exchange Auth0 code for tokens (includes refresh_token)
  const tokenResp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${appUrl}/api/auth/slack/callback`,
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    console.error("[Slack Callback] Auth0 token exchange failed:", err);
    return Response.redirect(`${appUrl}/settings?error=slack_exchange_failed`);
  }

  const tokens = await tokenResp.json();
  const refreshToken = tokens.refresh_token;

  if (!refreshToken) {
    console.error("[Slack Callback] No refresh token returned from Auth0");
    return Response.redirect(`${appUrl}/settings?error=slack_no_refresh`);
  }

  // 2. Use Token Vault to get the Slack access token
  const vaultResp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
      subject_token: refreshToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
      requested_token_type: "http://auth0.com/oauth/token-type/token-vault-access-token",
      connection: "sign-in-with-slack",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!vaultResp.ok) {
    const err = await vaultResp.text();
    console.error("[Slack Callback] Token Vault exchange failed:", err);
    return Response.redirect(`${appUrl}/settings?error=slack_vault_failed`);
  }

  const vault = await vaultResp.json();
  const slackToken = vault.access_token;

  // 3. Fetch Slack team info
  const teamResp = await fetch("https://slack.com/api/team.info", {
    headers: { Authorization: `Bearer ${slackToken}` },
  });
  const teamData = await teamResp.json();
  const teamId = teamData.team?.id || "unknown";
  const teamName = teamData.team?.name || "Slack Workspace";

  // 4. Upsert in our account table (supports multi-workspace)
  const existing = await db.query.account.findFirst({
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, "slack"),
      eq(account.accountId, teamId)
    ),
  });

  if (existing) {
    await db.update(account)
      .set({
        accessToken: slackToken,
        refreshToken,
        idToken: teamName,
        updatedAt: new Date(),
      })
      .where(eq(account.id, existing.id));
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId,
      providerId: "slack",
      accountId: teamId,
      accessToken: slackToken,
      refreshToken,
      idToken: teamName,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return Response.redirect(`${appUrl}/settings?connected=slack&team=${encodeURIComponent(teamName)}`);
}

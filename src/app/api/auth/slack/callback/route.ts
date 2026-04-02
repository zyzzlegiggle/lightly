import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

// Cache management token (24h TTL)
let cachedMgmtToken: { token: string; expiresAt: number } | null = null;

async function getManagementToken(): Promise<string> {
  if (cachedMgmtToken && Date.now() < cachedMgmtToken.expiresAt - 300_000) {
    return cachedMgmtToken.token;
  }
  const domain = process.env.AUTH0_DOMAIN!;
  const resp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: `https://${domain}/api/v2/`,
      grant_type: "client_credentials",
    }),
  });
  if (!resp.ok) throw new Error(`Management token failed: ${await resp.text()}`);
  const data = await resp.json();
  cachedMgmtToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const returnedState = searchParams.get("state");

  // Validate CSRF state
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("slack_state")?.value;
  cookieStore.delete("slack_state");

  if (error || !code) {
    console.error(`[Slack Callback] Auth0 denied: ${error} — ${errorDescription}`);
    return Response.redirect(
      `${appUrl}/settings?error=slack_denied&reason=${encodeURIComponent(errorDescription || error || "unknown")}`
    );
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
  const domain = process.env.AUTH0_DOMAIN!;
  const clientId = process.env.AUTH0_CLIENT_ID!;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET!;

  try {
    // ── Step 1: Exchange code for tokens ──
    console.log("[Slack Callback] Exchanging code for tokens");
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
      console.error("[Slack Callback] Token exchange failed:", err);
      return Response.redirect(`${appUrl}/settings?error=slack_exchange_failed`);
    }

    const tokens = await tokenResp.json();
    const refreshToken = tokens.refresh_token || null;
    const idToken = tokens.id_token || null;

    // ── Step 2: Try to get Slack token via Management API ──
    let slackToken: string | null = null;
    let secondarySub: string | null = null;

    // Decode id_token safely — it might not be present
    if (idToken) {
      try {
        const parts = idToken.split(".");
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
          secondarySub = payload.sub as string;
        }
      } catch {
        console.warn("[Slack Callback] Could not decode id_token");
      }
    }

    if (secondarySub) {
      try {
        const mgmtToken = await getManagementToken();
        const userResp = await fetch(
          `https://${domain}/api/v2/users/${encodeURIComponent(secondarySub)}`,
          { headers: { Authorization: `Bearer ${mgmtToken}` } }
        );
        if (userResp.ok) {
          const userData = await userResp.json();
          // Log all identities to help debug provider name matching
          console.log("[Slack Callback] Identities:", JSON.stringify(userData.identities?.map((i: any) => ({ provider: i.provider, connection: i.connection })) || []));
          // Try multiple provider names — Auth0 may use different names
          const identity = userData.identities?.find(
            (i: any) =>
              i.provider === "slack" ||
              i.provider === "sign-in-with-slack" ||
              i.connection === "sign-in-with-slack" ||
              i.connection === "slack"
          );
          if (identity && identity.access_token) {
            slackToken = identity.access_token;
            console.log("[Slack Callback] Got Slack token via Management API ✓");
          } else {
            console.warn("[Slack Callback] Identity found but no access_token. Providers:", userData.identities?.map((i: any) => i.provider));
          }
        }
      } catch (e) {
        console.warn("[Slack Callback] Management API error:", e);
      }
    }

    // ── Step 3: Fallback — Token Vault ──
    if (!slackToken && refreshToken) {
      console.log("[Slack Callback] Trying Token Vault fallback");
      try {
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
        if (vaultResp.ok) {
          const vault = await vaultResp.json();
          slackToken = vault.access_token;
          console.log("[Slack Callback] Token Vault success ✓");
        } else {
          console.error("[Slack Callback] Token Vault failed:", await vaultResp.text());
        }
      } catch (e) {
        console.error("[Slack Callback] Token Vault error:", e);
      }
    }

    // ── Step 4: Fallback — use Auth0 access_token directly ──
    // Some Auth0 social connections embed the upstream token as the Auth0 access_token
    if (!slackToken && tokens.access_token) {
      console.log("[Slack Callback] Using Auth0 access_token as fallback");
      slackToken = tokens.access_token;
    }

    if (!slackToken) {
      console.error("[Slack Callback] Could not obtain any Slack token");
      return Response.redirect(`${appUrl}/settings?error=slack_no_token`);
    }

    // ── Step 5: Fetch Slack team info ──
    let teamId = "unknown";
    let teamName = "Slack Workspace";
    try {
      const teamResp = await fetch("https://slack.com/api/team.info", {
        headers: { Authorization: `Bearer ${slackToken}` },
      });
      const teamData = await teamResp.json();
      if (teamData.ok) {
        teamId = teamData.team?.id || "unknown";
        teamName = teamData.team?.name || "Slack Workspace";
      } else {
        console.warn("[Slack Callback] team.info responded with:", teamData.error);
      }
    } catch (e) {
      console.warn("[Slack Callback] Could not fetch team info:", e);
    }

    // ── Step 6: Upsert in account table ──
    const existing = await db.query.account.findFirst({
      where: and(
        eq(account.userId, userId),
        eq(account.providerId, "slack"),
        eq(account.accountId, teamId),
      ),
    });

    if (existing) {
      await db.update(account)
        .set({ accessToken: slackToken, refreshToken: refreshToken ?? existing.refreshToken, idToken: teamName, updatedAt: new Date() })
        .where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId,
        providerId: "slack",
        accountId: teamId,
        accessToken: slackToken,
        refreshToken: refreshToken ?? null,
        idToken: teamName,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`[Slack Callback] ✓ Connected workspace "${teamName}" for user ${userId}`);
    return Response.redirect(`${appUrl}/settings?connected=slack&team=${encodeURIComponent(teamName)}`);

  } catch (e: any) {
    console.error("[Slack Callback] Unhandled error:", e);
    return Response.redirect(`${appUrl}/settings?error=slack_denied&reason=${encodeURIComponent(e.message || "unknown")}`);
  }
}

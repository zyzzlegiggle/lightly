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

/**
 * Callback for service connections (Gmail, Google Calendar, Slack, etc.).
 *
 * Strategy: Exchange the Auth0 code → get the temporary user id from id_token
 * → fetch that user's identity from the Management API → extract the
 * provider access_token directly. This avoids needing Token Vault
 * "Connected Accounts" to be configured per-connection.
 */
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const returnedState = searchParams.get("state");

  // Read and clear the cookie
  const cookieStore = await cookies();
  const metaRaw = cookieStore.get("connect_meta")?.value;
  cookieStore.delete("connect_meta");

  const meta = metaRaw
    ? JSON.parse(metaRaw)
    : { connection: "unknown", returnTo: "/", state: null };
  const { connection, returnTo, state: expectedState } = meta;

  if (error || !code) {
    console.error(`[Connect Callback] Auth0 denied "${connection}": ${error} — ${errorDescription}`);
    console.error(`  → Check Allowed Callback URLs include: ${appUrl}/api/auth/connect/callback`);
    console.error(`  → Check the "${connection}" social connection is enabled for this app`);
    return Response.redirect(
      `${appUrl}${returnTo}?error=${connection}_denied&reason=${encodeURIComponent(errorDescription || error || "unknown")}`
    );
  }

  // CSRF check
  if (expectedState && returnedState !== expectedState) {
    console.error(`[Connect Callback] State mismatch for "${connection}"`);
    return Response.redirect(`${appUrl}${returnTo}?error=${connection}_state_mismatch`);
  }

  // The main (existing) session — this is the user we're connecting services to
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect(`${appUrl}/api/auth/login`);
  }

  const userId = session.user.sub; // e.g. "github|112403713"
  const domain = process.env.AUTH0_DOMAIN!;
  const clientId = process.env.AUTH0_CLIENT_ID!;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET!;

  // ── Step 1: Exchange code to get Auth0 tokens ──────────────────────────────
  // The code represents a *secondary* Auth0 user (e.g. google-oauth2|xxx).
  // We need to decode the id_token to find that secondary user's Auth0 sub.
  console.log(`[Connect Callback] Exchanging code for tokens (connection: ${connection})`);

  const tokenResp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${appUrl}/api/auth/connect/callback`,
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    console.error(`[Connect Callback] Token exchange failed for ${connection}:`, err);
    return Response.redirect(
      `${appUrl}${returnTo}?error=${connection}_exchange_failed&reason=${encodeURIComponent(err)}`
    );
  }

  const tokens = await tokenResp.json();
  const refreshToken = tokens.refresh_token || null;
  const idToken = tokens.id_token || null;

  // ── Step 2: Decode id_token to get the secondary user's sub ───────────────
  let secondarySub: string | null = null;
  if (idToken) {
    try {
      const parts = idToken.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
        secondarySub = payload.sub as string; // e.g. "google-oauth2|1234567890"
      }
    } catch (e) {
      console.error(`[Connect Callback] Could not decode id_token:`, e);
    }
  }

  // ── Step 3: Get the provider access token via Management API ──────────────
  // This is the same pattern auth-context.ts uses for GitHub — fetch the
  // user record from the Mgmt API and extract the federated identity's token.
  let serviceToken: string | null = null;

  if (secondarySub) {
    try {
      const mgmtToken = await getManagementToken();
      const userResp = await fetch(
        `https://${domain}/api/v2/users/${encodeURIComponent(secondarySub)}`,
        { headers: { Authorization: `Bearer ${mgmtToken}` } }
      );
      if (userResp.ok) {
        const userData = await userResp.json();
        // The identity list contains the provider-specific access token
        const identity = userData.identities?.find(
          (i: any) => i.provider === connection || i.connection === connection
        );
        serviceToken = identity?.access_token ?? null;
        console.log(`[Connect Callback] Got provider token via Management API for ${connection}: ${serviceToken ? "✓" : "✗"}`);
      } else {
        console.warn(`[Connect Callback] Management API fetch failed:`, await userResp.text());
      }
    } catch (e) {
      console.warn(`[Connect Callback] Management API error:`, e);
    }
  }

  // ── Step 4: Fallback to Token Vault if Management API didn't yield a token ─
  if (!serviceToken && refreshToken) {
    console.log(`[Connect Callback] Trying Token Vault fallback for ${connection}`);
    const vaultResp = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:
          "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
        subject_token: refreshToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
        requested_token_type:
          "http://auth0.com/oauth/token-type/token-vault-access-token",
        connection,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (vaultResp.ok) {
      const vault = await vaultResp.json();
      serviceToken = vault.access_token;
      console.log(`[Connect Callback] Token Vault success for ${connection}`);
    } else {
      const err = await vaultResp.text();
      console.error(`[Connect Callback] Token Vault failed for ${connection}:`, err);
      console.error(`  → To fix: enable Token Vault on the "${connection}" connection`);
      console.error(`    Auth0 Dashboard → Authentication → Social → ${connection} → Purpose → Connected Accounts for Token Vault`);
    }
  }

  // ── Step 4b: Final fallback — use Auth0 access_token directly ──
  if (!serviceToken && tokens.access_token) {
    console.log(`[Connect Callback] Using Auth0 access_token as fallback for ${connection}`);
    serviceToken = tokens.access_token;
  }

  if (!serviceToken) {
    console.error(`[Connect Callback] Could not obtain service token for ${connection}`);
    return Response.redirect(`${appUrl}${returnTo}?error=${connection}_no_token`);
  }

  // ── Step 5: Upsert in account table ───────────────────────────────────────
  const providerId = connection; // e.g. "google-oauth2"
  const existing = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, providerId)),
  });

  if (existing) {
    await db.update(account)
      .set({ 
        accessToken: serviceToken, 
        refreshToken: refreshToken ?? existing.refreshToken, 
        accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        updatedAt: new Date() 
      })
      .where(eq(account.id, existing.id));
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId,
      providerId,
      accountId: secondarySub || connection,
      accessToken: serviceToken,
      refreshToken: refreshToken ?? null,
      accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log(`[Connect Callback] ✓ Connected ${connection} for user ${userId}`);
  return Response.redirect(`${appUrl}${returnTo}?connected=${connection}`);
}

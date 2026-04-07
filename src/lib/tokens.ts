import { db } from "./db";
import { account } from "./schema";
import { and, eq } from "drizzle-orm";
import { exchangeForServiceToken } from "./token-vault";

/**
 * Shared helper to get a management API token.
 */
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

  if (!resp.ok) throw new Error("Failed to get Management API token");
  const data = await resp.json();
  cachedMgmtToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Robust helper to get an access token for a provider (google-oauth2, slack, github).
 * Checks both the Auth0 identities (for linked accounts) AND the local DB (for connected accounts).
 */
export async function getServiceToken(userId: string, providerId: string): Promise<string | null> {
  // 1. Check local DB 'account' table
  let row: any = null;
  try {
    row = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.providerId, providerId)),
    });
  } catch (e) {
    console.error(`[Tokens] DB error for ${providerId}:`, e);
  }

  // 2. If we have a refresh token, try to get a fresh access token via Token Vault
  // This ensures we always have the most current/valid token if the service supports it.
  const isTokenVaultSupported = providerId === "google-oauth2" || providerId === "slack" || providerId === "github";
  if (row?.refreshToken && isTokenVaultSupported) {
    try {
      console.log(`[Tokens] Attempting Token Vault refresh for ${providerId}`);
      const freshToken = await exchangeForServiceToken(row.refreshToken, providerId);
      
      // Optistically update the DB so the next call is faster
      db.update(account)
        .set({ accessToken: freshToken, updatedAt: new Date() })
        .where(eq(account.id, row.id))
        .catch(err => console.error("[Tokens] DB update failed:", err));

      return freshToken;
    } catch (e) {
      console.warn(`[Tokens] Token Vault refresh failed for ${providerId}:`, e);
    }
  }

  // 3. Fallback: Return existing DB token if it's still usable (and we haven't refreshed)
  if (row?.accessToken) return row.accessToken;

  // 4. Final Fallback: Auth0 Management API (for primary/linked accounts)
  try {
    const domain = process.env.AUTH0_DOMAIN!;
    const mgmtToken = await getManagementToken();
    const resp = await fetch(
      `https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${mgmtToken}` } }
    );

    if (resp.ok) {
      const user = await resp.json();
      const identity = user.identities?.find((i: any) => i.provider === providerId || i.connection === providerId);
      if (identity?.access_token) return identity.access_token;
    }
  } catch (e) {
    console.error(`[Tokens] Auth0 Mgmt API error for ${providerId}:`, e);
  }

  return null;
}

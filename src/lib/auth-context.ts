/**
 * Shared helper for API routes to get the GitHub token.
 * Gets the GitHub access token directly from the Auth0 Management API
 * (stored on the user's identity when they log in via GitHub).
 * No Token Vault, no Actions needed.
 */

import { auth0 } from "./auth0";

export interface AuthContext {
  userId: string;
  userName: string;
  userImage?: string;
  githubToken: string;
}

// Cache the management token (it lasts 24h)
let cachedMgmtToken: { token: string; expiresAt: number } | null = null;

async function getManagementToken(): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
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

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[AuthContext] Failed to get Management API token:", err);
    throw new Error("Failed to get Management API token");
  }

  const data = await resp.json();
  cachedMgmtToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function getGitHubTokenFromIdentity(userId: string): Promise<string | null> {
  const domain = process.env.AUTH0_DOMAIN!;
  const mgmtToken = await getManagementToken();

  const resp = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${mgmtToken}` } }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[AuthContext] Failed to fetch user from Management API:", err);
    return null;
  }

  const user = await resp.json();
  const github = user.identities?.find((i: any) => i.provider === "github");
  return github?.access_token || null;
}

/**
 * Get the authenticated user's context including the GitHub token.
 * Returns null if not authenticated.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth0.getSession();
  if (!session?.user) return null;

  const githubToken = await getGitHubTokenFromIdentity(session.user.sub);

  if (!githubToken) {
    console.error("[AuthContext] No GitHub token found for user:", session.user.sub);
    return null;
  }

  return {
    userId: session.user.sub,
    userName: session.user.name || session.user.nickname || "User",
    userImage: session.user.picture,
    githubToken,
  };
}

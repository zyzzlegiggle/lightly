/**
 * Shared helper for API routes to get the GitHub token from Token Vault.
 * Handles session retrieval + token exchange in one call.
 */

import { auth0 } from "./auth0";
import { exchangeForGitHubToken } from "./token-vault";

export interface AuthContext {
  userId: string;
  userName: string;
  userImage?: string;
  githubToken: string;
}

/**
 * Get the authenticated user's context including a fresh GitHub token.
 * Returns null if not authenticated.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth0.getSession();
  if (!session?.user) return null;

  // Get the Auth0 access token for token exchange
  const tokenSet = await auth0.getAccessToken();

  if (!tokenSet?.token) {
    console.error("[AuthContext] No access token available in session");
    return null;
  }

  // Exchange Auth0 token for GitHub token via Token Vault
  const githubToken = await exchangeForGitHubToken(tokenSet.token);

  return {
    userId: session.user.sub,
    userName: session.user.name || session.user.nickname || "User",
    userImage: session.user.picture,
    githubToken,
  };
}

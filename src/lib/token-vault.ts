/**
 * Token Vault helper — exchanges an Auth0 access token for a
 * short-lived GitHub access token stored in the Token Vault.
 *
 * Uses the federated connection access token exchange grant type:
 * POST /oauth/token with grant_type=urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID!;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET!;

/**
 * Exchange an Auth0 access token for a GitHub access token via Token Vault.
 *
 * @param auth0AccessToken - The user's Auth0 access token (from session)
 * @param connection - The Auth0 connection name for GitHub (default: "github")
 * @returns The short-lived GitHub access token
 */
export async function exchangeForGitHubToken(
  auth0AccessToken: string,
  connection: string = "github"
): Promise<string> {
  const url = `https://${AUTH0_DOMAIN}/oauth/token`;

  const body = new URLSearchParams({
    grant_type:
      "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
    subject_token: auth0AccessToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    requested_token_type:
      "urn:auth0:params:oauth:token-type:federated-connection-access-token",
    connection,
    client_id: AUTH0_CLIENT_ID,
    client_secret: AUTH0_CLIENT_SECRET,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error("[TokenVault] Exchange failed:", resp.status, errBody);
    throw new Error(`Token Vault exchange failed: ${resp.status}`);
  }

  const data = await resp.json();
  return data.access_token;
}

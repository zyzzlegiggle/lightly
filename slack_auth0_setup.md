# Slack Auth0 Setup Guide

If you're getting an error like "cant read access_token" or "slack_no_token" during the connection flow, it's likely due to one of three missing configurations in your Auth0 dashboard.

To fix this, follow these steps to ensure your Auth0 application has permission to fetch and store Slack tokens.

---

### 1. Create a Slack App for OAuth
Go to the [Slack App Dashboard](https://api.slack.com/apps):

1.  **Create New App** > From scratch.
2.  **Redirect URLs**: Add your Auth0 domain callback URL.
    *   *Example: `https://YOUR_TENANT.us.auth0.com/login/callback`*
3.  **Permissions (Scopes)**: Add the following **User Token Scopes** (not Bot scopes):
    *   `openid`, `profile`, `email`, `team:read`
4.  **Install to Workspace**: Install the app to your own workspace to generate the Client ID and Secret.
5.  **Copy the Client ID and Client Secret** for the next step.

---

### 2. Configure Slack Social Connection in Auth0
In your [Auth0 Dashboard](https://manage.auth0.com/), navigate to **Authentication > Social**:

1.  **Create Connection** and select **Slack**.
2.  **Name**: It is recommended to use `sign-in-with-slack` (as used in the code).
3.  **Client ID & Client Secret**: Paste the credentials from your Slack app.
4.  **Scopes**: Ensure `openid profile email team:read` are checked.
5.  **Applications Tab**: Ensure your "Regular Web Application" toggle is **ON** for this connection.

---

### 3. Enable Token Exchange (CRITICAL)
The application uses Auth0's "Federated Token Exchange" to retrieve the Slack token from Auth0's vault.

1.  In Auth0, go to **Applications > [Your App Name] > Settings**.
2.  Scroll down to **Advanced Settings > Grant Types**.
3.  Check the box for **Token Exchange**.
4.  Click **Save Changes**.

---

### 4. Configure Management API Permissions (Optional Fallback)
If the Token Exchange fails, the app attempts to use the Auth0 Management API to read your user identity and extract the `access_token` from there.

1.  Go to **Applications > API > Auth0 Management API**.
2.  Click the **Machine to Machine Applications** tab.
3.  Find your application and ensure it is **Authorized**.
4.  Expand it and ensure these scopes are checked:
    *   `read:users`
    *   `read:user_idp_tokens`
5.  Click **Update**.

---

### 5. Troubleshooting: "cant read access_token"
If you are seeing a literal JavaScript error `Cannot read properties of undefined (reading 'access_token')`, it usually happens because:

1.  **Auth0 Domain/Client ID mismatch**: Ensure `.env` matches the application you configured in Auth0.
2.  **Management API Setup**: Make sure you have `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET` in your `.env` file. These are used to get a management token to fetch your Slack identity.
3.  **Connection Name**: The code expects the Slack connection in Auth0 to be named exactly `sign-in-with-slack`. If you named it `slack`, update line 151 in `src/app/api/auth/slack/callback/route.ts` and line 39 in `src/app/api/auth/slack/route.ts`.

```typescript
// Example: If your connection is named "slack", update this:
connection: "slack", 
```

---

### 6. Verify .env for Slack Callback
Ensure your `NEXT_PUBLIC_APP_URL` is set correctly in `.env` so Slack knows where to return after authentication:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

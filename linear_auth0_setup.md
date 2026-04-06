# Linear Integration — Auth0 Setup Guide

> Updated for the current Auth0 Dashboard (2026). The legacy "Custom Social Connections" extension has been **deprecated**. Use the native **Create Custom** option under Authentication → Social instead.

> **Note:** As of April 2026, Linear OAuth applications use **short-lived access tokens with refresh tokens**. Your app should handle token refreshing.

---

## Overview

```
User clicks "Connect Linear"
  → /api/auth/connect?connection=linear
  → Auth0 redirects user to Linear OAuth
  → User authorizes in Linear
  → Linear redirects to Auth0 /login/callback
  → Auth0 redirects to /api/auth/connect/callback
  → Callback extracts Linear token via Management API → stores in DB
  → On project creation: auto-creates a dedicated Linear Project
```

---

## Step 1 — Create a Linear OAuth Application

1. Go to **https://linear.app** and log in.
2. Click your **workspace name** (top-left) → **Settings**.
3. In the left sidebar under **Account**, click **API**.
4. Scroll down to **OAuth Applications** → click **Create new OAuth Application**.

### Fill in the fields:

| Field | Value |
|-------|-------|
| **Application name** | `Lightly` |
| **Description** | `AI workspace assistant` |
| **Developer URL** | `http://localhost:3000` |
| **Callback URLs** | `https://<YOUR_AUTH0_DOMAIN>/login/callback` |

Example callback URL: `https://dev-abc123.us.auth0.com/login/callback`

> Only the Auth0 domain callback goes here. NOT your app's `localhost` URL.

### Scopes
Select:
- ✅ `read`
- ✅ `write`

### Save & Copy Credentials
After creating, copy:
- **Client ID**
- **Client Secret**

Store these securely — you'll need them for Auth0.

---

## Step 2 — Create Auth0 Custom Social Connection (Linear)

Auth0 does NOT have a built-in Linear connection. You must create a custom one natively.

1. Go to [Auth0 Dashboard](https://manage.auth0.com) → **Authentication** → **Social**.
2. Click **Create Connection**.
3. Scroll to the **bottom** of the provider list and click **Create Custom**.

### Fill in the connection form:

| Field | Value |
|-------|-------|
| **Name** | `linear` |
| **Authorization URL** | `https://linear.app/oauth/authorize` |
| **Token URL** | `https://api.linear.app/oauth/token` |
| **Scope** | `read write` |
| **Client ID** | Your Linear Client ID from Step 1 |
| **Client Secret** | Your Linear Client Secret from Step 1 |

> ⚠️ The name **must** be `linear`. The code uses `connection: "linear"` in `src/app/api/auth/connect/route.ts` line 67.

### Fetch User Profile Script

Paste this into the script editor:

```javascript
function(accessToken, ctx, cb) {
  request.post({
    url: 'https://api.linear.app/graphql',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: '{ viewer { id name email avatarUrl } }'
    })
  }, function(err, resp, body) {
    if (err) return cb(err);
    var parsed;
    try { parsed = JSON.parse(body); } catch(e) { return cb(e); }
    if (resp.statusCode !== 200) {
      return cb(new Error('Linear API returned ' + resp.statusCode + ': ' + body));
    }
    if (!parsed.data || !parsed.data.viewer) {
      return cb(new Error('Linear did not return viewer data: ' + body));
    }
    var user = parsed.data.viewer;
    cb(null, {
      user_id: user.id,
      name: user.name || 'Linear User',
      email: user.email,
      picture: user.avatarUrl || ''
    });
  });
}
```

### Enable for Your App
1. After saving, click the **Applications** tab on the connection page.
2. Toggle **ON** for your Lightly application.

---

## Step 3 — Allowed Callback URLs

Go to **Applications** → **[Your App]** → **Settings**.

In **Allowed Callback URLs**, add (if not already present):
```
http://localhost:3000/api/auth/connect/callback, http://localhost:3000/api/auth/callback
```

Click **Save Changes**.

> Linear uses the shared `/api/auth/connect/callback` route (same as Notion and Google).

---

## Step 4 — Enable Token Exchange Grant

1. Go to **Applications** → **[Your App]** → **Settings**.
2. Scroll to **Advanced Settings** → **Grant Types**.
3. Check **Token Exchange**.
4. Click **Save Changes**.

---

## Step 5 — Management API Permissions

1. Go to **Applications** → **APIs** → **Auth0 Management API**.
2. Click the **Machine to Machine Applications** tab.
3. Find your Lightly app → toggle **Authorized** (ON).
4. Expand and check:
   - ✅ `read:users`
   - ✅ `read:user_idp_tokens`
5. Click **Update**.

---

## Step 6 — Verify `.env`

```bash
AUTH0_SECRET=<random-string-at-least-32-chars>
AUTH0_DOMAIN=dev-abc123.us.auth0.com
AUTH0_CLIENT_ID=<your-auth0-client-id>
AUTH0_CLIENT_SECRET=<your-auth0-client-secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 7 — Test

1. Run `npm run dev`.
2. Log in → go to **Settings** → click **Connect Linear**.
3. Authorize in Linear.
4. Check terminal for `[Connect Callback] Got provider token via Management API for linear: ✓`.
5. You should land back on your app with `?connected=linear` in the URL.

---

## How Auto-Project Creation Works

When a user creates a new project in Lightly and Linear is connected:

1. `POST /api/projects` checks for a stored Linear token.
2. Fetches the user's first Linear team via GraphQL.
3. Creates a dedicated Linear project named after the Lightly project.
4. Stores `linearProjectId` and `linearTeamId` in the database.
5. The AI agent then scopes all issue creation to this project/team.

This logic is in `src/lib/linear-service.ts` → `createLinearProject()`.

---

## Note: Short-Lived Tokens (April 2026)

As of April 2026, Linear has migrated all OAuth apps to short-lived access tokens with refresh tokens. This means:

- The initial `access_token` from the callback may expire quickly.
- Your app should handle refreshing tokens when API calls return `401`.
- The `refresh_token` stored by Auth0 (via the Token Vault or the connect callback) can be used to get a fresh access token.

If you notice Linear API calls failing after some time, you may need to add token refresh logic to the `linear_service.py` backend or the `connect/callback` route.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `linear_denied` redirect | User cancelled, or Callback URL mismatch in Linear app settings. |
| `linear_no_token` redirect | Management API permissions missing (Step 5). |
| Linear auto-logs in without account picker | Change Authorization URL to `https://linear.app/oauth/authorize?prompt=select_account` in the custom connection settings. |
| `viewer` returns null | Access token is invalid or expired. Check Client ID/Secret are correct. |
| Issues not scoped to project | `linearProjectId` is null — go to the Linear tab in workspace to initialize manually. |
| `401` from Linear API after some time | Token expired. See "Short-Lived Tokens" note above. |

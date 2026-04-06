# Slack Integration — Auth0 Setup Guide

> Updated for the current Auth0 Dashboard (2026). The legacy "Custom Social Connections" extension has been **deprecated**. Use the native **Create Custom** option under Authentication → Social instead.

---

## Overview

```
User clicks "Connect Slack"
  → /api/auth/slack (builds Auth0 /authorize URL)
  → Auth0 redirects user to Slack
  → User authorizes in Slack
  → Slack redirects to Auth0 /login/callback
  → Auth0 redirects to /api/auth/slack/callback
  → Callback extracts Slack token via Management API → stores in DB
```

---

## Step 1 — Create a Slack App

1. Go to **https://api.slack.com/apps** → click **Create New App** → **From scratch**.
2. Give it a name (e.g. `Lightly`) and pick your development workspace.

### Add OAuth Redirect URL
Go to **OAuth & Permissions** in the left sidebar:
- Under **Redirect URLs**, click **Add New Redirect URL**:
  ```
  https://<YOUR_AUTH0_DOMAIN>/login/callback
  ```
  Example: `https://dev-abc123.us.auth0.com/login/callback`
  
  > Only the Auth0 domain goes here. NOT your `localhost` URL.

### Add User Token Scopes
Still in **OAuth & Permissions**, scroll to **User Token Scopes** and add:

| Scope | Why |
|-------|-----|
| `openid` | Required for identity |
| `profile` | User profile |
| `email` | User email |
| `team:read` | Read workspace name/ID |
| `channels:read` | List channels (for sending messages) |
| `chat:write` | Post messages |

> ⚠️ Add these under **User Token Scopes**, NOT Bot Token Scopes.

### Install & Copy Credentials
1. Click **Install to Workspace** and authorize.
2. Go to **Basic Information** → copy the **Client ID** and **Client Secret**.

---

## Step 2 — Create Auth0 Social Connection (Slack)

Auth0 has a built-in "Slack" connection, but it only supports identity scopes (`openid profile email`). Since we need `channels:read` and `chat:write`, we'll use a **Custom Social Connection** instead.

1. Go to [Auth0 Dashboard](https://manage.auth0.com) → **Authentication** → **Social**.
2. Click **Create Connection**.
3. Scroll to the **bottom** of the provider list and click **Create Custom**.

### Fill in the connection form:

| Field | Value |
|-------|-------|
| **Name** | `sign-in-with-slack` |
| **Authorization URL** | `https://slack.com/openid/connect/authorize` |
| **Token URL** | `https://slack.com/api/openid.connect.token` |
| **Scope** | `openid profile email team:read channels:read chat:write` |
| **Client ID** | Your Slack Client ID from Step 1 |
| **Client Secret** | Your Slack Client Secret from Step 1 |

> ⚠️ The name **must** be `sign-in-with-slack`. The code references this name in `src/app/api/auth/slack/route.ts` line 39.

### Fetch User Profile Script

Paste this into the script editor:

```javascript
function(accessToken, ctx, cb) {
  request.get({
    url: 'https://slack.com/api/openid.connect.userInfo',
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  }, function(err, resp, body) {
    if (err) return cb(err);
    var profile;
    try { profile = JSON.parse(body); } catch(e) { return cb(e); }
    if (!profile.ok) return cb(new Error('Slack userInfo failed: ' + (profile.error || 'unknown')));
    cb(null, {
      user_id: profile.sub,
      name: profile.name || profile.given_name || 'Slack User',
      email: profile.email,
      picture: profile.picture || ''
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

In **Allowed Callback URLs**, add:
```
http://localhost:3000/api/auth/slack/callback, http://localhost:3000/api/auth/callback
```

In **Allowed Logout URLs**, add:
```
http://localhost:3000
```

Click **Save Changes**.

---

## Step 4 — Enable Token Exchange Grant

1. Still in **Applications** → **[Your App]** → **Settings**.
2. Scroll to **Advanced Settings** → **Grant Types**.
3. Check **Token Exchange**.
4. Click **Save Changes**.

---

## Step 5 — Management API Permissions (CRITICAL)

This is the most common failure point. The callback route uses the Management API to extract the upstream Slack token from `identities[].access_token`.

1. Go to **Applications** → **APIs** → **Auth0 Management API**.
2. Click the **Machine to Machine Applications** tab.
3. Find your Lightly app → toggle **Authorized** (ON).
4. Expand it and check:
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
2. Log in → go to **Settings** → click **Connect Slack**.
3. Authorize in Slack.
4. Check terminal for `[Slack Callback] Got Slack token via Management API ✓`.
5. You should land on `/settings?connected=slack&team=YourWorkspace`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `invalid_scope` error | Do NOT include `offline_access`. Only use Slack-native scopes. |
| `slack_no_token` | Management API permissions missing (Step 5). |
| `slack_denied` | Callback URL mismatch or user cancelled. Check Step 3. |
| Connection name mismatch | Update `connection: "sign-in-with-slack"` in `src/app/api/auth/slack/route.ts` line 39 and `callback/route.ts` line 151. |

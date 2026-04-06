# Notion Integration — Auth0 Setup Guide

> Updated for the current Auth0 Dashboard (2026). The legacy "Custom Social Connections" extension has been **deprecated**. Use the native **Create Custom** option under Authentication → Social instead.

---

## Overview

```
User clicks "Connect Notion"
  → /api/auth/connect?connection=notion
  → Auth0 redirects user to Notion OAuth
  → User authorizes & selects pages to share
  → Notion redirects to Auth0 /login/callback
  → Auth0 redirects to /api/auth/connect/callback
  → Callback extracts Notion token via Management API → stores in DB
```

---

## Step 1 — Create a Notion Public Integration

1. Go to **https://www.notion.so/profile/integrations** (or **https://www.notion.so/my-integrations**).
2. Click **New integration**.

### Basic Information
| Field | Value |
|-------|-------|
| **Name** | `Lightly` |
| **Associated workspace** | Select your workspace |
| **Type** | **Public** ← CRITICAL |

> ⚠️ You MUST select **Public**. An "Internal" integration cannot be used with OAuth by external users. The "Public" option reveals the OAuth configuration section.

### Capabilities
Check all that apply:
- ✅ Read content
- ✅ Update content  
- ✅ Insert content

### OAuth Domain & URIs
After selecting "Public", the OAuth section appears:

| Field | Value |
|-------|-------|
| **Redirect URIs** | `https://<YOUR_AUTH0_DOMAIN>/login/callback` |
| **Website** | `http://localhost:3000` (or your production URL) |
| **Privacy policy URL** | Any URL (required, can be a placeholder for dev) |
| **Terms of use URL** | Any URL (required, can be a placeholder for dev) |

Example redirect URI: `https://dev-abc123.us.auth0.com/login/callback`

### Copy Credentials
After saving, find and copy:
- **OAuth Client ID**
- **OAuth Client Secret**

---

## Step 2 — Create Auth0 Custom Social Connection (Notion)

Auth0 does NOT have a built-in Notion connection. You must create a custom one natively.

1. Go to [Auth0 Dashboard](https://manage.auth0.com) → **Authentication** → **Social**.
2. Click **Create Connection**.
3. Scroll to the **bottom** of the provider list and click **Create Custom**.

### Fill in the connection form:

| Field | Value |
|-------|-------|
| **Name** | `notion` |
| **Authorization URL** | `https://api.notion.com/v1/oauth/authorize` |
| **Token URL** | `https://api.notion.com/v1/oauth/token` |
| **Scope** | *(leave empty — Notion controls permissions via integration capabilities, not OAuth scopes)* |
| **Client ID** | Your Notion OAuth Client ID from Step 1 |
| **Client Secret** | Your Notion OAuth Client Secret from Step 1 |

> ⚠️ The name **must** be `notion`. The code uses `connection: "notion"` in the connect route.

### Token Endpoint Authentication

**IMPORTANT:** Notion requires **HTTP Basic Authentication** for the token exchange (Base64-encoded `client_id:client_secret` in the `Authorization` header). If your Auth0 connection settings have a dropdown for **Token Endpoint Authentication Method**, set it to:

```
HTTP Basic Authentication
```

If it defaults to `client_secret_post`, the Notion token exchange will fail with `401 Unauthorized`.

### Fetch User Profile Script

Paste this into the script editor:

```javascript
function(accessToken, ctx, cb) {
  request.get({
    url: 'https://api.notion.com/v1/users/me',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    }
  }, function(err, resp, body) {
    if (err) return cb(err);
    var parsed;
    try { parsed = JSON.parse(body); } catch(e) { return cb(e); }
    if (resp.statusCode !== 200) {
      return cb(new Error('Notion API error ' + resp.statusCode + ': ' + body));
    }
    var email = (parsed.type === 'person' && parsed.person && parsed.person.email)
      ? parsed.person.email
      : (parsed.id + '@notion.user');
    cb(null, {
      user_id: parsed.id,
      name: parsed.name || 'Notion User',
      email: email,
      picture: parsed.avatar_url || ''
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

> Notion uses the shared `/api/auth/connect/callback` route (not a dedicated `/notion/callback`).

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
2. Log in → go to **Settings** → click **Connect Notion**.
3. Notion will ask you to **select which pages to share** with the integration. You must share at least one page.
4. Check terminal for `[Connect Callback] Got provider token via Management API for notion: ✓`.
5. You should land back on your app with `?connected=notion` in the URL.

### Page Sharing Note
The auto-creation of project-specific Notion pages requires a parent page. The code (`src/lib/notion-service.ts`) searches for a page named "Projects" first, then falls back to the first shared page. Make sure the user shares a suitable parent page during authorization.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401 Unauthorized` during token exchange | Token Endpoint Auth is wrong. Must be **HTTP Basic Auth**, not `client_secret_post`. |
| `notion_denied` redirect | User cancelled, or Redirect URI mismatch in Notion integration settings. |
| `notion_no_token` redirect | Management API permissions missing (Step 5). |
| "No accessible parent page found" | User didn't share any pages during Notion OAuth. Reconnect and select pages. |
| `fetch_user_profile` error in Auth0 logs | Profile script error. Check the `Notion-Version` header is current. |

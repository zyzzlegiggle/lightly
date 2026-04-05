# Linear Auth0 Setup Guide

If your Linear integration is automatically connecting to a previous account without letting you choose (or "typing your own"), it's because the Linear OAuth flow sees an active session in your browser.

To fix this and re-run the setup, follow these steps:

### 1. Create/Update the Linear OAuth Application
Go to your [Linear Developer Settings](https://linear.app/settings/api/applications):

*   **App Name**: `Lightly` (or your preferred name)
*   **Redirect URI**: `https://<YOUR_AUTH0_DOMAIN>/login/callback`
    *   *Example: `https://dev-brr00af5yadyj4r7.us.auth0.com/login/callback`*
*   **Copy the Client ID and Client Secret** — you'll need these for Auth0.

---

### 2. Configure Auth0 Custom Social Connection
In your [Auth0 Dashboard](https://manage.auth0.com/), navigate to **Authentication > Extensions**, and check if you have "Custom Social Connections" installed. If not, you can create a connection manually via the API or Extension.

**Fill in these details for the Linear connection:**

*   **Name**: `linear`
*   **Authorization URL**: `https://linear.app/oauth/authorize?prompt=select_account`
    *   > [!IMPORTANT]
    *   The `?prompt=select_account` suffix is what forces Linear to show the account switcher instead of auto-logging you in.
*   **Token URL**: `https://linear.app/oauth/token`
*   **Scope**: `read,write`
*   **Client ID**: `[Your Linear Client ID]`
*   **Client Secret**: `[Your Linear Client Secret]`

#### 3. Fetch Profile Script (JavaScript)
Copy and paste this into the **Fetch Profile Script** section in Auth0. This allows Auth0 to identify which Linear user is connecting.

```javascript
function profile(accessToken, ctx, cb) {
  const request = require('request');

  request.post({
    url: 'https://api.linear.app/graphql',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    json: {
      query: `{
        viewer {
          id
          name
          email
          avatarUrl
        }
      }`
    }
  }, (err, resp, body) => {
    if (err) return cb(err);
    if (resp.statusCode !== 200) return cb(new Error('Linear API returned ' + resp.statusCode));
    if (!body.data || !body.data.viewer) return cb(new Error('Failed to fetch Linear viewer data'));

    const user = body.data.viewer;
    cb(null, {
      user_id: user.id,
      name: user.name,
      email: user.email,
      picture: user.avatarUrl
    });
  });
}
```

---

### 4. Code Implementation Check
Ensure your connection flow in `src/app/api/auth/connect/route.ts` specifies the `linear` connection:

```typescript
// ... existing code
} else if (connection === "linear") {
    // For Linear API access
    params.append("connection_scope", "read,write");
}
// ...
```

### 5. Final Step: Clear Browser Cookies (Optional)
If it still auto-logs you in, try visiting [linear.app](https://linear.app) and logging out manually once. Then try the "Connect Linear" button in your app again. The `?prompt=select_account` above should solve it for good though.

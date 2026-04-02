import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email offline_access",
  },
  beforeSessionSaved: async (session, idToken) => {
    // The SDK automatically maps claims from the ID token to session.user.
    // If you have an Auth0 Action that adds 'identities' to the ID token,
    // it will be available here and in the frontend.
    return session;
  },
  routes: {
    login: "/api/auth/login",
    callback: "/api/auth/callback",
    logout: "/api/auth/logout",
  },
});

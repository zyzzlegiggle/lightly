import { redirect } from "next/navigation";

/**
 * Auth page now redirects to Auth0's Universal Login.
 * Auth0 handles the entire login flow — no custom UI needed.
 * The /auth/login route is handled by the Auth0 SDK middleware.
 */
export default function AuthPage() {
    redirect("/api/auth/login");
}

import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

/**
 * Custom logout handler that also clears all connected service tokens (Gmail, Slack, GitHub, etc.)
 * from the local database before redirecting to Auth0 logout.
 * 
 * This ensures "Sign Out" is a complete reset of the user's workspace connections.
 */
export async function GET(req: Request) {
  const session = await auth0.getSession();
  
  if (session?.user) {
    const userId = session.user.sub;
    console.log(`[Logout] Cleaning up connected services for user ${userId}...`);
    
    try {
      // Clear all connected service accounts from our DB
      await db.delete(account).where(eq(account.userId, userId));
    } catch (error) {
      console.error("[Logout] DB Cleanup failed:", error);
    }
  }

  // Proceed to standard Auth0 logout
  // This will clear the Auth0 session and redirect back home
  return redirect("/api/auth/logout");
}

import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export async function GET() {
  const session = await auth0.getSession();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  
  if (!session?.user) {
    return Response.redirect(new URL("/api/auth/login", baseUrl).toString());
  }

  const userId = session.user.sub;
  
  // Delete all accounts for this user (Disconnect all linked services)
  await db.delete(account)
    .where(eq(account.userId, userId));

  // Redirect to the actual Auth0 logout to clear the session
  return Response.redirect(new URL("/api/auth/logout", baseUrl).toString());
}

export async function DELETE() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;
  
  await db.delete(account)
    .where(eq(account.userId, userId));

  return Response.json({ success: true });
}

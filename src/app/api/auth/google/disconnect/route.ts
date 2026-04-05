import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export async function DELETE() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;
  
  // Delete Google account record
  await db.delete(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google-oauth2")));

  return Response.json({ success: true });
}

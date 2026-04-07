import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

/**
 * Disconnects a Notion account for the current user.
 */
export async function DELETE(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;

  try {
    await db
      .delete(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "notion")));

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Disconnect] Failed to disconnect Notion:", err);
    return Response.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}

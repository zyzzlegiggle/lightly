import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

/**
 * Disconnects a Linear account for the current user.
 */
export async function DELETE(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;

  try {
    // Linear provider ID is usually 'linear' as passed to /api/auth/connect?connection=linear
    await db
      .delete(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "linear")));

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Disconnect] Failed to disconnect Linear:", err);
    return Response.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}

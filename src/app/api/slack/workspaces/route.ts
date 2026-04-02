import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET: List all connected Slack workspaces for the current user.
 */
export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await db.query.account.findMany({
    where: and(
      eq(account.userId, session.user.sub),
      eq(account.providerId, "slack")
    ),
  });

  return Response.json({
    workspaces: workspaces.map((w) => ({
      id: w.id,
      teamId: w.accountId,
      teamName: w.idToken || "Slack Workspace",
      connectedAt: w.createdAt,
    })),
  });
}

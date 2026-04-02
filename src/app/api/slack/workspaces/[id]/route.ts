import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

/**
 * DELETE: Disconnect a Slack workspace.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership before deleting
  const row = await db.query.account.findFirst({
    where: and(
      eq(account.id, id),
      eq(account.userId, session.user.sub),
      eq(account.providerId, "slack")
    ),
  });

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(account).where(eq(account.id, id));

  return Response.json({ ok: true });
}

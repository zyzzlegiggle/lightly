import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.sub;

  // Only delete if it belongs to the user
  const deleted = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .returning();

  if (deleted.length === 0) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Optionally destroy the Droplet to save cost
  const doAppId = deleted[0].doAppId;
  if (doAppId && !doAppId.startsWith("mock-")) {
    try {
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      await fetch(`${backendUrl}/api/droplets/${doAppId}/destroy`, { method: "DELETE" });
    } catch { /* best effort */ }
  }

  return Response.json({ ok: true });
}

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Only delete if it belongs to the user
  const deleted = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .returning();

  if (deleted.length === 0) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Optionally destroy the Droplet to save cost
  const doAppId = deleted[0].doAppId;
  if (doAppId && !doAppId.startsWith("mock-")) {
    try {
      await fetch(`http://localhost:8000/api/droplets/${doAppId}/destroy`, { method: "DELETE" });
    } catch { /* best effort */ }
  }

  return Response.json({ ok: true });
}

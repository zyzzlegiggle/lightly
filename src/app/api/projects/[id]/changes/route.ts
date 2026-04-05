import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getAuthContextResult();
  if (!result.ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, result.ctx.userId)),
  });

  if (!dbProject) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ changes: dbProject.pendingChanges || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getAuthContextResult();
  if (!result.ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { changes } = await req.json();

  await db.update(project)
    .set({ pendingChanges: changes, updatedAt: new Date() })
    .where(and(eq(project.id, id), eq(project.userId, result.ctx.userId)));

  return Response.json({ ok: true });
}

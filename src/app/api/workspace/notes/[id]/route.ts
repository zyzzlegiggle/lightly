import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { workspaceNote } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const { id } = await params;
  const body = await req.json();
  const { title, content } = body;

  const updates: any = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;

  await db.update(workspaceNote)
    .set(updates)
    .where(and(eq(workspaceNote.id, id), eq(workspaceNote.userId, userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const { id } = await params;

  await db.delete(workspaceNote)
    .where(and(eq(workspaceNote.id, id), eq(workspaceNote.userId, userId)));

  return NextResponse.json({ ok: true });
}

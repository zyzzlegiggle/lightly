import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { workspaceEvent } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const { id } = await params;
  const body = await req.json();

  const updates: any = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.startAt !== undefined) updates.startAt = new Date(body.startAt);
  if (body.endAt !== undefined) updates.endAt = new Date(body.endAt);
  if (body.allDay !== undefined) updates.allDay = body.allDay;
  if (body.color !== undefined) updates.color = body.color;

  await db.update(workspaceEvent)
    .set(updates)
    .where(and(eq(workspaceEvent.id, id), eq(workspaceEvent.userId, userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const { id } = await params;

  await db.delete(workspaceEvent)
    .where(and(eq(workspaceEvent.id, id), eq(workspaceEvent.userId, userId)));

  return NextResponse.json({ ok: true });
}

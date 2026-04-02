import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { workspaceEvent } from "@/lib/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let events;
  if (from && to) {
    events = await db.query.workspaceEvent.findMany({
      where: and(
        eq(workspaceEvent.userId, userId),
        gte(workspaceEvent.startAt, new Date(from)),
        lte(workspaceEvent.startAt, new Date(to))
      ),
      orderBy: [workspaceEvent.startAt],
    });
  } else {
    events = await db.query.workspaceEvent.findMany({
      where: eq(workspaceEvent.userId, userId),
      orderBy: [desc(workspaceEvent.startAt)],
    });
  }

  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const body = await req.json();
  const { title, description, startAt, endAt, allDay = false, color = "zinc" } = body;

  if (!title || !startAt) {
    return NextResponse.json({ error: "title and startAt are required" }, { status: 400 });
  }

  const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await db.insert(workspaceEvent).values({
    id,
    userId,
    title,
    description: description || null,
    startAt: new Date(startAt),
    endAt: endAt ? new Date(endAt) : null,
    allDay,
    color,
  });

  const event = await db.query.workspaceEvent.findFirst({ where: eq(workspaceEvent.id, id) });
  return NextResponse.json({ event }, { status: 201 });
}

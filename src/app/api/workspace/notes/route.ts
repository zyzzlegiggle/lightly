import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { workspaceNote } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const notes = await db.query.workspaceNote.findMany({
    where: eq(workspaceNote.userId, userId),
    orderBy: [desc(workspaceNote.updatedAt)],
  });

  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub;
  const body = await req.json();
  const { title = "Untitled", content = "" } = body;

  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await db.insert(workspaceNote).values({ id, userId, title, content, createdAt: now, updatedAt: now });
  const note = await db.query.workspaceNote.findFirst({ where: eq(workspaceNote.id, id) });

  return NextResponse.json({ note }, { status: 201 });
}

import { auth0 } from "@/lib/auth0";
import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project, account } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getNotionToken, createNotionProjectPage } from "@/lib/notion-service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  const result = await getAuthContextResult();

  if (!result.ok || !session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = result.ctx.userId;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, userId)),
  });

  if (!dbProject) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const notionToken = await getNotionToken(userId);

  return Response.json({
    connected: !!notionToken,
    pageId: dbProject.notionPageId,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  const result = await getAuthContextResult();

  if (!result.ok || !session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = result.ctx.userId;
  const { action } = await req.json();

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, userId)),
  });

  if (!dbProject) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (action === "init") {
    const notionToken = await getNotionToken(userId);
    if (!notionToken) {
      return Response.json({ error: "Notion not connected" }, { status: 400 });
    }

    const pageId = await createNotionProjectPage(notionToken, "Dedicated Project Page");
    if (pageId) {
      await db.update(project)
        .set({ notionPageId: pageId })
        .where(eq(project.id, id));
      return Response.json({ success: true, pageId });
    }
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

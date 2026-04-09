import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.sub;
  const body = await req.json();

  const { slackChannelId, notionPageId, linearProjectId, linearTeamId } = body;

  try {
    const updateData: any = {};
    if (slackChannelId !== undefined) updateData.slackChannelId = slackChannelId;
    if (notionPageId !== undefined) updateData.notionPageId = notionPageId;
    if (linearProjectId !== undefined) updateData.linearProjectId = linearProjectId;
    if (linearTeamId !== undefined) updateData.linearTeamId = linearTeamId;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await db.update(project)
      .set(updateData)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning();

    if (updated.length === 0) {
      return Response.json({ error: "Project not found or unauthorized" }, { status: 404 });
    }

    return Response.json({ success: true, project: updated[0] });
  } catch (err) {
    console.error("[Update Context Error]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

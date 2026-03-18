import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    // Validate project belongs to user
    const dbProject = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.userId, session.user.id))
    });

    if (!dbProject) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (!dbProject.doAppId) {
      return Response.json({ phase: "ERROR", logs: "No DO App ID found for this project." });
    }

    // Call Python FastAPI backend to get status
    let pyResp;
    try {
      pyResp = await fetch(`http://localhost:8000/api/projects/${dbProject.doAppId}/status`);
    } catch {
      // FastAPI backend unreachable — if we already have a saved URL, return ACTIVE
      if (dbProject.lastPreviewUrl) {
        return Response.json({ phase: "ACTIVE", logs: "", liveUrl: dbProject.lastPreviewUrl });
      }
      return Response.json({ phase: "UNKNOWN", logs: "Waiting for build status...", liveUrl: null });
    }

    if (!pyResp.ok) {
      return Response.json({ phase: "UNKNOWN", logs: "Waiting for build status...", liveUrl: dbProject.lastPreviewUrl });
    }

    const statusData = await pyResp.json();
    
    // Resolve the best available liveUrl: prefer backend response, fallback to DB
    const resolvedLiveUrl = statusData.liveUrl || dbProject.lastPreviewUrl || null;
    
    // Persist liveUrl to DB if we got one from the backend and it's new
    if (resolvedLiveUrl && resolvedLiveUrl !== dbProject.lastPreviewUrl) {
      await db.update(project)
        .set({ lastPreviewUrl: resolvedLiveUrl, updatedAt: new Date() })
        .where(eq(project.id, id));
    }

    return Response.json({
        phase: statusData.phase,
        logs: statusData.logs,
        liveUrl: resolvedLiveUrl,
    });

  } catch (err: any) {
    console.error("Error fetching status:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.sub;
    
    // Validate project belongs to user
    const dbProject = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.userId, userId))
    });

    if (!dbProject) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (!dbProject.doAppId) {
      return Response.json({ phase: "ERROR", logs: "Sandbox not initialized. Try removing and re-linking this project." });
    }

    // Call Python FastAPI backend to get status
    const backendUrl = (process.env.AGENT_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
    let pyResp;
    try {
      pyResp = await fetch(`${backendUrl}/api/projects/${dbProject.doAppId}/status`);
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
    const backendLiveUrl = statusData.liveUrl || dbProject.lastPreviewUrl || null;
    
    // If a preview domain is configured, use HTTPS subdomain URLs instead of raw IPs
    // This resolves the mixed-content issue (HTTPS page embedding HTTP iframe)
    const previewDomain = process.env.NEXT_PUBLIC_PREVIEW_DOMAIN;
    const resolvedLiveUrl = (previewDomain && dbProject.doAppId)
      ? `https://${dbProject.doAppId}.${previewDomain}`
      : backendLiveUrl;
    
    // Persist liveUrl and dropletIp to DB when they become available
    const currentSpec = (dbProject.appSpecRaw as any) || {};
    const needsUpdate = 
      (backendLiveUrl && backendLiveUrl !== dbProject.lastPreviewUrl) ||
      (statusData.dropletIp && statusData.dropletIp !== currentSpec.dropletIp);
    
    if (needsUpdate) {
      const updatedSpec = { ...currentSpec };
      if (statusData.dropletIp) updatedSpec.dropletIp = statusData.dropletIp;
      
      await db.update(project)
        .set({ 
          lastPreviewUrl: backendLiveUrl || dbProject.lastPreviewUrl,
          appSpecRaw: updatedSpec,
          updatedAt: new Date(),
        })
        .where(eq(project.id, id));
    }

    // Extract repo name from GitHub URL
    const parts = dbProject.githubUrl.replace("https://github.com/", "").replace(".git", "").split("/");
    const projectName = parts[parts.length - 1] || "project";

    return Response.json({
        phase: statusData.phase,
        logs: statusData.logs,
        liveUrl: resolvedLiveUrl,
        projectName: projectName,
    });

  } catch (err: any) {
    console.error("Error fetching status:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

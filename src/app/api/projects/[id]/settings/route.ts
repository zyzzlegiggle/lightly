import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContextResult } from "@/lib/auth-context";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthContextResult();
  if (!result.ok) {
    return Response.json(
      { error: result.reason === "github_not_linked" ? "github_not_linked" : "Unauthorized" },
      { status: result.reason === "github_not_linked" ? 403 : 401 }
    );
  }

  const ctx = result.ctx;
  const { envVars } = await req.json();

  try {
    // 1. Get current project
    const currentProject = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.userId, ctx.userId)),
    });

    if (!currentProject) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // 2. Update appSpecRaw with new environment variables
    const updatedSpec = {
      ...(currentProject.appSpecRaw as any || {}),
      envVars: envVars || []
    };

    await db.update(project)
      .set({ appSpecRaw: updatedSpec })
      .where(eq(project.id, id));

    // 3. If there's an active Droplet, sync the .env file immediately
    const dropletId = currentProject.doAppId;
    const dropletIp = (updatedSpec as any).dropletIp;
    const syncToken = (updatedSpec as any).syncToken;

    if (dropletId && dropletIp && syncToken) {
      // Construct the .env content
      let envContent = "";
      for (const { key, value } of (envVars || [])) {
        if (key.trim()) {
           envContent += `${key}=${value}\n`;
        }
      }

      // Hit Python backend to proxy sync the new .env
      console.log(`[Settings] Syncing new .env to Droplet ${dropletId} at ${dropletIp}...`);
      
      try {
        const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8000";
        const syncResp = await fetch(`${backendUrl}/api/droplets/${dropletId}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dropletIp,
            syncToken,
            changes: [{ file: ".env", content: envContent }]
          })
        });

        if (!syncResp.ok) {
          const errText = await syncResp.text();
          console.error("[Settings] Live sync failed:", errText);
          // We still return OK since the DB is updated, but notify about the delay
          return Response.json({ 
            success: true, 
            warning: "Settings saved to DB, but failed to sync live to Droplet. Restart may be required." 
          });
        }
      } catch (err) {
        console.error("[Settings] Backend connection failed:", err);
      }
    }

    return Response.json({ success: true });
  } catch (err: any) {
    console.error("[Settings Error]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

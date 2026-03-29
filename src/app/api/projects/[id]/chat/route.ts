import { auth0 } from "@/lib/auth0";
import { getAuthContext } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get project
  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, ctx.userId)),
  });
  if (!dbProject) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { message, history = [], currentPage = "/", attachments = [] } = await req.json();
  const spec = dbProject.appSpecRaw as any;

  // Forward to FastAPI agent — GitHub token from Token Vault (short-lived, secure)
  const pyResp = await fetch("http://localhost:8000/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      githubUrl: dbProject.githubUrl,
      githubToken: ctx.githubToken,
      doAppId: dbProject.doAppId,
      branch: dbProject.activeBranch || "main",
      repoId: dbProject.repoId,
      dropletIp: spec?.dropletIp || "",
      syncToken: spec?.syncToken || "",
      currentPage,
      attachments,
    }),
  });

  if (!pyResp.ok) {
    return Response.json({ error: "Agent backend error" }, { status: 502 });
  }

  // Proxy the SSE stream
  return new Response(pyResp.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

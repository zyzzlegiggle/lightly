import { auth0 } from "@/lib/auth0";
import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  const result = await getAuthContextResult();

  if (!result.ok || !session) {
    return Response.json(
      { error: result.ok === false && result.reason === "github_not_linked" ? "github_not_linked" : "Unauthorized" },
      { status: result.ok === false && result.reason === "github_not_linked" ? 403 : 401 }
    );
  }

  const ctx = result.ctx;

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

  // The Auth0 session tokenSet contains the refresh_token (when offline_access scope is granted)
  // This is used by the agent backend to call Token Vault for Gmail, Slack, Notion, etc.
  const auth0RefreshToken = (session as any).tokenSet?.refresh_token ?? null;

  if (!auth0RefreshToken) {
    console.warn("[Chat] No refresh token in session — workspace service tools will be unavailable.");
  }

  // Forward to FastAPI agent
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
      auth0RefreshToken,
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

import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getAuthContextResult();
  if (!result.ok) {
    return Response.json(
      { error: result.reason === "github_not_linked" ? "github_not_linked" : "Unauthorized" },
      { status: result.reason === "github_not_linked" ? 403 : 401 }
    );
  }

  const ctx = result.ctx;

  const { id } = await params;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, ctx.userId)),
  });
  if (!dbProject) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { changes, message = "Apply changes" } = await req.json();

  // GitHub token from Token Vault (short-lived, secure)
  const backendUrl = (process.env.AGENT_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
  const pyResp = await fetch(`${backendUrl}/api/agent/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changes,
      message,
      githubUrl: dbProject.githubUrl,
      githubToken: ctx.githubToken,
      branch: dbProject.activeBranch || "main",
    }),
  });

  if (!pyResp.ok) {
    return Response.json({ error: "Failed to confirm changes" }, { status: 502 });
  }

  return Response.json(await pyResp.json());
}

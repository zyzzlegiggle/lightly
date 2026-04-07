import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project as projectTable } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getAuthContextResult();
  if (!result.ok || !result.ctx.linearAccessToken) {
    return Response.json({ error: "linear_not_linked" }, { status: 403 });
  }

  const { id } = await params;
  const dbProject = await db.query.project.findFirst({
    where: and(eq(projectTable.id, id), eq(projectTable.userId, result.ctx.userId)),
  });

  if (!dbProject) return Response.json({ error: "Not found" }, { status: 404 });

  // If not initialized, return teams to let user pick (or we pick first)
  if (!dbProject.linearProjectId || !dbProject.linearTeamId) {
    const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
    const teamsResp = await fetch(`${backendUrl}/api/linear/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.ctx.linearAccessToken })
    });
    const { teams } = await teamsResp.json();
    return Response.json({ status: "uninitialized", teams });
  }

  // Fetch states and issues
  const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
  const boardResp = await fetch(`${backendUrl}/api/linear/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          token: result.ctx.linearAccessToken,
          teamId: dbProject.linearTeamId,
          projectId: dbProject.linearProjectId
      })
  });
  
  return Response.json(await boardResp.json());
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getAuthContextResult();
  if (!result.ok || !result.ctx.linearAccessToken) {
    return Response.json({ error: "linear_not_linked" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(projectTable.id, id), eq(projectTable.userId, result.ctx.userId)),
  });
  if (!dbProject) return Response.json({ error: "Not found" }, { status: 404 });

  if (action === "init") {
    const { teamId, projectName } = body;
    const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
    const initResp = await fetch(`${backendUrl}/api/linear/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            token: result.ctx.linearAccessToken,
            teamId,
            name: projectName || "Lightly Project"
        })
    });
    const { project } = await initResp.json();
    
    await db.update(projectTable)
        .set({ linearProjectId: project.id, linearTeamId: teamId })
        .where(eq(projectTable.id, id));
        
    return Response.json({ ok: true, project });
  }

  if (action === "move") {
      const { issueId, stateId } = body;
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      const moveResp = await fetch(`${backendUrl}/api/linear/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              token: result.ctx.linearAccessToken,
              issueId,
              stateId
          })
      });
      return Response.json(await moveResp.json());
  }

  if (action === "create") {
      const { title, description, stateId } = body;
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      const createResp = await fetch(`${backendUrl}/api/linear/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              token: result.ctx.linearAccessToken,
              teamId: dbProject.linearTeamId,
              projectId: dbProject.linearProjectId,
              title,
              description,
              stateId
          })
      });
      return Response.json(await createResp.json());
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

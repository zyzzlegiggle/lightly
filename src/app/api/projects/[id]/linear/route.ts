import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project as projectTable } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getLinearToken, listLinearProjects } from "@/lib/linear-service";

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

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // GET ?action=projects — list all projects for this user
  if (action === "projects") {
      const allProjects = await listLinearProjects(result.ctx.linearAccessToken);
      return Response.json({ status: "projects", projects: allProjects });
  }

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

  const projectId = searchParams.get("projectId") || dbProject.linearProjectId;

  // Fetch states and issues
  const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
  const boardResp = await fetch(`${backendUrl}/api/linear/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          token: result.ctx.linearAccessToken,
          teamId: dbProject.linearTeamId,
          projectId
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
      if (!dbProject.linearTeamId || !dbProject.linearProjectId) {
          return Response.json({ error: "linear_not_linked" }, { status: 400 });
      }
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
              stateId: stateId || undefined
          })
      });
      return Response.json(await createResp.json());
  }

  if (action === "createProject") {
      const { name } = body;
      if (!dbProject.linearTeamId) return Response.json({ error: "Team not linked" }, { status: 400 });
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      const initResp = await fetch(`${backendUrl}/api/linear/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              token: result.ctx.linearAccessToken,
              teamId: dbProject.linearTeamId,
              name
          })
      });
      const { project } = await initResp.json();
      if (!project) return Response.json({ error: "Failed to create project" }, { status: 500 });
      
      await db.update(projectTable)
          .set({ linearProjectId: project.id })
          .where(eq(projectTable.id, id));
          
      return Response.json({ success: true, project });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

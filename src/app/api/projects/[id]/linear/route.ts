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

  // Fetch states, issues, and members
  const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
  const [boardResp, membersResp] = await Promise.all([
      fetch(`${backendUrl}/api/linear/board`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: result.ctx.linearAccessToken, teamId: dbProject.linearTeamId, projectId })
      }),
      fetch(`${backendUrl}/api/linear/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: result.ctx.linearAccessToken, teamId: dbProject.linearTeamId })
      })
  ]);
  
  const boardData = await boardResp.json();
  const membersData = await membersResp.json();
  
  return Response.json({ ...boardData, ...membersData });
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
    if (!issueId || !stateId) {
      return Response.json({ error: "Missing issueId or stateId" }, { status: 400 });
    }
    const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
    const moveResp = await fetch(`${backendUrl}/api/linear/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: result.ctx.linearAccessToken, issueId, stateId }),
    });
    return Response.json(await moveResp.json());
  }

  if (action === "update") {
      const { issueId, title, assigneeId, dueDate } = body;
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      const updateResp = await fetch(`${backendUrl}/api/linear/update`, {
          method: "POST", // Actually I'll use /api/linear/update if I add it to agent-backend
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              token: result.ctx.linearAccessToken,
              issueId,
              title,
              assigneeId,
              dueDate
          })
      });
      return Response.json(await updateResp.json());
  }

  if (action === "create") {
      const { title, description, stateId, assigneeId, dueDate } = body;
      if (!dbProject.linearTeamId || !dbProject.linearProjectId) {
          return Response.json({ error: "linear_not_linked" }, { status: 400 });
      }
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      
      // We need to update agent-backend's create_issue call to support more fields
      const createResp = await fetch(`${backendUrl}/api/linear/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              token: result.ctx.linearAccessToken,
              teamId: dbProject.linearTeamId,
              projectId: dbProject.linearProjectId,
              title,
              description,
              stateId,
              assigneeId,
              dueDate
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

  if (action === "deleteProject") {
      const { projectId } = body;
      if (!projectId) return Response.json({ error: "Missing projectId" }, { status: 400 });
      const backendUrl = process.env.AGENT_BACKEND_URL || "http://localhost:8080";
      const deleteResp = await fetch(`${backendUrl}/api/linear/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              token: result.ctx.linearAccessToken,
              projectId
          })
      });
      const data = await deleteResp.json();
      return Response.json(data);
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

import { auth0 } from "@/lib/auth0";
import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSlackToken, createSlackChannel, postWelcomeMessage } from "@/lib/slack-service";
import { getLinearToken, createLinearProject } from "@/lib/linear-service";
import { getNotionToken, createNotionProjectPage } from "@/lib/notion-service";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.sub;
  const projects = await db.query.project.findMany({
    where: eq(project.userId, userId),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });
  return Response.json({ projects });
}

export async function POST(req: Request) {
  const result = await getAuthContextResult();

  if (!result.ok) {
    return Response.json({ error: result.reason === "github_not_linked" ? "github_not_linked" : "Unauthorized" }, { status: result.reason === "github_not_linked" ? 403 : 401 });
  }

  const { userId, githubToken } = result.ctx;

  try {
    const { repoId, githubUrl, name, envVars } = await req.json();

    if (!repoId || !githubUrl) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── Guard: same repo can't be linked twice ──
    const dupeRepo = await db.query.project.findFirst({
      where: and(eq(project.repoId, repoId), eq(project.userId, userId)),
    });

    if (dupeRepo) {
      return Response.json(
        { error: "This repository is already linked." },
        { status: 409 }
      );
    }

    // Call Python FastAPI backend to start indexing
    // GitHub token now comes from Token Vault (short-lived, secure)
    const pyResp = await fetch("http://localhost:8000/api/projects/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoId, githubUrl, name, githubToken, envVars: envVars || [] }),
    });

    let liveUrl = "";
    let doAppId = null;
    let appSpecRaw = null;

    if (!pyResp.ok) {
      const errText = await pyResp.text();
      console.error("FastAPI backend failed:", errText);
      return Response.json({ error: "Failed to create sandbox. Is the backend running?" }, { status: 502 });
    }

    const pyData = await pyResp.json();

    // The sync endpoint catches errors and returns { error: "..." }
    if (pyData.error) {
      console.error("Droplet creation error:", pyData.error);
      return Response.json({ error: pyData.error }, { status: 502 });
    }

    console.log("Droplet creation started:", pyData);
    liveUrl = pyData.liveUrl || "";
    doAppId = pyData.doAppId;
    appSpecRaw = pyData.appSpecRaw;

    // Mock Gradient ID for now
    const gradientKbId = `kb-mock-${Date.now()}`;

    // Create the project in database with Drizzle
    const newProject = await db.insert(project).values({
      id: crypto.randomUUID(),
      repoId,
      githubUrl,
      gradientKbId,
      userId,
      doAppId,
      lastPreviewUrl: liveUrl,
      appSpecRaw,
    }).returning();

    // Auto-create a Slack channel for this project if the user has Slack connected
    let slackChannelId: string | null = null;
    try {
      const slackToken = await getSlackToken(userId);
      if (slackToken) {
        const channelName = name || `project-${newProject[0].id.slice(0, 8)}`;
        slackChannelId = await createSlackChannel(slackToken, channelName);
        if (slackChannelId) {
          await db.update(project)
            .set({ slackChannelId })
            .where(eq(project.id, newProject[0].id));
          await postWelcomeMessage(slackToken, slackChannelId, name || channelName);
        }
      }
    } catch (err) {
      console.warn("[Projects] Slack channel creation skipped:", err);
    }

    // Auto-create a Linear project if the user has Linear connected
    try {
      const linearToken = await getLinearToken(userId);
      if (linearToken) {
        const linearProject = await createLinearProject(linearToken, name || "New Project", "Dedicated project created by Lightly.");
        if (linearProject) {
          await db.update(project)
            .set({ 
                linearProjectId: linearProject.projectId,
                linearTeamId: linearProject.teamId 
            })
            .where(eq(project.id, newProject[0].id));
        }
      }
    } catch (err) {
      console.warn("[Projects] Linear project creation skipped:", err);
    }

    // Auto-create a Notion page if the user has Notion connected
    try {
      const notionToken = await getNotionToken(userId);
      if (notionToken) {
        const notionPageId = await createNotionProjectPage(notionToken, name || "New Project");
        if (notionPageId) {
          await db.update(project)
            .set({ notionPageId })
            .where(eq(project.id, newProject[0].id));
        }
      }
    } catch (err) {
      console.warn("[Projects] Notion page creation skipped:", err);
    }

    return Response.json({ project: newProject[0], liveUrl });

  } catch (err: any) {
    console.error("Error creating project:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

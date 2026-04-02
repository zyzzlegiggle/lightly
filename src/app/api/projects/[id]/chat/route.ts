import { auth0 } from "@/lib/auth0";
import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project, account } from "@/lib/schema";
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

  // Fetch the user's connected service tokens from the account table
  const connectedAccounts = await db.query.account.findMany({
    where: eq(account.userId, ctx.userId),
  });

  const googleAccount = connectedAccounts.find((a) => a.providerId === "google-oauth2");
  const slackAccounts = connectedAccounts.filter((a) => a.providerId === "slack");

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
      // Pass service tokens directly — no more Token Vault round-trip
      googleAccessToken: googleAccount?.accessToken || null,
      slackAccessToken: slackAccounts[0]?.accessToken || null,
      slackChannelId: dbProject.slackChannelId || null,
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

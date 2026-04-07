import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.sub;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, userId)),
  });
  if (!dbProject) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { changes } = await req.json();
  const spec = dbProject.appSpecRaw as any;

  const backendUrl = (process.env.AGENT_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
  const pyResp = await fetch(`${backendUrl}/api/agent/revert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changes,
      dropletIp: spec?.dropletIp || "",
      syncToken: spec?.syncToken || "",
    }),
  });

  if (!pyResp.ok) {
    return Response.json({ error: "Failed to revert changes" }, { status: 502 });
  }

  return Response.json(await pyResp.json());
}

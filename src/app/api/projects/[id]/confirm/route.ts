import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project, account } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, session.user.id)),
  });
  if (!dbProject) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const userAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, session.user.id), eq(account.providerId, "github")),
  });

  const { changes, message = "Apply changes" } = await req.json();

  const pyResp = await fetch("http://localhost:8000/api/agent/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changes,
      message,
      githubUrl: dbProject.githubUrl,
      githubToken: userAccount?.accessToken || "",
      branch: dbProject.activeBranch || "main",
    }),
  });

  if (!pyResp.ok) {
    return Response.json({ error: "Failed to confirm changes" }, { status: 502 });
  }

  return Response.json(await pyResp.json());
}

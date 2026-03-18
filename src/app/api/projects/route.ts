import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { account } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. FETCH THE GITHUB TOKEN FROM THE DATABASE
  const userAccount = await db.query.account.findFirst({
    where: and(
      eq(account.userId, session.user.id),
      eq(account.providerId, "github")
    ),
  });

  const githubToken = userAccount?.accessToken; // This is the missing key

  try {
    const { repoId, githubUrl, name } = await req.json();

    if (!repoId || !githubUrl) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Call Python FastAPI backend to start indexing into DigitalOcean Knowledge Base
    const pyResp = await fetch("http://localhost:8000/api/projects/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoId, githubUrl, name, githubToken }),
    });

    let liveUrl = "";
    let doAppId = null;
    let appSpecRaw = null;

    if (!pyResp.ok) {
      console.warn("FastAPI backend failed to start sync", await pyResp.text());
    } else {
      const pyData = await pyResp.json();
      console.log("Started python indexing & DO App Platform build", pyData);
      liveUrl = pyData.liveUrl || "";
      doAppId = pyData.doAppId;
      appSpecRaw = pyData.appSpecRaw;
    }

    // Mock Gradient ID for now
    const gradientKbId = `kb-mock-${Date.now()}`;

    // Create the project in database with Drizzle
    const newProject = await db.insert(project).values({
      id: crypto.randomUUID(),
      repoId,
      githubUrl,
      gradientKbId,
      userId: session.user.id,
      doAppId,
      lastPreviewUrl: liveUrl,
      appSpecRaw,
    }).returning();

    return Response.json({ project: newProject[0], liveUrl });

  } catch (err: any) {
    console.error("Error creating project:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

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

  // Verify project ownership
  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, userId)),
  });
  if (!dbProject) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Forward the multipart form data to the Python backend
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Re-create FormData for the Python backend
  const pyFormData = new FormData();
  pyFormData.append("file", file);

  try {
    const backendUrl = (process.env.AGENT_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
    const pyResp = await fetch(`${backendUrl}/api/uploads`, {
      method: "POST",
      body: pyFormData,
    });

    if (!pyResp.ok) {
      const err = await pyResp.text();
      return Response.json({ error: err }, { status: pyResp.status });
    }

    const result = await pyResp.json();

    // Rewrite the URL to proxy through Next.js
    return Response.json({
      ...result,
      url: `/api/projects/${id}/uploads/${result.filename}`,
      backendUrl: `${backendUrl}${result.url}`,
    });
  } catch (err) {
    console.error("Upload proxy error:", err);
    return Response.json({ error: "Upload failed" }, { status: 502 });
  }
}

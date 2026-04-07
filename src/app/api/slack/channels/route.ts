import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account, project } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

async function getSlackToken(userId: string) {
  const row = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "slack")),
  });
  return row?.accessToken ?? null;
}

/**
 * GET /api/slack/channels?projectId=xxx
 * Lists channels. If projectId is given, filters to channels matching `proj-{slug}` prefix.
 */
export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getSlackToken(session.user.sub);
  if (!token) return Response.json({ connected: false, channels: [] });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  try {
    // Get channels from Slack
    const resp = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();

    if (!data.ok) {
      console.error("[Slack] conversations.list failed:", data.error);
      return Response.json({ connected: true, channels: [], error: data.error });
    }

    let channels = (data.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      topic: ch.topic?.value || "",
      purpose: ch.purpose?.value || "",
      memberCount: ch.num_members || 0,
      isPrivate: ch.is_private || false,
      isMember: ch.is_member || false,
    }));

    // If projectId provided, filter to project-specific channels
    if (projectId) {
      const dbProject = await db.query.project.findFirst({
        where: eq(project.id, projectId),
      });
      if (dbProject) {
        const slug = dbProject.githubUrl
          .replace("https://github.com/", "")
          .replace(".git", "")
          .split("/").pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "-") || "project";
        const prefix = `proj-${slug}`;
        channels = channels.filter((ch: any) =>
          ch.name.startsWith(prefix) || ch.name === prefix
        );
      }
    }

    return Response.json({ connected: true, channels });
  } catch (err) {
    console.error("[Slack] Error listing channels:", err);
    return Response.json({ connected: true, channels: [], error: "fetch_failed" });
  }
}

/**
 * POST /api/slack/channels
 * Creates a new channel. Body: { name, projectId? }
 * If projectId is given, auto-prefixes with `proj-{slug}-`
 */
export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getSlackToken(session.user.sub);
  if (!token) return Response.json({ error: "Slack not connected" }, { status: 403 });

  const { name, projectId } = await req.json();
  if (!name) return Response.json({ error: "Channel name required" }, { status: 400 });

  let channelName = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 80);

  // Auto-prefix with project slug if projectId is provided
  if (projectId) {
    const dbProject = await db.query.project.findFirst({
      where: eq(project.id, projectId),
    });
    if (dbProject) {
      const slug = dbProject.githubUrl
        .replace("https://github.com/", "")
        .replace(".git", "")
        .split("/").pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "-") || "project";
      channelName = `proj-${slug}-${channelName}`.slice(0, 80);
    }
  }

  try {
    const resp = await fetch("https://slack.com/api/conversations.create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: channelName }),
    });
    const data = await resp.json();

    if (!data.ok) {
      if (data.error === "name_taken") {
        return Response.json({ error: "Channel name already taken" }, { status: 409 });
      }
      console.error("[Slack] conversations.create failed:", data.error);
      return Response.json({ error: data.error }, { status: 400 });
    }

    return Response.json({
      channel: {
        id: data.channel.id,
        name: data.channel.name,
        topic: "",
        purpose: "",
        memberCount: 1,
        isPrivate: false,
        isMember: true,
      },
    });
  } catch (err) {
    console.error("[Slack] Error creating channel:", err);
    return Response.json({ error: "Failed to create channel" }, { status: 500 });
  }
}

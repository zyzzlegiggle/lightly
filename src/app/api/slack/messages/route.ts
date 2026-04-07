import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

async function getSlackToken(userId: string) {
  const row = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "slack")),
  });
  return row?.accessToken ?? null;
}

/**
 * GET /api/slack/messages?channel=CXXXX&limit=50
 * Fetches message history for a channel.
 */
export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getSlackToken(session.user.sub);
  if (!token) return Response.json({ error: "Slack not connected" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel");
  const limit = searchParams.get("limit") || "50";

  if (!channel) return Response.json({ error: "channel required" }, { status: 400 });

  try {
    // Join the channel first (in case user isn't a member)
    await fetch("https://slack.com/api/conversations.join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel }),
    });

    // Fetch history
    const resp = await fetch(
      `https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await resp.json();

    if (!data.ok) {
      console.error("[Slack] conversations.history failed:", data.error);
      return Response.json({ messages: [], error: data.error });
    }

    // Collect unique user IDs to resolve names
    const userIds = new Set<string>();
    for (const msg of data.messages || []) {
      if (msg.user) userIds.add(msg.user);
    }

    // Discover self ID to display "You"
    let selfId = "";
    try {
      const authTestResp = await fetch("https://slack.com/api/auth.test", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const authTestData = await authTestResp.json();
      if (authTestData.ok) selfId = authTestData.user_id;
    } catch {}

    // Batch fetch user info
    const userMap: Record<string, { name: string; avatar: string }> = {};
    for (const uid of userIds) {
      if (uid === selfId) continue; // Skip resolving self, we'll manually set to "You"
      try {
        const uResp = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const uData = await uResp.json();
        if (uData.ok && uData.user) {
          userMap[uid] = {
            name: uData.user.real_name || uData.user.name || uid,
            avatar: uData.user.profile?.image_48 || "",
          };
        }
      } catch {
        userMap[uid] = { name: uid, avatar: "" };
      }
    }

    const messages = (data.messages || [])
      .filter((m: any) => m.type === "message" && !m.subtype)
      .reverse() // Slack returns newest first, we want oldest first
      .map((m: any) => {
        const isSelf = m.user === selfId;
        return {
          ts: m.ts,
          text: m.text || "",
          user: m.user || "",
          userName: isSelf ? "You" : (userMap[m.user]?.name || m.user || "Unknown"),
          userAvatar: isSelf ? "" : (userMap[m.user]?.avatar || ""),
          threadTs: m.thread_ts,
          replyCount: m.reply_count || 0,
        };
      });

    return Response.json({ messages });
  } catch (err) {
    console.error("[Slack] Error fetching messages:", err);
    return Response.json({ messages: [], error: "fetch_failed" });
  }
}

/**
 * POST /api/slack/messages
 * Sends a message to a channel. Body: { channel, text, threadTs? }
 */
export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getSlackToken(session.user.sub);
  if (!token) return Response.json({ error: "Slack not connected" }, { status: 403 });

  const { channel, text, threadTs } = await req.json();
  if (!channel || !text) return Response.json({ error: "channel and text required" }, { status: 400 });

  try {
    const body: any = { channel, text };
    if (threadTs) body.thread_ts = threadTs;

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!data.ok) {
      console.error("[Slack] chat.postMessage failed:", data.error);
      return Response.json({ error: data.error }, { status: 400 });
    }

    return Response.json({
      message: {
        ts: data.ts,
        text,
        user: data.message?.user || "",
        userName: "You",
        userAvatar: "",
      },
    });
  } catch (err) {
    console.error("[Slack] Error sending message:", err);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}

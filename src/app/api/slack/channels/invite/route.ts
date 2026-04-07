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

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getSlackToken(session.user.sub);
  if (!token) return Response.json({ error: "Slack not connected" }, { status: 403 });

  const { channel, users } = await req.json();
  if (!channel || !users) return Response.json({ error: "channel and users required" }, { status: 400 });

  try {
    const resp = await fetch("https://slack.com/api/conversations.invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, users }),
    });
    const data = await resp.json();

    if (!data.ok) {
      console.error("[Slack] conversations.invite failed:", data.error);
      return Response.json({ error: data.error }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[Slack] Error inviting to channel:", err);
    return Response.json({ error: "Failed to invite users" }, { status: 500 });
  }
}

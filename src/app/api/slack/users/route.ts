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

export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getSlackToken(session.user.sub);
  if (!token) return Response.json({ connected: false, users: [] });

  try {
    const resp = await fetch("https://slack.com/api/users.list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();

    if (!data.ok) {
      console.error("[Slack] users.list failed:", data.error);
      return Response.json({ connected: true, users: [], error: data.error });
    }

    const users = (data.members || [])
      .filter((u: any) => !u.is_bot && u.name !== "slackbot" && !u.deleted)
      .map((u: any) => ({
        id: u.id,
        name: u.real_name || u.name,
        avatar: u.profile?.image_48 || "",
        status: u.profile?.status_text || "",
      }));

    return Response.json({ connected: true, users });
  } catch (err) {
    console.error("[Slack] Error listing users:", err);
    return Response.json({ connected: true, users: [], error: "fetch_failed" });
  }
}

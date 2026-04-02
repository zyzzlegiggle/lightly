import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// POST /api/gmail/send
// Body: { to, subject, body }
export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const row = await db.query.account.findFirst({
    where: and(
      eq(account.userId, session.user.sub),
      eq(account.providerId, "google-oauth2")
    ),
  });
  if (!row?.accessToken) {
    return Response.json({ error: "google_not_connected" }, { status: 403 });
  }

  const { to, subject, body } = await req.json();
  if (!to || !subject || !body) {
    return Response.json({ error: "Missing to, subject, or body" }, { status: 400 });
  }

  // Build RFC 2822 raw email
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(raw).toString("base64url");

  const resp = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${row.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[Gmail] Send failed:", err);
    return Response.json({ error: "Failed to send email", detail: err }, { status: resp.status });
  }

  const data = await resp.json();
  return Response.json({ success: true, messageId: data.id });
}

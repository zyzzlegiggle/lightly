import { auth0 } from "@/lib/auth0";
import { getServiceToken } from "@/lib/tokens";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function getGoogleToken(userId: string): Promise<string | null> {
  return getServiceToken(userId, "google-oauth2");
}

function parseHeaders(headers: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) map[h.name] = h.value;
  return map;
}

function extractBody(payload: any): string {
  if (!payload) return "";
  // Check parts recursively for text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/plain" || payload.mimeType === "text/html") {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
  }
  return "";
}

// GET /api/gmail/messages?q=&maxResults=20
export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getGoogleToken(session.user.sub);
  if (!token) return Response.json({ error: "google_not_connected" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "in:inbox";
  const maxResults = parseInt(searchParams.get("maxResults") || "25");
  const messageId = searchParams.get("id");

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Single message fetch
  if (messageId) {
    const msgResp = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
      headers: authHeaders,
    });
    if (!msgResp.ok) {
      const err = await msgResp.text();
      console.error("[Gmail] Message fetch failed:", err);
      return Response.json({ error: "Failed to fetch message" }, { status: msgResp.status });
    }
    const msg = await msgResp.json();
    const hdrs = parseHeaders(msg.payload?.headers ?? []);
    const body = extractBody(msg.payload);
    return Response.json({
      id: msg.id,
      subject: hdrs["Subject"] || "(no subject)",
      from: hdrs["From"] || "",
      to: hdrs["To"] || "",
      date: hdrs["Date"] || "",
      snippet: msg.snippet || "",
      body,
      labelIds: msg.labelIds || [],
    });
  }

  // List messages
  const listResp = await fetch(
    `${GMAIL_BASE}/messages?${new URLSearchParams({ q, maxResults: String(maxResults) })}`,
    { headers: authHeaders }
  );
  if (!listResp.ok) {
    const err = await listResp.text();
    console.error("[Gmail] List failed:", err);
    return Response.json({ error: "Failed to list messages" }, { status: listResp.status });
  }

  const listData = await listResp.json();
  const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);

  // Fetch each message in parallel (metadata only for list view)
  const messages = await Promise.all(
    messageIds.map(async (id) => {
      const r = await fetch(`${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
        headers: authHeaders,
      });
      if (!r.ok) return null;
      const m = await r.json();
      const hdrs = parseHeaders(m.payload?.headers ?? []);
      return {
        id: m.id,
        subject: hdrs["Subject"] || "(no subject)",
        from: hdrs["From"] || "",
        date: hdrs["Date"] || "",
        snippet: m.snippet || "",
        unread: m.labelIds?.includes("UNREAD") ?? false,
      };
    })
  );

  return Response.json({ messages: messages.filter(Boolean) });
}

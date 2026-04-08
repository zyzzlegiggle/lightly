import { auth0 } from "@/lib/auth0";
import { getServiceToken } from "@/lib/tokens";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function getGoogleToken(userId: string): Promise<string | null> {
  return getServiceToken(userId, "google-oauth2");
}

function parseHeaders(headers: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    if (h.name && h.value) {
      map[h.name] = h.value;
      map[h.name.toLowerCase()] = h.value;
    }
  }
  return map;
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/plain" || payload.mimeType === "text/html") {
    if (payload.body?.data) {
      const data = payload.body.data.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(data, "base64").toString("utf-8");
    }
  }
  return "";
}

export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getGoogleToken(session.user.sub);
  if (!token) return Response.json({ error: "google_not_connected" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  // label:INBOX is often more reliable than in:inbox in some API versions
  const q = searchParams.get("q") || "label:INBOX";
  const maxResults = parseInt(searchParams.get("maxResults") || "25");
  const messageId = searchParams.get("id");

  const authHeaders = { Authorization: `Bearer ${token}` };

  if (messageId) {
    let msgResp = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
      headers: authHeaders,
    });
    
    // Fallback for restricted scopes (metadata)
    if (msgResp.status === 403) {
      const errText = await msgResp.clone().text();
      if (errText.includes("Metadata scope")) {
        console.warn("[Gmail] FULL format forbidden, falling back to METADATA");
        msgResp = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=metadata`, {
          headers: authHeaders,
        });
      }
    }

    if (!msgResp.ok) {
      const err = await msgResp.text();
      console.error("[Gmail] Message fetch failed:", err);
      return Response.json({ error: "Failed to fetch message" }, { status: msgResp.status });
    }
    const isRestricted = msgResp.url.includes("format=metadata");
    const msg = await msgResp.json();
    const hdrs = parseHeaders(msg.payload?.headers ?? []);
    const body = extractBody(msg.payload);
    return Response.json({
      id: msg.id,
      subject: hdrs["subject"] || "(no subject)",
      from: hdrs["from"] || "",
      to: hdrs["to"] || "",
      date: hdrs["date"] || "",
      snippet: msg.snippet || "",
      body,
      labelIds: msg.labelIds || [],
      restricted: isRestricted,
    });
  }

  // List messages
  console.log("[Gmail] Listing with query:", q);
  const params: Record<string, string> = { maxResults: String(maxResults) };
  
  // Use labelIds for the default inbox view to support restricted scopes (like gmail.metadata)
  if (q === "label:INBOX") {
    params.labelIds = "INBOX";
  } else {
    params.q = q;
  }

  const listResp = await fetch(
    `${GMAIL_BASE}/messages?${new URLSearchParams(params)}`,
    { headers: authHeaders }
  );
  
  if (!listResp.ok) {
    const err = await listResp.text();
    console.error("[Gmail] List failed:", listResp.status, err);
    return Response.json({ error: "Failed to list messages" }, { status: listResp.status });
  }

  const listData = await listResp.json();
  const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);
  console.log("[Gmail] Found message IDs:", messageIds.length);

  // Fetch each message in parallel (metadata only for list view)
  const messages = await Promise.all(
    messageIds.map(async (id) => {
      // Use format=metadata to get headers plus snippet/labels
      const query = new URLSearchParams({
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"] as any
      });
      // URLSearchParams repeated keys work like this:
      const fullUrl = `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
      
      const r = await fetch(fullUrl, { headers: authHeaders });
      if (!r.ok) return null;
      const m = await r.json();
      const hdrs = parseHeaders(m.payload?.headers ?? []);
      return {
        id: m.id,
        subject: hdrs["subject"] || "(no subject)",
        from: hdrs["from"] || "",
        date: hdrs["date"] || "",
        snippet: m.snippet || "",
        unread: m.labelIds?.includes("UNREAD") ?? false,
      };
    })
  );

  const finalMessages = messages.filter(Boolean);
  console.log("[Gmail] Final returning messages:", finalMessages.length);
  return Response.json({ messages: finalMessages });
}


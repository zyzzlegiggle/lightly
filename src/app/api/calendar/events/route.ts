import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function getGoogleToken(userId: string): Promise<string | null> {
  const row = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "google-oauth2")),
  });
  return row?.accessToken ?? null;
}

// GET /api/calendar/events?from=&to=
// POST /api/calendar/events — { summary, startAt, endAt?, description?, allDay? }
export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getGoogleToken(session.user.sub);
  if (!token) return Response.json({ connected: false, events: [] });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || new Date().toISOString();
  const to = searchParams.get("to") || new Date(Date.now() + 30 * 86400000).toISOString();

  try {
    const params = new URLSearchParams({
      timeMin: from,
      timeMax: to,
      maxResults: "50",
      singleEvents: "true",
      orderBy: "startTime",
    });

    const resp = await fetch(`${GCAL_BASE}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[Calendar] List events failed:", err);
      return Response.json({ connected: true, events: [], error: "api_error" });
    }

    const data = await resp.json();
    const events = (data.items || []).map((e: any) => ({
      id: e.id,
      title: e.summary || "(no title)",
      description: e.description || "",
      startAt: e.start?.dateTime || e.start?.date || "",
      endAt: e.end?.dateTime || e.end?.date || "",
      allDay: !!e.start?.date,
      color: "blue", // Google Calendar events get a blue accent
      source: "google",
      htmlLink: e.htmlLink || "",
    }));

    return Response.json({ connected: true, events });
  } catch (e) {
    console.error("[Calendar] Error:", e);
    return Response.json({ connected: true, events: [], error: "fetch_error" });
  }
}

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getGoogleToken(session.user.sub);
  if (!token) return Response.json({ error: "google_not_connected" }, { status: 403 });

  const { summary, startAt, endAt, description, allDay } = await req.json();
  if (!summary || !startAt) {
    return Response.json({ error: "Missing summary or startAt" }, { status: 400 });
  }

  // Build the event payload
  const start = allDay
    ? { date: startAt.split("T")[0] }
    : { dateTime: startAt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };

  let end;
  if (endAt) {
    end = allDay
      ? { date: endAt.split("T")[0] }
      : { dateTime: endAt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  } else {
    // Default: 1 hour duration
    if (allDay) {
      end = start;
    } else {
      const endDate = new Date(new Date(startAt).getTime() + 3600000);
      end = { dateTime: endDate.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
  }

  const payload = { summary, description: description || "", start, end };

  const resp = await fetch(GCAL_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[Calendar] Create event failed:", err);
    return Response.json({ error: "Failed to create event" }, { status: resp.status });
  }

  const event = await resp.json();
  return Response.json({
    event: {
      id: event.id,
      title: event.summary,
      startAt: event.start?.dateTime || event.start?.date,
      endAt: event.end?.dateTime || event.end?.date,
      source: "google",
    },
  });
}

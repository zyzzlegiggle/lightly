import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { workspaceEvent } from "@/lib/schema";
import { getServiceToken } from "@/lib/tokens";
import { and, eq, gte, lte } from "drizzle-orm";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function getGoogleToken(userId: string): Promise<string | null> {
  return getServiceToken(userId, "google-oauth2");
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

  const events: any[] = [];
  const authHeaders = { Authorization: `Bearer ${token}` };

  try {
    // ── 1. Fetch Google Calendar events ─────────────────────────────────────
    const gRes = await fetch(
      `${GCAL_BASE}?${new URLSearchParams({
        timeMin: from,
        timeMax: to,
        singleEvents: "true",
        orderBy: "startTime",
      })}`,
      { headers: authHeaders }
    );
    if (gRes.ok) {
      const data = await gRes.json();
      (data.items || []).forEach((e: any) => {
        events.push({
          id: `g-${e.id}`,
          title: e.summary || "(no title)",
          description: e.description || "",
          startAt: e.start?.dateTime || e.start?.date || "",
          endAt: e.end?.dateTime || e.end?.date || "",
          allDay: !!e.start?.date,
          color: "blue",
          source: "google",
          htmlLink: e.htmlLink || "",
        });
      });
    }

    // ── 2. Fetch Google Tasks ───────────────────────────────────────────────
    try {
      const tasksRes = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true", {
        headers: authHeaders
      });
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        (tasksData.items || []).forEach((t: any) => {
          if (t.due) {
            events.push({
              id: `t-${t.id}`,
              title: `Task: ${t.title || "(no title)"}`,
              description: t.notes || "",
              startAt: t.due, // Tasks only have a due date
              allDay: true,
              color: "amber", // Distinct color for tasks
              source: "google-task",
            });
          }
        });
      }
    } catch (e) {
      console.error("[Calendar] Google Tasks fetch failed:", e);
    }

    // ── 3. Fetch local workspace events ─────────────────────────────────────
    const local = await db.query.workspaceEvent.findMany({
      where: and(
        eq(workspaceEvent.userId, session.user.sub),
        gte(workspaceEvent.startAt, new Date(from)),
        lte(workspaceEvent.startAt, new Date(to))
      ),
    });
    local.forEach((e: any) => {
      events.push({
        id: e.id,
        title: e.title,
        description: e.description || "",
        startAt: e.startAt.toISOString(),
        endAt: e.endAt?.toISOString() || null,
        allDay: e.allDay,
        color: e.color || "zinc",
        source: "local",
      });
    });

    return Response.json({ events, connected: true });
  } catch (error) {
    console.error("[Calendar] GET Error:", error);
    return Response.json({ error: "Server Error" }, { status: 500 });
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

"use client";

import { useState, useEffect, useCallback } from "react";

interface CalEvent {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  color: string;
}

const COLORS = [
  { id: "zinc", label: "Default", bg: "bg-zinc-700", dot: "bg-zinc-500" },
  { id: "blue", label: "Blue", bg: "bg-blue-500", dot: "bg-blue-500" },
  { id: "green", label: "Green", bg: "bg-emerald-500", dot: "bg-emerald-500" },
  { id: "red", label: "Red", bg: "bg-red-500", dot: "bg-red-400" },
  { id: "purple", label: "Purple", bg: "bg-violet-500", dot: "bg-violet-500" },
  { id: "amber", label: "Amber", bg: "bg-amber-500", dot: "bg-amber-400" },
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

function colorDot(color: string) {
  return COLORS.find((c) => c.id === color)?.dot ?? "bg-zinc-500";
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface NewEventForm {
  title: string;
  description: string;
  date: string;
  time: string;
  color: string;
  allDay: boolean;
}

const EMPTY_FORM: NewEventForm = {
  title: "",
  description: "",
  date: "",
  time: "09:00",
  color: "zinc",
  allDay: false,
};

export function CalendarPanel() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(today);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewEventForm>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Fetch events for visible month range (prev + curr + next)
  const fetchEvents = useCallback(async () => {
    const from = new Date(year, month - 1, 1).toISOString();
    const to = new Date(year, month + 2, 0, 23, 59, 59).toISOString();

    // Fetch local events
    const localRes = await fetch(`/api/workspace/events?from=${from}&to=${to}`);
    const localData = await localRes.json();
    const localEvents: CalEvent[] = (localData.events || []).map((e: any) => ({ ...e, source: "local" }));

    // Fetch Google Calendar events
    let googleEvents: CalEvent[] = [];
    try {
      const gRes = await fetch(`/api/calendar/events?from=${from}&to=${to}`);
      const gData = await gRes.json();
      setGoogleConnected(gData.connected ?? false);
      googleEvents = (gData.events || []).map((e: any) => ({
        id: `g-${e.id}`,
        title: e.title,
        description: e.description,
        startAt: e.startAt,
        endAt: e.endAt,
        allDay: e.allDay,
        color: "blue",
        source: "google",
      }));
    } catch {
      setGoogleConnected(false);
    }

    setEvents([...localEvents, ...googleEvents]);
  }, [year, month]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Build calendar grid
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: { day: number; thisMonth: boolean; date: Date }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, thisMonth: false, date: new Date(year, month - 1, daysInPrev - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, thisMonth: true, date: new Date(year, month, d) });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, thisMonth: false, date: new Date(year, month + 1, next - 1) });
  }

  // Events by date key
  const eventsByKey: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const k = toDateKey(new Date(e.startAt));
    if (!eventsByKey[k]) eventsByKey[k] = [];
    eventsByKey[k].push(e);
  }

  const selectedKey = selectedDay ? toDateKey(selectedDay) : null;
  const selectedEvents = selectedKey ? (eventsByKey[selectedKey] ?? []) : [];

  const openNewForm = (date?: Date) => {
    const d = date ?? selectedDay ?? today;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setForm({ ...EMPTY_FORM, date: `${yyyy}-${mm}-${dd}` });
    setShowForm(true);
  };

  const createEvent = async () => {
    if (!form.title.trim() || !form.date) return;
    setIsCreating(true);
    const startAt = form.allDay
      ? new Date(`${form.date}T00:00:00`).toISOString()
      : new Date(`${form.date}T${form.time}:00`).toISOString();

    // Create in local workspace
    const res = await fetch("/api/workspace/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, description: form.description, startAt, allDay: form.allDay, color: form.color }),
    });
    const data = await res.json();
    if (data.event) {
      setEvents((prev) => [...prev, data.event]);
    }

    // Also create in Google Calendar if connected
    if (googleConnected) {
      try {
        await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: form.title, startAt, description: form.description, allDay: form.allDay }),
        });
      } catch {
        console.warn("Failed to sync event to Google Calendar");
      }
    }

    setShowForm(false);
    setForm(EMPTY_FORM);
    setIsCreating(false);
  };

  const deleteEvent = async (id: string) => {
    await fetch(`/api/workspace/events/${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isSelected = (date: Date) =>
    selectedDay &&
    date.getDate() === selectedDay.getDate() &&
    date.getMonth() === selectedDay.getMonth() &&
    date.getFullYear() === selectedDay.getFullYear();

  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 border-b border-zinc-100 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-800 w-36 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          onClick={() => openNewForm()}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 px-2.5 py-1.5 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
      </div>

      {/* Calendar grid */}
      <div className="px-3 pt-3 shrink-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-zinc-400 py-1">{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell, i) => {
            const key = toDateKey(cell.date);
            const cellEvents = eventsByKey[key] ?? [];
            const active = isSelected(cell.date);
            const todayCell = isToday(cell.date);
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(cell.date)}
                className={`relative flex flex-col items-center py-1 rounded-lg transition-all ${
                  active
                    ? "bg-zinc-900"
                    : todayCell
                    ? "bg-zinc-100"
                    : "hover:bg-zinc-50"
                }`}
              >
                <span
                  className={`text-[12px] font-medium leading-none ${
                    !cell.thisMonth
                      ? "text-zinc-300"
                      : active
                      ? "text-white"
                      : todayCell
                      ? "text-zinc-900 font-bold"
                      : "text-zinc-700"
                  }`}
                >
                  {cell.day}
                </span>
                {/* Event dots */}
                {cellEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-[28px]">
                    {cellEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`w-1 h-1 rounded-full ${active ? "bg-white/70" : colorDot(e.color)}`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="h-px bg-zinc-100 mt-3" />
      </div>
      {/* Google Calendar connect banner */}
      {googleConnected === false && (
        <div className="mx-3 mt-2 p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center gap-2.5">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-500 leading-relaxed">Connect Google for real calendar events</p>
          </div>
          <a
            href={`/api/auth/connect?connection=google-oauth2&returnTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
            className="text-[10px] font-semibold text-zinc-700 hover:text-zinc-900 whitespace-nowrap"
          >
            Connect
          </a>
        </div>
      )}

      {/* Day events / form */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3">
        {showForm ? (
          /* ── New event form ── */
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">New event</span>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Event title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-400"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-400"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="flex-1 text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 transition-colors text-zinc-700"
              />
              {!form.allDay && (
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-24 text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 transition-colors text-zinc-700"
                />
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
                className="rounded"
              />
              <span className="text-xs text-zinc-600">All day</span>
            </label>
            {/* Color picker */}
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setForm({ ...form, color: c.id })}
                  className={`w-5 h-5 rounded-full ${c.dot} transition-transform ${form.color === c.id ? "ring-2 ring-offset-1 ring-zinc-400 scale-110" : "opacity-60 hover:opacity-100"}`}
                  title={c.label}
                />
              ))}
            </div>
            <button
              onClick={createEvent}
              disabled={!form.title.trim() || !form.date || isCreating}
              className="w-full bg-zinc-900 text-white text-sm py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? "Creating..." : "Create event"}
            </button>
          </div>
        ) : selectedDay ? (
          /* ── Selected day events ── */
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <button
                onClick={() => openNewForm(selectedDay)}
                className="text-[11px] text-zinc-400 hover:text-zinc-700 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <p className="text-xs text-zinc-400">No events</p>
                <button
                  onClick={() => openNewForm(selectedDay)}
                  className="mt-3 text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-400 px-3 py-1.5 rounded-lg transition-all"
                >
                  Add an event
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-2.5 p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 group"
                  >
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colorDot(evt.color)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-800 truncate">{evt.title}</p>
                      {!evt.allDay && (
                        <p className="text-[11px] text-zinc-400">{formatTime(evt.startAt)}</p>
                      )}
                      {evt.description && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{evt.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteEvent(evt.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-red-400 rounded-md transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

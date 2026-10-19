// Small date/time helpers. The demo clock = real time + an offset the
// presenter can fast-forward (Demo controls → "Skip ahead 30 min").

export const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const fromMin = (m: number) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;

export const nowFrom = (offsetMin: number) => new Date(Date.now() + offsetMin * 60000);

export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export const at = (date: string, time: string) => new Date(`${date}T${time}:00`);

export const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

export function fmtTime(t: string | Date) {
  const d = typeof t === "string" ? (t.length <= 5 ? at("2000-01-01", t) : new Date(t)) : t;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDay(d: string | Date) {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d;
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export function fmtShortDay(d: string | Date) {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function relative(iso: string, now: Date) {
  const diff = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export const greeting = (d: Date) => {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const uid = (p = "id") => `${p}-${Math.random().toString(36).slice(2, 9)}`;

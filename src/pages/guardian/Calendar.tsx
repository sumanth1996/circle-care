import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Plus, Stethoscope, FlaskConical, Pill, ClipboardList, MapPin, Car, Info, CheckCircle2, XCircle, CalendarDays, type LucideIcon } from "lucide-react";
import { useStore, useCan } from "../../data/store";
import { clock, nameOf, todayOf } from "../../data/selectors";
import { Avatar, Sheet, useToast } from "../../components/ui";
import type { Appointment, AppointmentKind } from "../../data/types";
import { addDays, fmtDay, fmtTime, fromMin, pad, toMin, ymd } from "../../lib/time";
import "./calendar.css";

// Categorical colors in fixed order (dataviz validator: all checks pass on light; contrast WARN
// is relieved by an icon + text label on every chip and in the legend).
export const KINDS: Record<AppointmentKind, { label: string; plural: string; color: string; soft: string; icon: LucideIcon }> = {
  doctor: { label: "Doctor visit", plural: "doctor visits", color: "#2a78d6", soft: "#eaf2fc", icon: Stethoscope },
  refill: { label: "Pharmacy refill", plural: "refills", color: "#eb6834", soft: "#fdf0ea", icon: Pill },
  lab: { label: "Lab test", plural: "lab tests", color: "#1baf7a", soft: "#e8f7f1", icon: FlaskConical },
  review: { label: "Medication review", plural: "med reviews", color: "#eda100", soft: "#fdf5e3", icon: ClipboardList },
};
const ORDER: AppointmentKind[] = ["doctor", "refill", "lab", "review"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const sortAppts = (a: Appointment, b: Appointment) => (a.date + a.time).localeCompare(b.date + b.time);
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
const whenText = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`);

/** CC-94 – CC-98: month calendar of medication-related appointments for the guardian. */
export default function Calendar() {
  const { state, actions } = useStore();
  const canEdit = useCan("write", "appointments");
  const toast = useToast();
  const now = clock(state);
  const today = todayOf(state);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<Partial<Appointment> | null>(null);

  useEffect(() => { actions.logView("the appointment calendar"); }, [actions]);

  const appts = useMemo(() => [...state.appointments].sort(sortAppts), [state.appointments]);
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appts) m.set(a.date, [...(m.get(a.date) ?? []), a]);
    return m;
  }, [appts]);

  const first = month;
  const start = addDays(first, -first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const monthKey = `${first.getFullYear()}-${pad(first.getMonth() + 1)}`;
  const inMonth = appts.filter((a) => a.date.startsWith(monthKey) && a.status !== "cancelled");
  const upcoming = appts.filter((a) => a.status === "scheduled" && (a.date > today || (a.date === today && toMin(a.time) + a.durationMin >= toMin(fromMin(now.getHours() * 60 + now.getMinutes())))));
  const next = upcoming[0];
  const dayAppts = byDay.get(selected) ?? [];

  const go = (delta: number) => setMonth(new Date(first.getFullYear(), first.getMonth() + delta, 1));
  const medNames = (ids: string[]) => ids.map((id) => state.meds.find((m) => m.id === id)?.name).filter(Boolean).join(", ");

  return (
    <div className="page cal-page stack" style={{ "--gap": "18px" } as CSSProperties}>
      <div className="page-head">
        <div><p className="page-kicker">Maggie's medication appointments</p><h1>Calendar</h1></div>
        {canEdit && <button className="btn" onClick={() => setEditing({ date: selected >= today ? selected : today, time: "10:00", durationMin: 30, kind: "doctor", medIds: [] })}><Plus size={18} /> Add appointment</button>}
      </div>

      {next && (
        <button className="cal-next" style={{ "--k": KINDS[next.kind].color, "--ks": KINDS[next.kind].soft } as CSSProperties} onClick={() => { setSelected(next.date); setMonth(new Date(Number(next.date.slice(0, 4)), Number(next.date.slice(5, 7)) - 1, 1)); }}>
          <span className="cal-next-icon">{(() => { const I = KINDS[next.kind].icon; return <I size={26} />; })()}</span>
          <span className="grow">
            <span className="cal-next-k">Up next · {whenText(daysBetween(today, next.date))}</span>
            <b className="cal-next-title">{next.title}</b>
            <span className="cal-next-sub">{fmtDay(next.date)} at {fmtTime(next.time)} · {next.provider}{next.escortId ? ` · ${nameOf(state, next.escortId)} is taking her` : ""}</span>
          </span>
          {upcoming.length > 1 && <span className="cal-next-more tiny">then {upcoming.slice(1, 3).map((a) => `${a.title.split(" ").slice(0, 3).join(" ")} (${whenText(daysBetween(today, a.date)).toLowerCase()})`).join(" · ")}</span>}
        </button>
      )}

      <div className="cal-wrap">
        <section className="cal panel" aria-label={`${first.toLocaleDateString([], { month: "long", year: "numeric" })} calendar`}>
          <div className="cal-toolbar">
            <h2 className="cal-month">{first.toLocaleDateString([], { month: "long" })} <span>{first.getFullYear()}</span></h2>
            <div className="row" style={{ "--gap": "6px" } as CSSProperties}>
              <button className="btn plain sm" onClick={() => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(today); }}>Today</button>
              <button className="btn plain sm cal-arrow" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
              <button className="btn plain sm cal-arrow" aria-label="Next month" onClick={() => go(1)}><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="cal-legend" aria-label="This month">
            {ORDER.map((k) => {
              const n = inMonth.filter((a) => a.kind === k).length;
              const I = KINDS[k].icon;
              return <span key={k} className={n ? "" : "zero"}><i style={{ background: KINDS[k].color }} /><I size={14} aria-hidden="true" /> <b>{n}</b> {n === 1 ? KINDS[k].label.toLowerCase() : KINDS[k].plural}</span>;
            })}
          </div>

          <div className="cal-grid" role="grid">
            <div className="cal-row cal-head" role="row">{WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}</div>
            {Array.from({ length: weeks }, (_, w) => (
              <div key={w} className="cal-row" role="row">
                {cells.slice(w * 7, w * 7 + 7).map((d) => {
                  const key = ymd(d);
                  const list = (byDay.get(key) ?? []).filter((a) => a.status !== "cancelled");
                  const out = d.getMonth() !== first.getMonth();
                  const past = key < today;
                  const label = `${fmtDay(key)}${list.length ? `, ${list.length} appointment${list.length > 1 ? "s" : ""}: ${list.map((a) => `${KINDS[a.kind].label} ${fmtTime(a.time)}`).join(", ")}` : ", no appointments"}`;
                  return (
                    <button
                      key={key}
                      role="gridcell"
                      aria-selected={selected === key}
                      aria-label={label}
                      className={`cal-cell ${out ? "out" : ""} ${past ? "past" : ""} ${key === today ? "today" : ""} ${selected === key ? "sel" : ""} ${d.getDay() % 6 === 0 ? "wkend" : ""}`}
                      onClick={() => { setSelected(key); if (out) setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                    >
                      <span className="cal-num">{d.getDate()}</span>
                      <span className="cal-chips">
                        {list.slice(0, 3).map((a) => {
                          const I = KINDS[a.kind].icon;
                          return (
                            <span key={a.id} className={`cal-chip ${a.status}`} style={{ "--k": KINDS[a.kind].color, "--ks": KINDS[a.kind].soft } as CSSProperties}>
                              <span className="cal-chip-top"><I size={12} aria-hidden="true" /><span className="cal-chip-t">{fmtTime(a.time).replace(":00", "").replace(" ", "").toLowerCase()}</span></span><span className="cal-chip-n">{a.title}</span>
                            </span>
                          );
                        })}
                        {list.length > 3 && <span className="cal-more">+{list.length - 3} more</span>}
                      </span>
                      <span className="cal-dots" aria-hidden="true">{list.map((a) => <i key={a.id} style={{ background: KINDS[a.kind].color }} />)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <aside className="cal-day panel" aria-live="polite" aria-label="Selected day">
          <p className="page-kicker">{selected < today ? `${-daysBetween(today, selected)} days ago` : whenText(daysBetween(today, selected))}</p>
          <h2 className="t-md">{fmtDay(selected)}</h2>
          {dayAppts.length === 0 && (
            <div className="cal-empty"><CalendarDays size={28} color="var(--muted)" /><p className="muted">No appointments.</p>{canEdit && <button className="btn sm secondary" onClick={() => setEditing({ date: selected, time: "10:00", durationMin: 30, kind: "doctor", medIds: [] })}><Plus size={16} /> Add one</button>}</div>
          )}
          <div className="stack" style={{ "--gap": "12px" } as CSSProperties}>
            {dayAppts.map((a) => {
              const K = KINDS[a.kind];
              const I = K.icon;
              return (
                <article key={a.id} className={`appt ${a.status}`} style={{ "--k": K.color, "--ks": K.soft } as CSSProperties}>
                  <div className="appt-head">
                    <span className="appt-kind"><I size={14} aria-hidden="true" /> {K.label}</span>
                    {a.status !== "scheduled" && <span className={`badge ${a.status === "done" ? "green" : "red"}`}>{a.status === "done" ? "Done" : "Cancelled"}</span>}
                  </div>
                  <b className="appt-title">{a.title}</b>
                  <span className="appt-time">{fmtTime(a.time)} – {fmtTime(fromMin(toMin(a.time) + a.durationMin))}</span>
                  <ul className="appt-facts">
                    <li><MapPin size={15} aria-hidden="true" /> {a.provider} · {a.location}</li>
                    {a.medIds.length > 0 && <li><Pill size={15} aria-hidden="true" /> About: {medNames(a.medIds)}</li>}
                    {a.escortId && <li><Car size={15} aria-hidden="true" /> <Avatar m={state.members.find((m) => m.id === a.escortId)} size={20} /> {nameOf(state, a.escortId)} is taking her</li>}
                    {a.prep && <li className="prep"><Info size={15} aria-hidden="true" /> {a.prep}</li>}
                  </ul>
                  {canEdit && a.status === "scheduled" && (
                    <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
                      <button className="btn sm plain" onClick={() => setEditing(a)}>Edit</button>
                      {a.date <= today && <button className="btn sm secondary" onClick={() => { actions.setAppointmentStatus(a.id, "done"); toast("Marked as done"); }}><CheckCircle2 size={16} /> Done</button>}
                      <button className="btn sm plain" onClick={() => { actions.setAppointmentStatus(a.id, "cancelled"); toast("Appointment cancelled"); }}><XCircle size={16} /> Cancel</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </aside>
      </div>

      {editing && <ApptSheet initial={editing} onClose={() => setEditing(null)} onSave={(a) => { actions.saveAppointment(a); setEditing(null); setSelected(a.date); setMonth(new Date(Number(a.date.slice(0, 4)), Number(a.date.slice(5, 7)) - 1, 1)); toast(a.id ? "Appointment updated" : "Appointment added — Maggie will see it"); }} />}
    </div>
  );
}

function ApptSheet({ initial, onClose, onSave }: { initial: Partial<Appointment>; onClose: () => void; onSave: (a: Omit<Appointment, "id" | "createdBy" | "status"> & { id?: string }) => void }) {
  const { state } = useStore();
  const [f, setF] = useState({
    id: initial.id, title: initial.title ?? "", kind: initial.kind ?? "doctor", date: initial.date ?? todayOf(state), time: initial.time ?? "10:00",
    durationMin: initial.durationMin ?? 30, provider: initial.provider ?? "", location: initial.location ?? "", medIds: initial.medIds ?? [],
    escortId: initial.escortId ?? "", prep: initial.prep ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const ok = f.title.trim() && f.date && f.time && f.provider.trim();
  const people = state.members.filter((m) => m.role !== "elder" && m.status === "active");
  return (
    <Sheet title={f.id ? "Edit appointment" : "New appointment"} onClose={onClose}>
      <form className="stack" style={{ "--gap": "12px" } as CSSProperties} onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ ...f, title: f.title.trim(), provider: f.provider.trim(), location: f.location.trim(), escortId: f.escortId || undefined, prep: f.prep.trim() || undefined }); }}>
        <fieldset className="kind-pick">
          <legend className="sr-only">Type</legend>
          {ORDER.map((k) => {
            const I = KINDS[k].icon;
            return <label key={k} className={f.kind === k ? "on" : ""} style={{ "--k": KINDS[k].color, "--ks": KINDS[k].soft } as CSSProperties}><input type="radio" name="kind" checked={f.kind === k} onChange={() => set("kind", k)} /><I size={16} aria-hidden="true" /> {KINDS[k].label}</label>;
          })}
        </fieldset>
        <label className="field"><span>What</span><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Diabetes follow-up" required /></label>
        <div className="grid-3">
          <label className="field"><span>Date</span><input className="input" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} required /></label>
          <label className="field"><span>Time</span><input className="input" type="time" value={f.time} onChange={(e) => set("time", e.target.value)} required /></label>
          <label className="field"><span>Length</span><select className="input" value={f.durationMin} onChange={(e) => set("durationMin", +e.target.value)}>{[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}</select></label>
        </div>
        <label className="field"><span>With (doctor, lab or pharmacy)</span><input className="input" value={f.provider} onChange={(e) => set("provider", e.target.value)} required /></label>
        <label className="field"><span>Where</span><input className="input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. 1840 Irving St, San Francisco, CA — or phone / video" /></label>
        <fieldset className="field">
          <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Which medicines is it about?</legend>
          <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
            {state.meds.map((m) => (
              <label key={m.id} className={`pill-check ${f.medIds.includes(m.id) ? "on" : ""}`}>
                <input type="checkbox" checked={f.medIds.includes(m.id)} onChange={(e) => set("medIds", e.target.checked ? [...f.medIds, m.id] : f.medIds.filter((x) => x !== m.id))} /> {m.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field"><span>Who's taking her?</span><select className="input" value={f.escortId} onChange={(e) => set("escortId", e.target.value)}><option value="">No one needed</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="field"><span>How to prepare (optional)</span><textarea className="input" rows={2} value={f.prep} onChange={(e) => set("prep", e.target.value)} placeholder="e.g. No food after midnight" /></label>
        <button className="btn lg block" disabled={!ok}>{f.id ? "Save changes" : "Add to calendar"}</button>
        <p className="tiny">Maggie sees every appointment in her app. If you pick a caregiver to take her, they're notified.</p>
      </form>
    </Sheet>
  );
}

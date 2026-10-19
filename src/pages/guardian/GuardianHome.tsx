import { Link } from "react-router-dom";
import { useEffect } from "react";
import { Sun, Pill, ListChecks, UserRound, Bell, ChevronRight, AlertTriangle, Siren, CalendarX2, CheckCircle2, ClipboardList, Clock3, HeartPulse, CalendarHeart } from "lucide-react";
import { useStore, GUARDIAN } from "../../data/store";
import { can } from "../../data/policy";
import { readingsFor, detectEvents } from "../../lib/health";
import { clock, dosesFor, tasksFor, checkinToday, checkinMissed, caregiverOnShift, alertsFor, pendingApprovals, lateCheckins, coverageGaps, member, nameOf, feed, activeSos, northStar, checkinStreak, todayOf } from "../../data/selectors";
import { Avatar, Ring } from "../../components/ui";
import { fmtTime, greeting, fmtShortDay, relative } from "../../lib/time";
import "./guardian.css";

/** CC-61 "today at a glance" dashboard. */
export default function GuardianHome() {
  const { state, actions } = useStore();
  const now = clock(state);
  const doses = dosesFor(state).filter((d) => d.state !== "upcoming");
  const taken = doses.filter((d) => d.state === "taken").length;
  const allDoses = dosesFor(state).length;
  const tasks = tasksFor(state);
  const tasksDone = tasks.filter((t) => t.done).length;
  const ci = checkinToday(state);
  const cg = caregiverOnShift(state);
  const unread = alertsFor(state, "guardian").filter((a) => !a.read.includes("guardian")).length;
  const elder = member(state, state.elderId);
  const sos = activeSos(state);

  useEffect(() => { actions.logView("the dashboard"); }, [actions]);

  // Health and calendar tiles (CC-84, CC-94).
  const health = (() => {
    if (!can(state, GUARDIAN, "read", "vitals")) return null;
    const r = readingsFor(todayOf(state), now, state.settings.vitals.intervalMin, state.health.overrides);
    const last = r.at(-1);
    return last ? { hr: last.hr, spo2: last.spo2, events: detectEvents(r, state.settings.vitals.thresholds).length } : null;
  })();
  const nextAppt = [...state.appointments].filter((a) => a.status === "scheduled" && a.date >= todayOf(state)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  type Attn = { key: string; icon: typeof AlertTriangle; color: string; title: string; sub: string; to: string };
  const attention: Attn[] = [];
  if (sos) attention.push({ key: "sos", icon: Siren, color: "var(--red)", title: "Maggie pressed SOS", sub: `${fmtTime(sos.startedAt)} · ${sos.status === "active" ? "No one has responded yet" : `${nameOf(state, sos.responderId)} is responding`}`, to: "/app/guardian/sos" });
  for (const d of dosesFor(state).filter((d) => d.state === "escalated" || d.state === "late")) attention.push({ key: d.key, icon: Pill, color: d.state === "escalated" ? "var(--red)" : "var(--elder)", title: `${d.med.name} not confirmed`, sub: `Due ${fmtTime(d.time)} · ${d.minutesLate} min ago${d.med.critical ? " · high priority" : ""}`, to: "/app/guardian/feed" });
  if (checkinMissed(state)) attention.push({ key: "ci", icon: Sun, color: "var(--elder)", title: "Maggie hasn't checked in", sub: `Window ended at ${fmtTime(state.settings.checkinWindow.end)} — consider calling`, to: "/app/guardian/feed" });
  for (const s of lateCheckins(state)) attention.push({ key: `late-${s.id}`, icon: Clock3, color: "var(--elder)", title: `${nameOf(state, s.caregiverId)} hasn't arrived`, sub: `Shift started at ${fmtTime(s.start)}`, to: "/app/guardian/schedule" });
  // CC-59: hand-offs nobody has read yet.
  for (const h of state.handoffs.filter((h) => !h.acknowledgedAt && now.getTime() - new Date(h.at).getTime() < 3 * 86400000)) attention.push({ key: `ho-${h.id}`, icon: ClipboardList, color: "var(--care)", title: `${nameOf(state, h.by)}'s hand-off hasn't been read`, sub: `Sent ${relative(h.at, now)} · the next caregiver will see it when they check in`, to: "/app/guardian/feed" });
  const pend = pendingApprovals(state);
  if (pend.length) attention.push({ key: "ap", icon: ClipboardList, color: "var(--guard)", title: `${pend.length} ${pend.length === 1 ? "request needs" : "requests need"} your approval`, sub: pend.map((p) => p.title).join(" · "), to: "/app/guardian/approvals" });
  const gaps = coverageGaps(state, 7);
  if (gaps.length) attention.push({ key: "gaps", icon: CalendarX2, color: "var(--muted)", title: `${gaps.length} uncovered ${gaps.length === 1 ? "shift" : "shifts"} this week`, sub: `Next: ${fmtShortDay(gaps[0].date)}, ${fmtTime(gaps[0].shift.start)}–${fmtTime(gaps[0].shift.end)}`, to: "/app/guardian/schedule" });

  return (
    <div className="page">
      <div className="g-hero">
        <Avatar m={elder} size={76} />
        <div className="grow">
          <p className="page-kicker">{greeting(now)}, Sarah</p>
          <h1 className="g-hero-title">{attention.length === 0 ? "Maggie's day is on track." : attention.length === 1 ? "One thing needs you." : `${attention.length} things need you.`}</h1>
          <p className="muted">North Star this week: <b style={{ color: "var(--ink)" }}>{northStar(state)}</b> verified care tasks completed on time.</p>
        </div>
      </div>

      <div className="tiles">
        <Link to="/app/guardian/feed" className="tile-s">
          <span className="row between"><span className="tile-k"><Sun size={16} /> Check-in</span>{ci ? <CheckCircle2 color="var(--green)" size={22} /> : null}</span>
          <span className="tile-v">{ci ? `I'm OK ${ci.mood ?? ""}` : checkinMissed(state) ? "Missed" : "Not yet"}</span>
          <span className="tile-sub">{ci ? `at ${fmtTime(ci.at)} · ${checkinStreak(state)}-day streak` : `Window ${fmtTime(state.settings.checkinWindow.start)}–${fmtTime(state.settings.checkinWindow.end)}`}</span>
        </Link>
        <Link to="/app/guardian/meds" className="tile-s">
          <span className="tile-k"><Pill size={16} /> Medicines</span>
          <span className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
            <Ring value={doses.length ? taken / doses.length : 1} size={52} stroke={7}><b style={{ fontSize: 13 }}>{taken}/{doses.length}</b></Ring>
            <span><span className="tile-v" style={{ display: "block" }}>{taken} given</span><span className="tile-sub">{allDoses - doses.length} still to come today</span></span>
          </span>
        </Link>
        <Link to="/app/guardian/feed" className="tile-s">
          <span className="tile-k"><ListChecks size={16} /> Tasks</span>
          <span className="tile-v">{tasksDone} of {tasks.length} done</span>
          <span className="tile-sub">{tasks.filter((t) => !t.done).slice(0, 2).map((t) => t.task.title).join(", ") || "All done"}</span>
        </Link>
        <Link to="/app/guardian/schedule" className="tile-s">
          <span className="tile-k"><UserRound size={16} /> With Maggie now</span>
          {cg ? <span className="row"><Avatar m={cg} size={34} /><span className="tile-v">{cg.short}</span></span> : <span className="tile-v">No one</span>}
          <span className="tile-sub">{cg ? `Checked in at ${fmtTime(state.visits.find((v) => v.caregiverId === cg.id && !v.checkOut)?.checkIn ?? now)}` : "Next shift on the schedule"}</span>
        </Link>
        {health && (
          <Link to="/app/guardian/health" className="tile-s">
            <span className="row between"><span className="tile-k"><HeartPulse size={16} /> Health</span>{health.events ? <AlertTriangle color="#d03b3b" size={20} /> : null}</span>
            <span className="tile-v">{health.hr} bpm · {health.spo2}%</span>
            <span className="tile-sub">{health.events ? `${health.events} unusual ${health.events === 1 ? "reading" : "readings"} today` : "Heart rate and oxygen in usual range"}</span>
          </Link>
        )}
        <Link to="/app/guardian/calendar" className="tile-s">
          <span className="tile-k"><CalendarHeart size={16} /> Next appointment</span>
          <span className="tile-v">{nextAppt ? nextAppt.title : "None scheduled"}</span>
          <span className="tile-sub">{nextAppt ? `${nextAppt.date === todayOf(state) ? "Today" : fmtShortDay(nextAppt.date)} at ${fmtTime(nextAppt.time)}` : "Add one in Calendar"}</span>
        </Link>
        <Link to="/app/guardian/alerts" className="tile-s">
          <span className="tile-k"><Bell size={16} /> Alerts</span>
          <span className="tile-v">{unread ? `${unread} new` : "None new"}</span>
          <span className="tile-sub">Notifications never show health details</span>
        </Link>
      </div>

      {attention.length > 0 && (
        <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <h2 className="section-title">Needs your attention</h2>
          <div className="list">
            {attention.map((a) => (
              <Link key={a.key} to={a.to} className="list-row has-icon">
                <span className="icon-tile" style={{ background: a.color }}><a.icon size={20} /></span>
                <span className="grow"><span className="list-title" style={{ display: "block" }}>{a.title}</span><span className="list-sub">{a.sub}</span></span>
                <ChevronRight size={20} color="var(--faint)" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <div className="section-head"><h2 className="section-title">Latest activity</h2><Link to="/app/guardian/feed" className="small">See all</Link></div>
        <div className="list">
          {feed(state).slice(0, 6).map((f, i) => (
            <div key={i} className="list-row">
              <Avatar m={member(state, f.by)} size={34} />
              <span className="grow"><b>{nameOf(state, f.by)}</b> <span className="muted">· {f.text}</span></span>
              <span className="tiny" style={{ whiteSpace: "nowrap" }}>{relative(f.at, now)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

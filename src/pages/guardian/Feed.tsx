import { useEffect, useMemo, useState } from "react";
import { Pill, ListChecks, LogIn, StickyNote, Siren, Sun, CheckCircle2, ClipboardCheck } from "lucide-react";
import { useStore } from "../../data/store";
import { feed, clock, nameOf } from "../../data/selectors";
import { Segmented, Empty } from "../../components/ui";
import { fmtDay, fmtTime, ymd, addDays } from "../../lib/time";

const icon = { dose: Pill, task: ListChecks, visit: LogIn, note: StickyNote, sos: Siren, checkin: Sun, approval: CheckCircle2, handoff: ClipboardCheck };
type Kind = keyof typeof icon | "all";

/** CC-62 chronological activity feed with filters by type and date. */
export default function Feed() {
  const { state, actions } = useStore();
  const [kind, setKind] = useState<Kind>("all");
  const [range, setRange] = useState<"today" | "week" | "all">("week");
  const now = clock(state);

  useEffect(() => { actions.logView("the activity feed"); }, [actions]);

  const items = useMemo(() => {
    const from = range === "today" ? ymd(now) : range === "week" ? ymd(addDays(now, -6)) : "0000";
    return feed(state).filter((f) => (kind === "all" || f.kind === kind) && f.at.slice(0, 10) >= from && ymd(new Date(f.at)) >= from);
  }, [state, kind, range, now]);

  const byDay = items.reduce<Record<string, typeof items>>((acc, f) => { const d = ymd(new Date(f.at)); (acc[d] ??= []).push(f); return acc; }, {});

  return (
    <div className="page narrow stack">
      <div className="page-head"><div><p className="page-kicker">Everything that happened</p><h1>Activity</h1></div></div>
      <div className="row wrap" style={{ "--gap": "10px" } as React.CSSProperties}>
        <Segmented label="Date range" value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "week", label: "7 days" }, { value: "all", label: "All" }]} />
        <select className="input" style={{ width: "auto", minHeight: 36, padding: "6px 12px", fontSize: 15 }} value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Type">
          <option value="all">All types</option><option value="dose">Medicines</option><option value="task">Tasks</option><option value="visit">Visits</option><option value="handoff">Hand-offs</option><option value="checkin">Check-ins</option><option value="note">Notes</option><option value="sos">SOS</option><option value="approval">Approvals</option>
        </select>
      </div>
      {items.length === 0 && <Empty>Nothing here for these filters.</Empty>}
      {Object.entries(byDay).map(([d, list]) => (
        <section key={d} className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
          <h2 className="small" style={{ color: "var(--muted)", fontWeight: 600 }}>{d === ymd(now) ? "Today" : fmtDay(d)}</h2>
          <div className="list">
            {list.map((f, i) => {
              const I = icon[f.kind];
              const color = f.tone === "bad" ? "var(--red)" : f.tone === "warn" ? "var(--elder)" : f.tone === "good" ? "var(--green)" : "var(--blue)";
              return (
                <div key={i} className="list-row has-icon" style={{ alignItems: "flex-start" }}>
                  <span className="icon-tile" style={{ background: color }}><I size={18} /></span>
                  <span className="grow"><span style={{ display: "block" }}>{f.text}</span><span className="tiny">{nameOf(state, f.by)} · {fmtTime(f.at)}</span></span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

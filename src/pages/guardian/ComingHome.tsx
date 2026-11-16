import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Home, Plus, Pencil, Trash2, CalendarPlus, CheckCircle2, Clock, Circle, EyeOff, Archive } from "lucide-react";
import { useStore } from "../../data/store";
import { clock, member } from "../../data/selectors";
import { activePlan, followUpBooked, followUpEnd, itemState, planPeople, FOLLOW_UP_CHOICES, PLAN_ITEM_MAX } from "../../data/comingHome";
import { phiHint } from "../../data/everyday";
import { GUARDIAN } from "../../data/demo";
import type { ComingHome as Plan, PlanItem } from "../../data/types";
import { Segmented, Sheet, useToast } from "../../components/ui";
import { HealthHint } from "../../components/chat";
import { addDays, fmtDay, fmtShortDay, ymd } from "../../lib/time";
import "../../components/sprint17.css";

const TONE_ICON = { done: CheckCircle2, waiting: Clock, open: Circle };

/**
 * CC-213, CC-214: Sarah's Coming Home plan. Four starting items she can change, each given to someone as a
 * help request. There's no field for why Maggie was in hospital, and others see only what's given to them.
 */
export default function ComingHome() {
  const { state, actions } = useStore();
  const toast = useToast();
  const plan = activePlan(state);
  const archived = (state.plans ?? []).filter((p) => p.archived);
  const [dateSheet, setDateSheet] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { actions.logView("the coming-home plan"); }, [actions]);

  return (
    <div className="page narrow stack coming" style={{ "--gap": "18px" } as CSSProperties}>
      <div className="page-head">
        <div><p className="page-kicker">Maggie's circle</p><h1>Coming home</h1></div>
        {plan && <button className="btn secondary" onClick={() => setDateSheet(true)}>Change day</button>}
      </div>

      {!plan ? (
        <section className="panel stack coming-start" style={{ "--gap": "12px" } as CSSProperties}>
          <Home size={34} color="var(--blue)" />
          <b>Plan the first days after a hospital stay</b>
          <p className="muted small">Pick the day Maggie comes home. You get a short plan: medicines, a follow-up visit, the home and the first night. Give each item to someone and it goes on their Help board.</p>
          <button className="btn lg" onClick={() => setDateSheet(true)}><Home size={20} /> Maggie's coming home</button>
        </section>
      ) : (
        <>
          <section className="panel coming-day" aria-label="Coming-home day">
            <span className="k">Maggie comes home</span>
            <b>{fmtDay(plan.date)}</b>
            <p className="tiny"><EyeOff size={13} style={{ verticalAlign: "-2px" }} /> There's no place here for why Maggie was in hospital. Each person sees only the item you give them.</p>
          </section>

          <ul className="coming-items" aria-label="Plan">
            {plan.items.map((it) => <PlanRow key={it.id} plan={plan} it={it} onEdit={() => setEditing(it)} />)}
          </ul>
          <button className="btn secondary" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}><Plus size={18} /> Add an item</button>

          <FollowUp plan={plan} />
        </>
      )}

      {archived.length > 0 && (
        <details className="panel help-history">
          <summary><Archive size={18} /> Past plans <span className="tiny">Read only</span></summary>
          <ul>{archived.map((p) => <li key={p.id}><b>Came home {fmtShortDay(p.date)}</b><span className="tiny" style={{ display: "block" }}>{p.items.map((i) => `${i.title}: ${itemState(state, p, i).label}`).join(" · ")}</span></li>)}</ul>
        </details>
      )}

      {dateSheet && <DateSheet initial={plan?.date ?? ymd(addDays(clock(state), 2))} onClose={() => setDateSheet(false)} onSave={(d) => { actions.startPlan(d); setDateSheet(false); toast(plan ? "Day changed" : "Plan started"); }} />}
      {editing && plan && <ItemSheet title="Change item" initial={editing.title} onClose={() => setEditing(null)} onSave={(t) => { actions.renamePlanItem(plan.id, editing.id, t); setEditing(null); toast("Item changed"); }} onRemove={() => { actions.removePlanItem(plan.id, editing.id); setEditing(null); toast("Item removed"); }} />}
      {adding && plan && <ItemSheet title="Add an item" initial="" onClose={() => setAdding(false)} onSave={(t) => { actions.addPlanItem(plan.id, t); setAdding(false); toast("Item added"); }} />}
    </div>
  );
}

function PlanRow({ plan, it, onEdit }: { plan: Plan; it: PlanItem; onEdit: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const st = itemState(state, plan, it);
  const Icon = TONE_ICON[st.tone];
  const people = planPeople(state);
  return (
    <li className={`panel coming-item ${st.tone}`} aria-label={it.title}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Icon size={22} className="coming-icon" aria-hidden="true" />
        <div className="grow">
          <b>{it.title}</b>
          <p className="small coming-state">{st.label}</p>
        </div>
        <button className="btn plain sm" aria-label={`Change ${it.title}`} onClick={onEdit}><Pencil size={16} /></button>
      </div>
      <label className="field coming-give"><span>Who has it</span>
        <select className="input" value={it.assignee ?? ""} onChange={(e) => { const v = e.target.value || null; actions.assignPlanItem(plan.id, it.id, v); toast(!v ? "Taken back" : v === GUARDIAN ? "It's yours" : `${member(state, v)?.short} will see it on their Help board`); }}>
          <option value="">No one yet</option>
          {people.map((id) => <option key={id} value={id}>{id === GUARDIAN ? "Me" : member(state, id)?.short}</option>)}
        </select>
      </label>
    </li>
  );
}

/** CC-214: the follow-up visit, from the calendar. Reminders stop as soon as one is booked in the window. */
function FollowUp({ plan }: { plan: Plan }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const follow = plan.items.find((i) => i.kind === "followup");
  if (!follow) return null;
  const appt = followUpBooked(state, plan);
  return (
    <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="coming-follow">
      <h2 id="coming-follow" className="help-h" style={{ margin: 0 }}>First follow-up visit</h2>
      {appt
        ? <p><CheckCircle2 size={18} color="var(--green)" style={{ verticalAlign: "-3px" }} /> Booked: {appt.title}, {fmtShortDay(appt.date)}</p>
        : <p><b>Not booked yet.</b> It should be by {fmtShortDay(followUpEnd(plan))}. You'll get a reminder each day at 9 AM until it is, never in your quiet hours.</p>}
      <div className="field"><span className="label">Within</span>
        <Segmented<string> label="Follow-up within" value={String(plan.followUpDays)} onChange={(v) => { actions.setFollowUpDays(plan.id, Number(v)); toast(`Within ${v} days`); }} options={FOLLOW_UP_CHOICES.map((d) => ({ value: String(d), label: `${d} days` }))} />
      </div>
      {!appt && <Link className="btn secondary" style={{ alignSelf: "flex-start" }} to="/app/guardian/calendar"><CalendarPlus size={18} /> Add it to the calendar</Link>}
    </section>
  );
}

function DateSheet({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (d: string) => void }) {
  const [d, setD] = useState(initial);
  return (
    <Sheet title="When is Maggie coming home?" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (d) onSave(d); }}>
        <label className="field"><span>Coming-home day</span><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} required /></label>
        <button className="btn lg block" disabled={!d}>Save</button>
      </form>
    </Sheet>
  );
}

/** Item names go to whoever gets the item, so they get the same health-detail check as the family chat. */
function ItemSheet({ title, initial, onClose, onSave, onRemove }: { title: string; initial: string; onClose: () => void; onSave: (t: string) => void; onRemove?: () => void }) {
  const { state } = useStore();
  const [t, setT] = useState(initial);
  const [hint, setHint] = useState<string[] | null>(null);
  if (hint) {
    return <HealthHint text={t.trim()} spotted={hint} canNote={false} onNote={() => undefined} onSend={() => onSave(t)} onEdit={() => setHint(null)} sendLabel="Save anyway" intro="Whoever gets this item sees its name. Health details are safer on Maggie's record, where her sharing choices decide who sees them." noNoteText="Edit the item to leave the health detail out, or save it anyway." />;
  }
  const save = () => { if (!t.trim()) return; const spotted = phiHint(state, t); if (spotted.length) setHint(spotted); else onSave(t); };
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field"><span>Item</span><input className="input" maxLength={PLAN_ITEM_MAX} value={t} onChange={(e) => setT(e.target.value)} placeholder="e.g. Bring dinner on the first evening" required /></label>
        <button className="btn lg block" disabled={!t.trim()}>Save</button>
        {onRemove && <button type="button" className="btn lg block plain danger-text" onClick={onRemove}><Trash2 size={18} /> Remove item</button>}
      </form>
    </Sheet>
  );
}

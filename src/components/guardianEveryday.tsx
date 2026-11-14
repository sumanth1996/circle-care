import { useState, type CSSProperties } from "react";
import { PackageCheck, PackagePlus, Truck } from "lucide-react";
import type { Medication, State } from "../data/types";
import { useStore, useCan } from "../data/store";
import { pillsLeft, daysLeft, supplyState, refillPlan, scheduledRefill } from "../data/everyday";
import { nameOf } from "../data/selectors";
import { Sheet, useToast } from "./ui";
import { fmtShortDay } from "../lib/time";
import "./everyday.css";

/* ---------------- CC-120 – CC-121: supply on the medicine card ---------------- */

export function SupplyRow({ med, state }: { med: Medication; state: State }) {
  const { actions } = useStore();
  const toast = useToast();
  const [count, setCount] = useState<string | null>(null);
  // Only show actions this person may take, so a refused change never looks like it worked.
  const canWrite = useCan("write", "supply");
  const entry = scheduledRefill(state, med);
  const left = pillsLeft(state, med);
  const days = daysLeft(state, med);
  const st = supplyState(state, med);
  const plan = refillPlan(state, med);
  const unit = med.dose.split(" ").slice(1).join(" ").replace(/s?$/, "s") || "pills";
  if (st === "untracked") {
    if (!canWrite) return null;
    return (
      <>
        <button className="btn sm plain" onClick={() => setCount("")}><PackagePlus size={15} /> Track pills on hand</button>
        {count !== null && <BottleSheet med={med} onClose={() => setCount(null)} onSave={(n) => { actions.recordRefill(med.id, n); setCount(null); toast(`${med.name}: ${n} on hand`); }} />}
      </>
    );
  }
  return (
    <div className={`supply ${st}`}>
      <div className="supply-top">
        <b>{st === "paused" ? "Paused" : `${days} ${days === 1 ? "day" : "days"} left`}</b>
        <span className="muted">{Number((left ?? 0).toFixed(1))} {unit} on hand{plan && st !== "paused" ? ` · runs out ${fmtShortDay(plan.runsOut)}` : ""}</span>
      </div>
      <div className="supply-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, ((days ?? 0) / 30) * 100)}%` }} /></div>
      {st === "low" && <p className="small" style={{ color: "#9a4f00" }}>{entry ? `Refill on the Calendar for ${fmtShortDay(entry.date)}.` : "Not on the Calendar yet."}</p>}
      {st === "requested" && <p className="small" style={{ color: "var(--blue)" }}><Truck size={14} style={{ verticalAlign: "-2px" }} /> {nameOf(state, med.supply?.requestedBy)} asked {med.supply?.pharmacy ?? "the pharmacy"} for a refill.</p>}
      <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
        {canWrite && st === "low" && <button className="btn sm" onClick={() => { actions.requestRefill(med.id); toast(`Refill of ${med.name} requested`); }}><Truck size={15} /> Request refill</button>}
        {canWrite && <button className="btn sm secondary" onClick={() => setCount("")}><PackageCheck size={15} /> New bottle</button>}
      </div>
      {count !== null && <BottleSheet med={med} onClose={() => setCount(null)} onSave={(n) => { actions.recordRefill(med.id, n); setCount(null); toast(`${med.name}: ${n} on hand`); }} />}
    </div>
  );
}

function BottleSheet({ med, onClose, onSave }: { med: Medication; onClose: () => void; onSave: (n: number) => void }) {
  const [v, setV] = useState("30");
  const n = Number(v);
  const ok = Number.isInteger(n) && n > 0 && n <= 1000;
  return (
    <Sheet title={`New bottle of ${med.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(n); }}>
        <div className="field"><label htmlFor="bottle-n">How many are in the bottle?</label>
          <input id="bottle-n" className="input" inputMode="numeric" pattern="[0-9]*" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </div>
        <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties} role="group" aria-label="Common bottle sizes">
          {[30, 60, 90].map((x) => <button key={x} type="button" className="btn sm secondary" aria-pressed={v === String(x)} onClick={() => setV(String(x))}>{x}</button>)}
        </div>
        <button className="btn lg block" disabled={!ok}>Save count</button>
        <p className="hint center">The count goes down by one each time a dose is marked taken. Skipped doses don't count.</p>
      </form>
    </Sheet>
  );
}

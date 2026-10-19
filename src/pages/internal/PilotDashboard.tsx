import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { Logo } from "../../components/Logo";
import { Segmented } from "../../components/ui";
import { npsResponses, npsScore, pilotLeads, type NpsResponse, type PilotLead } from "../../lib/pilot";
import "./internal.css";

/** Groups smaller than this are hidden so no one can be singled out (CC-77). */
export const MIN_COHORT = 5;

/** Deterministic pseudo-random numbers so the synthetic cohort is the same on every load. */
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

/** A synthetic, de-identified pilot cohort. No real people; used to design the dashboard before the pilot runs. */
function synthetic() {
  const r = rng(42);
  const personas: NpsResponse["persona"][] = ["elder", "caregiver", "guardian"];
  const nps: NpsResponse[] = [];
  for (let i = 0; i < 64; i++) {
    const persona = personas[i % 3];
    const bias = persona === "guardian" ? 2.2 : persona === "caregiver" ? 1.2 : 1.6;
    nps.push({ at: "", persona, score: Math.max(0, Math.min(10, Math.round(6 + bias + (r() - 0.5) * 5))) });
  }
  const roles = ["family", "family", "guardian", "elder", "caregiver"];
  const leads: PilotLead[] = Array.from({ length: 41 }, (_, i) => ({ at: "", role: roles[Math.floor(r() * roles.length)], state: ["Michigan", "Ohio", "Texas", "Arizona"][i % 4], hasPro: r() > 0.45 }));
  const circles = 24;
  const weeks = [0.71, 0.78, 0.83, 0.86, 0.88, 0.9];
  const ack = [7.5, 6.8, 6.1, 5.4, 5.2, 4.9];
  return { nps, leads, circles, weeks, ack, doseConfirm: 0.91, checkin: 0.87 };
}

function Bars({ rows, max = 100, fmt = (v: number) => `${v}` }: { rows: { label: string; value: number | null; n: number }[]; max?: number; fmt?: (v: number) => string }) {
  return (
    <div className="bars" role="list">
      {rows.map((row) => (
        <div key={row.label} className="bar-row" role="listitem" aria-label={`${row.label}: ${row.n < MIN_COHORT || row.value === null ? "hidden, fewer than 5 responses" : fmt(row.value)}`}>
          <span>{row.label}</span>
          {row.n < MIN_COHORT || row.value === null ? (
            <span className="tiny">Fewer than {MIN_COHORT} — hidden</span>
          ) : (
            <span className="bar-track"><span className={`bar-fill ${row.value < 0 ? "neg" : ""}`} style={{ width: `${Math.min(100, (Math.abs(row.value) / max) * 100)}%`, display: "block" }} /></span>
          )}
          <b style={{ textAlign: "right" }}>{row.n < MIN_COHORT || row.value === null ? "—" : fmt(row.value)}</b>
        </div>
      ))}
    </div>
  );
}

/** CC-77: pilot success dashboard. Aggregates only; nothing here can identify a person or show health details. */
export default function PilotDashboard() {
  const [source, setSource] = useState<"synthetic" | "this-device">("synthetic");
  const syn = useMemo(synthetic, []);
  const nps = source === "synthetic" ? syn.nps : npsResponses();
  const leads = source === "synthetic" ? syn.leads : pilotLeads();
  const byPersona = (["elder", "caregiver", "guardian"] as const).map((p) => {
    const rs = nps.filter((r) => r.persona === p);
    return { label: p === "elder" ? "Elders" : p === "caregiver" ? "Caregivers" : "Guardians", value: npsScore(rs), n: rs.length };
  });
  const roleLabel: Record<string, string> = { elder: "Older adults", family: "Family", guardian: "Guardians", caregiver: "Caregivers" };
  const byRole = Object.keys(roleLabel).map((k) => ({ label: roleLabel[k], value: leads.filter((l) => l.role === k).length, n: leads.filter((l) => l.role === k).length }));
  const maxRole = Math.max(1, ...byRole.map((r) => r.value));
  const overall = nps.length >= MIN_COHORT ? npsScore(nps) : null;

  return (
    <div className="internal">
      <header className="internal-top">
        <Link to="/app" className="row" style={{ "--gap": "8px" } as React.CSSProperties}><ArrowLeft size={18} /> Demo</Link>
        <span className="row" style={{ "--gap": "8px" } as React.CSSProperties}><Logo size={22} /><b>Pilot dashboard</b></span>
        <span className="badge">Internal</span>
      </header>
      <main className="page stack" style={{ "--gap": "22px" } as React.CSSProperties}>
        <div className="row between wrap">
          <div><p className="page-kicker">Pilot program</p><h1>Is Circle Care working?</h1></div>
          <Segmented label="Data source" value={source} onChange={setSource} options={[{ value: "synthetic", label: "Sample cohort" }, { value: "this-device", label: "This device" }]} />
        </div>
        <p className="panel flat small row" style={{ "--gap": "10px", alignItems: "flex-start" } as React.CSSProperties}><Info size={18} style={{ flex: "none", marginTop: 2 }} />
          {source === "synthetic" ? "Sample cohort: invented, de-identified numbers used to design this dashboard before the real pilot starts. Not real results." : "Responses and sign-ups made in this browser. Shown in aggregate only."} Any group with fewer than {MIN_COHORT} people is hidden.</p>

        <section className="kpis" aria-label="Headline numbers">
          <div className="kpi"><span className="tiny">Net Promoter Score</span><b>{overall ?? "—"}</b><span className="tiny">{nps.length} responses</span></div>
          <div className="kpi"><span className="tiny">Pilot sign-ups</span><b>{leads.length}</b><span className="tiny">{leads.filter((l) => l.hasPro).length} with a paid caregiver</span></div>
          {source === "synthetic" && <>
            <div className="kpi"><span className="tiny">Active circles</span><b>{syn.circles}</b><span className="tiny">{Math.round(syn.weeks[syn.weeks.length - 1] * 100)}% active this week</span></div>
            <div className="kpi"><span className="tiny">Doses confirmed</span><b>{Math.round(syn.doseConfirm * 100)}%</b><span className="tiny">Goal 90%</span></div>
            <div className="kpi"><span className="tiny">Daily check-ins</span><b>{Math.round(syn.checkin * 100)}%</b><span className="tiny">of days</span></div>
            <div className="kpi"><span className="tiny">Alert answered in</span><b>{syn.ack[syn.ack.length - 1]} min</b><span className="tiny">median, goal under 10</span></div>
          </>}
        </section>

        <section className="panel stack">
          <h2 className="section-title">NPS by person</h2>
          <Bars rows={byPersona} fmt={(v) => `${v}`} />
          <p className="tiny">NPS = % who'd strongly recommend (9–10) minus % who wouldn't (0–6). Ranges from −100 to 100.</p>
        </section>

        <section className="panel stack">
          <h2 className="section-title">Sign-ups by role</h2>
          <Bars rows={byRole} max={maxRole} />
        </section>

        {source === "synthetic" && (
          <section className="panel stack">
            <h2 className="section-title">Weekly active circles</h2>
            <Bars rows={syn.weeks.map((w, i) => ({ label: `Week ${i + 1}`, value: Math.round(w * 100), n: syn.circles }))} fmt={(v) => `${v}%`} />
          </section>
        )}
        <p className="tiny">Feedback text is scrubbed of health terms and never shown here. Pilot data is stored apart from care data and deleted 12 months after the pilot ends.</p>
      </main>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MessageCircle, Gift, ShieldCheck, Check } from "lucide-react";
import { SitePage, PageHero } from "../../components/Site";
import { Photo } from "../../components/ui";
import { addPilotLead } from "../../lib/pilot";

/** CC-74: pilot recruitment page with an interest form and plain-language pilot consent. */
export default function Pilot() {
  const [sent, setSent] = useState(false);
  const [f, setF] = useState({ name: "", contact: "", role: "family", state: "", hasPro: "no", consent: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  return (
    <SitePage>
      <PageHero kicker="Join the pilot" title="Help us build this with your family." lede="We're inviting 15 to 25 care circles to use Circle Care for eight weeks next summer and tell us what works — and what doesn't." />
      <section className="lp-wrap split" style={{ paddingBottom: 96, alignItems: "start" }}>
        <div className="copy-stack">
          <Photo k="couple" w={1200} className="split-img" />
          <ul className="checklist" style={{ marginTop: 8 }}>
            <li><CalendarDays size={22} color="var(--blue)" /><span><b>Eight weeks, starting May 2027.</b> Use the app in your normal routine.</span></li>
            <li><MessageCircle size={22} color="var(--blue)" /><span><b>A 30-minute setup call</b>, two short check-ins, and a final conversation.</span></li>
            <li><Gift size={22} color="var(--blue)" /><span><b>Free for life</b> for pilot families, plus a thank-you gift card.</span></li>
            <li><ShieldCheck size={22} color="var(--blue)" /><span><b>You can leave anytime.</b> Your data is deleted when you do. We never use it for anything but improving Circle Care.</span></li>
          </ul>
        </div>
        {sent ? (
          <div className="pilot-form center" role="status">
            <Check size={48} color="var(--green)" style={{ margin: "0 auto" }} />
            <h2 className="t-md">Thank you, {f.name.split(" ")[0]}.</h2>
            <p className="muted">We'll reach out within two weeks to talk about whether the pilot is a good fit for your family.</p>
            <Link to="/app" className="btn" style={{ alignSelf: "center" }}>Explore the demo meanwhile</Link>
          </div>
        ) : (
          <form className="pilot-form" onSubmit={(e) => { e.preventDefault(); addPilotLead({ role: f.role, state: f.state, hasPro: f.hasPro === "yes" }); setSent(true); }}>
            <h2 className="t-md">Tell us about your circle</h2>
            <div className="field"><label htmlFor="p-name">Your name</label><input id="p-name" className="input" required value={f.name} onChange={set("name")} autoComplete="name" /></div>
            <div className="field"><label htmlFor="p-contact">Email or phone</label><input id="p-contact" className="input" required value={f.contact} onChange={set("contact")} /></div>
            <div className="field">
              <label htmlFor="p-role">You are…</label>
              <select id="p-role" className="input" value={f.role} onChange={set("role")}>
                <option value="elder">An older adult who'd like support</option>
                <option value="family">A family member who helps</option>
                <option value="guardian">A legal guardian or power of attorney</option>
                <option value="caregiver">A professional caregiver</option>
              </select>
            </div>
            <div className="field"><label htmlFor="p-state">State</label><input id="p-state" className="input" value={f.state} onChange={set("state")} placeholder="e.g. Michigan" /></div>
            <div className="field">
              <label htmlFor="p-pro">Does a professional caregiver visit?</label>
              <select id="p-pro" className="input" value={f.hasPro} onChange={set("hasPro")}><option value="no">No</option><option value="yes">Yes</option></select>
            </div>
            <label className="row" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" required checked={f.consent} onChange={set("consent")} style={{ width: 22, height: 22, marginTop: 2 }} />
              <span className="small">I agree to be contacted about the pilot. Please don't include any health information here.</span>
            </label>
            <button className="btn lg block" disabled={!f.consent}>Send</button>
            <p className="tiny">Demo: your answers stay in this browser. Only your role, state and whether a caregiver visits are kept, for the pilot dashboard.</p>
          </form>
        )}
      </section>
    </SitePage>
  );
}

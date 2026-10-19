import { Link } from "react-router-dom";
import { Eye, PauseCircle, FileCheck2, Lock, KeyRound, ScrollText, BellOff, Download, Ban } from "lucide-react";
import { SitePage, PageHero } from "../../components/Site";

const pillars = [
  { icon: Eye, title: "The elder sees who sees her", body: "A plain-language list of everyone in the circle and what they can see — and a log of every time anyone looked." },
  { icon: Lock, title: "Minimum necessary", body: "Professional caregivers see today's plan only during their shifts. Notes can be shared with everyone or with the guardian only." },
  { icon: FileCheck2, title: "Guardians are verified", body: "Power-of-attorney or guardianship papers are reviewed before anyone gets guardian permissions." },
  { icon: PauseCircle, title: "Pause anytime", body: "One switch stops sharing with family and caregivers. Emergency alerts keep working." },
  { icon: KeyRound, title: "Encrypted everywhere", body: "Information is encrypted on the device and in transit. In the full product, it's also encrypted at rest with managed keys." },
  { icon: ScrollText, title: "Tamper-evident history", body: "Every view and change is recorded in a chained log that shows if an entry was ever altered." },
  { icon: BellOff, title: "Quiet lock screens", body: "Notifications say “You have a reminder from Circle Care” — never a medicine, a condition or a note." },
  { icon: Download, title: "Take it with you", body: "Download everything, or close the circle and delete it." },
];

const never = [
  "Sell or share health information with advertisers",
  "Put medicine names or conditions in notifications or emails",
  "Let a caregiver see records outside their shift",
  "Give guardian access before legal documents are verified",
  "Use analytics that can identify a person",
  "Keep data after the circle is closed, beyond what the law requires",
];

const faqs = [
  { q: "Is Circle Care HIPAA compliant?", a: "Circle Care is designed to the HIPAA standard — the Privacy, Security and Breach Notification Rules — even where HIPAA doesn't legally apply. Apps families use directly are usually covered by the FTC Health Breach Notification Rule and state health-privacy laws instead. When we work with home care agencies, we sign business associate agreements and HIPAA applies directly." },
  { q: "Who can see Mom's medicines?", a: "Mom, her verified legal guardian, family members she approves, and professional caregivers — but caregivers only during their shifts. Mom can see the whole list in her Privacy Center." },
  { q: "What happens if she pauses sharing?", a: "Family and caregivers stop seeing new information. SOS alerts still go out. Her legal guardian keeps access because the law gives them that authority, and is told sharing is paused." },
  { q: "Can I delete everything?", a: "Yes. The elder or guardian can download all of the circle's data or close the circle. Data is deleted within 30 days; a minimal access log is kept only as long as the law requires." },
  { q: "What about this demo?", a: "The demo uses fictional people. Everything you do stays in your browser and is encrypted there — nothing is sent to a server." },
];

export default function Privacy() {
  return (
    <SitePage>
      <PageHero kicker="Privacy" title="Her data. Her decision." lede="Health information is some of the most personal information there is. Circle Care is built so the person it's about stays in control of it." />
      <section className="lp-wrap" style={{ paddingBottom: 96 }}>
        <div className="feat-grid">
          {pillars.map((p) => (
            <article key={p.title} className="feat">
              <span className="feat-icon" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><p.icon size={22} /></span>
              <h3>{p.title}</h3>
              <p className="muted">{p.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="sub-band mist">
        <div className="lp-wrap">
          <h2 className="t-lg center balance">Things we will never do.</h2>
          <div className="never">
            {never.map((n) => <div key={n}><Ban size={20} color="var(--red)" style={{ flex: "none", marginTop: 2 }} /><span>{n}</span></div>)}
          </div>
        </div>
      </section>
      <section className="sub-band">
        <div className="lp-wrap">
          <h2 className="t-lg center">Questions families ask.</h2>
          <div className="faq">
            {faqs.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
          <div className="center" style={{ marginTop: 40 }}><Link to="/app" className="btn lg">See the Privacy Center in the demo</Link></div>
        </div>
      </section>
    </SitePage>
  );
}

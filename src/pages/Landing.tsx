import { Link } from "react-router-dom";
import { Pill, Siren, Sun, CalendarClock, ShieldCheck, BarChart3, Lock, Eye, FileCheck2, PauseCircle, Bell, ChevronRight } from "lucide-react";
import { Photo } from "../components/ui";
import { Logo } from "../components/Logo";
import { SiteNav, SiteFooter } from "../components/Site";
import "./landing.css";

export default function Landing() {
  return (
    <div className="lp">
      <SiteNav />

      <header className="lp-hero">
        <h1 className="t-hero balance">Care, in one circle.</h1>
        <p className="lede balance lp-hero-lede">
          Circle Care keeps an older adult, their caregivers and their legal guardian on the same page — with the elder in charge of who sees what.
        </p>
        <div className="row lp-cta" style={{ justifyContent: "center" }}>
          <Link to="/app" className="btn lg">Try the demo</Link>
          <Link to="/how-it-works" className="btn lg ghost">See how it works <ChevronRight size={20} /></Link>
        </div>

        <figure className="orbit" aria-label="Maggie at the center of her care circle, with her caregiver and her daughter around her">
          <div className="orbit-ring" aria-hidden="true" />
          <div className="orbit-center">
            <Photo k="elder" w={900} eager />
          </div>
          <div className="orbit-node n-care">
            <Photo k="caregiver" w={400} eager />
            <span className="orbit-label"><b>Ana</b> Home care aide</span>
          </div>
          <div className="orbit-node n-guard">
            <Photo k="family" w={400} eager />
            <span className="orbit-label"><b>Sarah</b> Daughter, legal guardian</span>
          </div>
          <div className="orbit-node n-fam">
            <Photo k="laughing" w={400} eager />
            <span className="orbit-label"><b>James</b> Grandson, weekends</span>
          </div>
          <figcaption className="orbit-caption"><b>Maggie, 80.</b> Still lives at home. Still makes her own decisions.</figcaption>
        </figure>
      </header>

      <section className="lp-section">
        <div className="lp-wrap">
          <h2 className="t-xl center balance">Three people. One plan.</h2>
          <p className="lede center balance lp-sub">Everyone sees exactly what they need to help — and nothing more.</p>
          <p className="center" style={{ marginTop: 14 }}><Link to="/who-its-for" className="more-link">Meet the people <ChevronRight size={18} /></Link></p>
          <div className="people">
            <article className="person" style={{ "--tone": "var(--elder)", "--tone-soft": "var(--elder-soft)" } as React.CSSProperties}>
              <Photo k="elderPortrait" w={800} className="person-img" />
              <div className="person-body">
                <span className="person-role">For the elder</span>
                <h3 className="t-md">Three buttons. That's it.</h3>
                <p className="muted">What's next, SOS and Call my person. Big type, spoken reminders and a privacy screen that's always one tap away.</p>
              </div>
            </article>
            <article className="person" style={{ "--tone": "var(--care)", "--tone-soft": "var(--care-soft)" } as React.CSSProperties}>
              <Photo k="caregiverTalk" w={800} className="person-img" />
              <div className="person-body">
                <span className="person-role">For caregivers</span>
                <h3 className="t-md">Know what this shift needs.</h3>
                <p className="muted">Check in, see today's doses and tasks in order, and hand off with a note that writes itself from what you did.</p>
              </div>
            </article>
            <article className="person" style={{ "--tone": "var(--guard)", "--tone-soft": "var(--guard-soft)" } as React.CSSProperties}>
              <Photo k="family" w={800} className="person-img" />
              <div className="person-body">
                <span className="person-role">For the guardian</span>
                <h3 className="t-md">Peace of mind, at a glance.</h3>
                <p className="muted">Today's status in seconds, approvals for the decisions that matter, and a weekly digest of how things are going.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section lp-mist">
        <div className="lp-wrap showcase">
          <div className="showcase-copy">
            <h2 className="t-xl balance">Designed for 81, not 21.</h2>
            <p className="lede">Maggie's home screen shows one thing at a time. Text is large, buttons are big, and reminders can be read aloud — on her phone, never on a server.</p>
            <ul className="ticks">
              <li>Text up to 200%, high-contrast mode</li>
              <li>Hold-to-send SOS with a 10-second cancel</li>
              <li>A daily “I'm OK” instead of a daily phone call</li>
            </ul>
          </div>
          <div className="phone" aria-label="Preview of the elder's home screen">
            <div className="phone-screen">
              <div className="ph-top"><span>9:41</span><span className="ph-island" /><span className="ph-batt" /></div>
              <p className="ph-hello">Good morning,<br />Maggie</p>
              <div className="ph-card ph-next">
                <div className="ph-pill" />
                <div>
                  <p className="ph-k">Up next · 12:30 PM</p>
                  <p className="ph-v">Vitamin D3</p>
                  <p className="ph-s">1 softgel with lunch</p>
                </div>
              </div>
              <div className="ph-card ph-sos">SOS</div>
              <div className="ph-card ph-call"><span className="ph-av" />Call Sarah</div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <h2 className="t-xl center balance">Everything a day of care needs.</h2>
          <p className="center" style={{ marginTop: 14 }}><Link to="/features" className="more-link">See all features <ChevronRight size={18} /></Link></p>
          <div className="bento">
            <article className="tile tile-wide tile-photo">
              <Photo k="walker" w={1400} className="tile-bg" />
              <div className="tile-copy on-photo">
                <h3 className="t-lg">Every dose, confirmed.</h3>
                <p>Reminders for Maggie, check-offs for Ana, and an alert to Sarah only if a dose goes unconfirmed.</p>
              </div>
            </article>
            <article className="tile" style={{ background: "var(--red-soft)" }}>
              <Siren size={34} color="var(--red)" />
              <h3 className="t-md">SOS that keeps asking until someone answers.</h3>
              <p className="muted">Alerts go down the family's list every two minutes until someone taps “I'm on my way.”</p>
            </article>
            <article className="tile" style={{ background: "var(--elder-soft)" }}>
              <Sun size={34} color="var(--elder)" />
              <h3 className="t-md">A daily “I'm OK.”</h3>
              <p className="muted">One tap each morning. If it doesn't come, Sarah knows to call.</p>
            </article>
            <article className="tile" style={{ background: "var(--care-soft)" }}>
              <CalendarClock size={34} color="var(--care)" />
              <h3 className="t-md">Shifts without gaps.</h3>
              <p className="muted">Recurring shifts, swaps with approval, verified check-ins, and a heads-up when nobody's covering Wednesday evening.</p>
            </article>
            <article className="tile" style={{ background: "var(--guard-soft)" }}>
              <ShieldCheck size={34} color="var(--guard)" />
              <h3 className="t-md">Big decisions go to the guardian.</h3>
              <p className="muted">Medication changes and new members need Sarah's approval — and Maggie sees every decision made about her.</p>
            </article>
            <article className="tile tile-wide" style={{ background: "linear-gradient(135deg, #f2f7ff, #f6f2ff)" }}>
              <div className="row wrap" style={{ alignItems: "flex-start", gap: 28 }}>
                <BarChart3 size={34} color="var(--blue)" />
                <div className="grow" style={{ minWidth: 240 }}>
                  <h3 className="t-lg">The week, in one look.</h3>
                  <p className="muted" style={{ marginTop: 8 }}>Every Sunday Sarah gets a digest: doses taken, visits completed, check-in streak. The email itself never names a medication.</p>
                </div>
                <div className="mini-bars" aria-hidden="true">
                  {[92, 100, 83, 100, 100, 96, 100].map((v, i) => <span key={i} style={{ height: `${v}%` }} />)}
                </div>
              </div>
            </article>
            <article className="tile">
              <Pill size={34} color="var(--blue)" />
              <h3 className="t-md">Hand-offs that write themselves.</h3>
              <p className="muted">At check-out, Ana's note is drafted from what she checked off. She reviews, adds a line, and sends.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section lp-mist">
        <div className="lp-wrap">
          <h2 className="t-xl center balance">Her data. Her decision.</h2>
          <p className="lede center balance lp-sub">Circle Care is designed to the HIPAA standard — and built around the elder, not the app.</p>
          <p className="center" style={{ marginTop: 14 }}><Link to="/privacy" className="more-link">How we protect Maggie's data <ChevronRight size={18} /></Link></p>
          <div className="privacy">
            <div className="lock" aria-label="Example lock-screen notification that contains no health details">
              <div className="lock-time">9:41</div>
              <div className="lock-date">Monday, October 19</div>
              <div className="lock-note">
                <Logo size={30} />
                <div><b>Circle Care</b><p>You have a reminder from Circle Care</p></div>
                <span className="tiny">now</span>
              </div>
              <p className="lock-cap">No medication names on the lock screen. Ever.</p>
            </div>
            <ul className="principles">
              <li><Eye /><div><b>See who sees you.</b><p className="muted">Maggie's Privacy Center lists everyone in her circle and every time they looked at her records.</p></div></li>
              <li><PauseCircle /><div><b>Pause sharing anytime.</b><p className="muted">One switch pauses everything except emergencies.</p></div></li>
              <li><FileCheck2 /><div><b>Guardians are verified.</b><p className="muted">Power-of-attorney papers are checked before anyone gets guardian access.</p></div></li>
              <li><Lock /><div><b>Minimum necessary.</b><p className="muted">A caregiver sees today's plan during their shift — not a medical history.</p></div></li>
              <li><Bell /><div><b>Every access is logged.</b><p className="muted">Who viewed or changed what, and when — kept for six years.</p></div></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-closing">
        <Photo k="coupleOutdoors" w={2000} className="closing-bg" />
        <div className="closing-copy">
          <h2 className="t-xl balance">Stay home. Stay connected. Stay in charge.</h2>
          <Link to="/app" className="btn lg" style={{ marginTop: 28 }}>Try the demo</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Bell, Home, Pill, CheckCircle2, Users, CalendarDays, Activity, BarChart3, StickyNote, Shield, Settings, MoreHorizontal, IdCard, Siren, Lock, ScanFace, PauseCircle, ChevronDown, HeartPulse, CalendarHeart, MessageCircleHeart, HandHeart, type LucideIcon,
  HousePlus, ListChecks, Phone, Heart, Plane, NotebookPen,
} from "lucide-react";
import { useStore } from "../data/store";
import { activeSos, alertsFor, alertLink, member, meId, nameOf, pendingApprovals, unreadCount, clock } from "../data/selectors";
import type { Persona, Alert } from "../data/types";
import { Avatar, Sheet } from "./ui";
import { Logo } from "./Logo";
import PersonaSheet from "./PersonaSheet";
import { PrivacyShield, WelcomeTour, NpsCard } from "./Extras";
import { fmtTime } from "../lib/time";
import { inChat, unreadChat } from "../data/everyday";
import { coverView } from "../data/away";
import "./shell.css";

type NavItem = { to: string; label: string; icon: LucideIcon; badge?: number; tab?: boolean };

export default function AppShell({ persona }: { persona: Persona }) {
  const { state, actions } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const [switcher, setSwitcher] = useState(false);
  const [more, setMore] = useState(false);
  const [locked, setLocked] = useState(false);
  const me = member(state, meId(persona));
  const sos = activeSos(state);

  useEffect(() => { if (state.persona !== persona) actions.setPersona(persona); }, [persona, state.persona, actions]);

  const [npsNow, setNpsNow] = useState(false);
  useEffect(() => {
    const show = () => setNpsNow(true);
    window.addEventListener("cc:nps", show);
    return () => window.removeEventListener("cc:nps", show);
  }, []);

  // Session timeout (CC-14): lock after inactivity. Caregiver & guardian always;
  // the elder app only if she (or Sarah, with her) turns it on.
  const lockMin = persona === "elder" ? state.settings.elderLockMin : state.settings.sessionLockMin;
  useEffect(() => {
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => { if (lockMin > 0 && Date.now() - last > lockMin * 60000) setLocked(true); }, 15000);
    const lockNow = () => setLocked(true);
    window.addEventListener("cc:lock", lockNow);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); window.removeEventListener("cc:lock", lockNow); };
  }, [persona, lockMin]);

  // Notification banners for alerts that arrive while the app is open.
  // Only alerts created after this screen opened get a banner; older ones live in Alerts.
  const seen = useRef<Set<string>>(new Set());
  const openedAt = useRef(clock(state).getTime());
  const [banner, setBanner] = useState<Alert | null>(null);
  useEffect(() => {
    const mine = alertsFor(state, persona);
    const fresh = mine.find((a) => !seen.current.has(a.id) && new Date(a.at).getTime() >= openedAt.current - 1000);
    mine.forEach((a) => seen.current.add(a.id));
    if (fresh) setBanner(fresh);
  }, [state, persona]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 7000);
    return () => clearTimeout(t);
  }, [banner]);

  if (!state.signedIn[persona]) return <Navigate to={`/app/sign-in/${persona}`} replace />;

  const items: NavItem[] =
    persona === "guardian"
      ? [
          { to: "/app/guardian", label: "Home", icon: Home, tab: true },
          { to: "/app/guardian/health", label: "Health", icon: HeartPulse, tab: true },
          { to: "/app/guardian/calendar", label: "Calendar", icon: CalendarHeart, tab: true },
          { to: "/app/guardian/chat", label: "Chat", icon: MessageCircleHeart, badge: unreadChat(state, meId("guardian")), tab: true },
          { to: "/app/guardian/approvals", label: "Approvals", icon: CheckCircle2, badge: pendingApprovals(state).length, tab: true },
          { to: "/app/guardian/meds", label: "Medications", icon: Pill },
          { to: "/app/guardian/schedule", label: "Shift schedule", icon: CalendarDays },
          { to: "/app/guardian/circle", label: "Care circle", icon: Users },
          { to: "/app/guardian/feed", label: "Activity", icon: Activity },
          { to: "/app/guardian/digest", label: "Weekly digest", icon: BarChart3 },
          { to: "/app/guardian/help", label: "Help board", icon: HandHeart },
          { to: "/app/guardian/coming-home", label: "Coming home", icon: HousePlus },
          { to: "/app/guardian/questions", label: "Visit questions", icon: ListChecks },
          { to: "/app/guardian/calls", label: "Call log", icon: Phone },
          { to: "/app/guardian/about-me", label: "What matters to Maggie", icon: Heart },
          // CC-138: notes on Maggie's home.
          { to: "/app/guardian/memory-aids", label: "Memory aids", icon: NotebookPen },
          // CC-229: Sarah's away dates and who covers.
          { to: "/app/guardian/away", label: "Away mode", icon: Plane },
          { to: "/app/guardian/notes", label: "Notes & documents", icon: StickyNote },
          { to: "/app/guardian/card", label: "Emergency card", icon: IdCard },
          { to: "/app/guardian/privacy", label: "Privacy Center", icon: Shield },
          { to: "/app/guardian/settings", label: "Settings", icon: Settings },
        ]
      : persona === "caregiver"
        ? [
            { to: "/app/caregiver", label: "Today", icon: Home, tab: true },
            { to: "/app/caregiver/schedule", label: "Schedule", icon: CalendarDays, tab: true },
            { to: "/app/caregiver/notes", label: "Notes", icon: StickyNote, tab: true },
            { to: "/app/caregiver/card", label: "Emergency card", icon: IdCard, tab: true },
            // CC-165: Ana gets a Chat tab only once Maggie or Sarah adds her.
            ...(inChat(state, meId("caregiver")) ? [{ to: "/app/caregiver/chat", label: "Chat", icon: MessageCircleHeart, badge: unreadChat(state, meId("caregiver")), tab: true }] : []),
            // CC-209: the Help board, under More.
            { to: "/app/caregiver/help", label: "Help board", icon: HandHeart },
            // CC-217: the visit question list, while on shift.
            { to: "/app/caregiver/questions", label: "Visit questions", icon: ListChecks },
            // CC-219, CC-226: during shifts, what Maggie shares with Ana.
            { to: "/app/caregiver/about-me", label: "What matters to Maggie", icon: Heart },
            { to: "/app/caregiver/calls", label: "Call log", icon: Phone },
            { to: "/app/caregiver/memory-aids", label: "Memory aids", icon: NotebookPen },
          ]
        : persona === "family"
          ? [
              { to: "/app/family", label: "Help", icon: HandHeart, tab: true },
              { to: "/app/family/chat", label: "Chat", icon: MessageCircleHeart, badge: unreadChat(state, meId("family")), tab: true },
              { to: "/app/family/questions", label: "Questions", icon: ListChecks, tab: true },
              { to: "/app/family/card", label: "Emergency card", icon: IdCard, tab: true },
              { to: "/app/family/about-me", label: "What matters to Maggie", icon: Heart },
              { to: "/app/family/calls", label: "Call log", icon: Phone },
              { to: "/app/family/memory-aids", label: "Memory aids", icon: NotebookPen },
              // CC-229: when Sarah asks someone to cover for her.
              ...(coverView(state, meId("family")) ? [{ to: "/app/family/away", label: "Covering for Sarah", icon: Plane }] : []),
            ]
          : [];

  const tabs = items.filter((i) => i.tab);
  const extra = items.filter((i) => !i.tab);
  const paused = state.settings.sharingPaused && persona === "caregiver" && !loc.pathname.endsWith("/sos");
  const elderStyle = persona === "elder" ? ({ "--text-base": state.settings.textSize === "large" ? "19px" : state.settings.textSize === "xl" ? "22px" : "26px" } as CSSProperties) : undefined;
  const unread = unreadCount(state, persona);

  return (
    <div className={`app app-${persona} ${persona === "elder" && state.settings.highContrast ? "hc" : ""} ${items.length ? "has-nav" : ""}`} style={elderStyle}>
      <header className="app-top">
        <Link to={persona === "elder" ? "/app/elder" : `/app/${persona}`} className="app-brand" aria-label="Circle Care home"><Logo size={26} /><span>Circle Care</span></Link>
        <div className="row" style={{ "--gap": "8px" } as CSSProperties}>
          <button className="demo-pill" onClick={() => setSwitcher(true)} aria-label={`Demo mode. Viewing as ${me?.short}. Switch person`}>
            <span className="demo-dot" /> Demo · {me?.short} <ChevronDown size={16} />
          </button>
          {persona !== "elder" && (
            <NavLink to={`/app/${persona}/alerts`} className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell size={22} />
              {unread > 0 && <span className="dot-count">{unread}</span>}
            </NavLink>
          )}
        </div>
      </header>

      {items.length > 0 && (
        <aside className="app-side" aria-label="Sections">
          <div className="side-me"><Avatar m={me} size={40} /><div><b>{me?.name}</b><span className="tiny" style={{ display: "block" }}>{me?.relation}</span></div></div>
          <nav className="side-nav">
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} end className="side-link">
                <i.icon size={20} /> <span className="grow">{i.label}</span>
                {!!i.badge && <span className="side-badge">{i.badge}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>
      )}

      <main className="app-main" id="main">
        {sos && persona !== "elder" && !loc.pathname.endsWith("/sos") && (
          <button className="sos-bar" onClick={() => nav(`/app/${persona}/sos`)}>
            <Siren size={22} />
            <span className="grow"><b>{sos.status === "active" ? "Maggie pressed SOS" : `${nameOf(state, sos.responderId)} is responding to Maggie's SOS`}</b> <span className="sos-time">at {fmtTime(sos.startedAt)}</span></span>
            <span className="sos-cta">{sos.status === "active" ? "Respond" : "View"}</span>
          </button>
        )}
        {state.settings.sharingPaused && persona === "guardian" && (
          <div className="info-bar"><PauseCircle size={20} /> Maggie has paused sharing. You still have access as her legal guardian; other members only receive emergency alerts.</div>
        )}
        {!paused && (npsNow || loc.pathname === `/app/${persona}`) && <div className="page narrow" style={{ paddingBottom: 0 }}><NpsCard persona={persona} force={npsNow} onDone={() => setNpsNow(false)} /></div>}
        {paused ? <PausedScreen /> : <Outlet />}
      </main>

      {tabs.length > 0 && (
        <nav className="tabbar" aria-label="Tabs">
          {tabs.map((i) => (
            <NavLink key={i.to} to={i.to} end className="tab">
              <span className="tab-icon"><i.icon size={24} />{!!i.badge && <span className="dot-count sm">{i.badge}</span>}</span>
              <span>{i.label === "Medications" ? "Meds" : i.label === "Emergency card" ? "Card" : i.label}</span>
            </NavLink>
          ))}
          {extra.length > 0 && (
            <button className="tab" onClick={() => setMore(true)}><span className="tab-icon"><MoreHorizontal size={24} /></span><span>More</span></button>
          )}
        </nav>
      )}

      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="list">
            {extra.map((i) => (
              <button key={i.to} className="list-row has-icon" onClick={() => { setMore(false); nav(i.to); }}>
                <i.icon size={22} color="var(--blue)" /> <span className="list-title grow">{i.label}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {banner && (
        <div className="banner-stack" aria-live="assertive">
          <button className={`banner ${banner.severity === "critical" ? "critical" : ""}`} onClick={() => {
            setBanner(null);
            // /app/sos, /app/chat and /app/help open that page for whoever is signed in.
            const to = alertLink(persona, banner.link);
            nav(to ?? (persona === "elder" ? "/app/elder" : `/app/${persona}/alerts`));
          }}>
            <Logo size={34} />
            <span className="grow">
              <span className="row between"><b style={{ fontSize: 15 }}>Circle Care</b><span className="tiny">now</span></span>
              <span style={{ display: "block", fontSize: 15 }}>{banner.title}</span>
              <span className="tiny" style={{ display: "block", marginTop: 2 }}>Lock-screen text above has no health details. Tap to see more.</span>
            </span>
          </button>
        </div>
      )}

      {locked && (
        <div className="lock-screen" role="dialog" aria-modal="true" aria-label="Circle Care is locked">
          <Lock size={40} color="var(--blue)" />
          <h2 className="t-lg">Circle Care is locked</h2>
          <p className="muted center balance" style={{ maxWidth: 360 }}>We lock the app after {lockMin} minute{lockMin === 1 ? "" : "s"} without activity so others can't see {persona === "elder" ? "your" : "Maggie's"} information.</p>
          <button className="btn lg" onClick={() => setLocked(false)}><ScanFace size={22} /> Unlock with {persona === "elder" ? "your face" : "Face ID"}</button>
          <p className="tiny">Locked at {fmtTime(clock(state))}</p>
        </div>
      )}

      {switcher && <PersonaSheet onClose={() => setSwitcher(false)} />}
      {!switcher && !locked && <WelcomeTour persona={persona} />}
      <PrivacyShield />
    </div>
  );
}

function PausedScreen() {
  return (
    <div className="page center" style={{ paddingTop: 64 }}>
      <PauseCircle size={56} color="var(--elder)" style={{ margin: "0 auto" }} />
      <h1 className="t-lg" style={{ marginTop: 16 }}>Maggie has paused sharing</h1>
      <p className="lede balance" style={{ maxWidth: 480, margin: "12px auto 0" }}>You'll still get her SOS alerts right away. Everything else will come back when she turns sharing on again.</p>
    </div>
  );
}

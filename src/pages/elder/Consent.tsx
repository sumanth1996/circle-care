import { Volume2, Users, Eye, PauseCircle, Siren } from "lucide-react";
import { useStore } from "../../data/store";
import { useSpeech } from "../../components/ui";

const points = [
  { icon: Users, text: "You choose who is in your circle. You can remove people anytime." },
  { icon: Eye, text: "Each person only sees what they need to help you. You can see who looked at your information." },
  { icon: PauseCircle, text: "You can pause sharing with one switch. Emergency alerts still work." },
  { icon: Siren, text: "If you press SOS, we tell your family and caregivers right away." },
];

/** CC-22: plain-language consent with read-aloud. Version and time are stored. */
export default function Consent({ onDone, review }: { onDone: () => void; review?: boolean }) {
  const { state, actions } = useStore();
  const { supported, speak } = useSpeech();
  const all = "Here is how Circle Care works. " + points.map((p) => p.text).join(" ");
  return (
    <main className="auth" style={{ alignItems: "start" }}>
      <div className="auth-card" style={{ textAlign: "left", width: "min(560px,100%)" }}>
        <h1 className="t-lg">Here is how Circle Care works</h1>
        {supported && <button className="btn secondary lg" onClick={() => speak(all)} style={{ alignSelf: "flex-start" }}><Volume2 size={22} /> Read this to me</button>}
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="list-row has-icon" style={{ alignItems: "flex-start", padding: "18px" }}>
              <Icon size={28} color="var(--elder)" style={{ flex: "none", marginTop: 2 }} />
              <span style={{ fontSize: 20, lineHeight: 1.4 }}>{text}</span>
            </li>
          ))}
        </ul>
        {review ? (
          <>
            <p className="muted small">You agreed to version {state.settings.consent?.version} on {state.settings.consent && new Date(state.settings.consent.at).toLocaleDateString()}.</p>
            <button className="btn xl block" onClick={onDone}>Done</button>
          </>
        ) : (
          <>
            <button className="btn xl block" style={{ background: "var(--elder)" }} onClick={() => { actions.acceptConsent(); onDone(); }}>I understand and agree</button>
            <p className="hint">You can read this again anytime in Privacy.</p>
          </>
        )}
      </div>
    </main>
  );
}

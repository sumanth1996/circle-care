import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone } from "lucide-react";
import { useStore } from "../../data/store";
import { Avatar } from "../../components/ui";
import { activeAway } from "../../data/away";
import "./elder.css";

/** CC-69: one-tap call to up to three favorite people. */
export default function ElderCall() {
  const { state } = useStore();
  const nav = useNavigate();
  // CC-231: while Sarah is away, the person covering comes first.
  const cover = activeAway(state)?.backupId;
  const all = state.members.filter((m) => m.status === "active" && (m.favorite || m.id === cover));
  const favs = [...all.filter((m) => m.id === cover), ...all.filter((m) => m.id !== cover)].slice(0, 3);
  return (
    <div className="page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>
      <h1 style={{ fontSize: "1.8em" }}>Who would you like to call?</h1>
      <div className="call-grid">
        {favs.map((m) => (
          <a key={m.id} href={`tel:${m.phone.replace(/[^+\d]/g, "")}`} className="call-card" aria-label={`Call ${m.short}`}>
            <Avatar m={m} size={88} />
            <span><span style={{ display: "block" }}>{m.short}</span><span className="muted" style={{ fontSize: "0.6em", fontWeight: 500 }}>{m.id === cover ? "Covering for Sarah" : m.relation.split(" · ")[0]}</span></span>
            <span className="call-btn"><Phone size={30} /></span>
          </a>
        ))}
      </div>
    </div>
  );
}

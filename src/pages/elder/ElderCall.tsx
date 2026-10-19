import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone } from "lucide-react";
import { useStore } from "../../data/store";
import { Avatar } from "../../components/ui";
import "./elder.css";

/** CC-69: one-tap call to up to three favorite people. */
export default function ElderCall() {
  const { state } = useStore();
  const nav = useNavigate();
  const favs = state.members.filter((m) => m.favorite && m.status === "active").slice(0, 3);
  return (
    <div className="page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>
      <h1 style={{ fontSize: "1.8em" }}>Who would you like to call?</h1>
      <div className="call-grid">
        {favs.map((m) => (
          <a key={m.id} href={`tel:${m.phone.replace(/[^+\d]/g, "")}`} className="call-card" aria-label={`Call ${m.short}`}>
            <Avatar m={m} size={88} />
            <span><span style={{ display: "block" }}>{m.short}</span><span className="muted" style={{ fontSize: "0.6em", fontWeight: 500 }}>{m.relation.split(" · ")[0]}</span></span>
            <span className="call-btn"><Phone size={30} /></span>
          </a>
        ))}
      </div>
    </div>
  );
}

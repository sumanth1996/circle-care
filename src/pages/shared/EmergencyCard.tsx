import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, ShieldCheck, Pencil, QrCode } from "lucide-react";
import { useStore } from "../../data/store";
import { member } from "../../data/selectors";
import { Avatar, Sheet, useToast } from "../../components/ui";
import { fmtShortDay } from "../../lib/time";

/** CC-53: elder-approved emergency info card for first responders. Every view is logged. */
export default function EmergencyCard() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const card = state.settings.emergencyCard;
  const elder = member(state, state.elderId);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(card);
  const [qr, setQr] = useState(false);
  const isElder = state.persona === "elder";
  const canEdit = isElder || state.persona === "guardian";
  const meds = state.meds.filter((m) => !m.paused);

  useEffect(() => { actions.logView("the emergency card"); }, [actions]);

  return (
    <div className="page narrow stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      {isElder && <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>}
      <div className="page-head">
        <div><p className="page-kicker">For first responders</p><h1>Emergency card</h1></div>
        <div className="row">
          <button className="btn secondary sm" onClick={() => setQr(true)}><QrCode size={16} /> Lock-screen code</button>
          {canEdit && <button className="btn plain sm" onClick={() => { setForm(card); setEdit(true); }}><Pencil size={16} /> Edit</button>}
        </div>
      </div>

      <article className="panel stack" style={{ "--gap": "16px", borderTop: "6px solid var(--red)" } as React.CSSProperties}>
        <div className="row">
          <Avatar m={elder} size={72} />
          <div><h2 className="t-md">{elder?.name}</h2><p className="muted">Age 81 · Blood type {card.bloodType}</p></div>
        </div>
        <div className="grid-2">
          <div><p className="tiny">Allergies</p><p style={{ fontWeight: 700, color: "#d70015" }}>{card.allergies || "None known"}</p></div>
          <div><p className="tiny">Conditions</p><p style={{ fontWeight: 600 }}>{card.conditions}</p></div>
        </div>
        <div><p className="tiny">Current medicines</p><p>{meds.map((m) => `${m.name} ${m.strength}`).join(", ")}</p></div>
        <div><p className="tiny">Decisions</p><p>{card.directives}</p></div>
        <div className="list flat">
          {state.settings.escalation.slice(0, 2).map((id) => {
            const m = member(state, id);
            return <a key={id} href={`tel:${m?.phone.replace(/[^+\d]/g, "")}`} className="list-row"><Avatar m={m} size={36} /><span className="grow"><b>{m?.name}</b><span className="list-sub" style={{ display: "block" }}>{m?.relation.split(" · ")[0]}</span></span><Phone size={20} color="var(--green)" /></a>;
          })}
        </div>
        <p className="tiny">{card.approvedByElder ? <><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Approved by Maggie on {card.approvedAt && fmtShortDay(card.approvedAt)}</> : "Waiting for Maggie to approve"}</p>
      </article>

      {edit && (
        <Sheet title="Edit emergency card" onClose={() => setEdit(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); actions.settings({ emergencyCard: { ...form, approvedByElder: isElder, approvedAt: isElder ? new Date().toISOString() : undefined } }); setEdit(false); toast(isElder ? "Card updated" : "Sent to Maggie to approve"); }}>
            {(["allergies", "conditions", "directives", "bloodType"] as const).map((k) => (
              <div key={k} className="field">
                <label htmlFor={`ec-${k}`}>{{ allergies: "Allergies", conditions: "Conditions to share", directives: "Decisions and directives", bloodType: "Blood type" }[k]}</label>
                <input id={`ec-${k}`} className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            {!isElder && <p className="hint">Maggie must approve changes before they appear on her card.</p>}
            <button className="btn lg block">{isElder ? "Save" : "Send to Maggie"}</button>
          </form>
        </Sheet>
      )}
      {qr && (
        <Sheet title="Lock-screen code" onClose={() => setQr(false)}>
          <div className="stack center">
            <FakeQr />
            <p>Responders scan this code from Maggie's lock screen to open the card for <b>1 hour</b>. Each scan is added to the access log.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function FakeQr() {
  // Decorative placeholder pattern, not a real code.
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21, y = Math.floor(i / 21);
    const finder = (cx: number, cy: number) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7 && (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    if (finder(0, 0) || finder(14, 0) || finder(0, 14)) return true;
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false;
    return ((x * 7 + y * 13 + x * y) % 5) < 2;
  });
  return (
    <svg viewBox="0 0 21 21" width="200" height="200" style={{ margin: "0 auto", background: "#fff", padding: 8, borderRadius: 16 }} role="img" aria-label="Example lock-screen code">
      {cells.map((on, i) => on && <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1" fill="#1d1d1f" />)}
    </svg>
  );
}
